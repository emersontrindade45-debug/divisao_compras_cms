// Sem `import "server-only"` deliberadamente (CLAUDE.md §9.62): scripts/enriquecer-fornecedores-cnpj.ts
// precisa importar este módulo fora do bundler do Next, onde `server-only` sempre lança. Não é
// alcançável a partir de `components/` — só pelo script administrativo.
import { db } from "@/lib/db";
import { consultarDadosCadastraisCnpj } from "@/lib/integracoes/situacaoCadastralCnpj";
import { sugerirCategoriasParaObjeto } from "@/lib/ia/categorizarObjeto";
import { normalizarMunicipio, normalizarTexto } from "@/lib/domain/normalizarMunicipio";
import { processarComConcorrencia } from "@/lib/similaridade/processarComConcorrencia";

/**
 * Enriquecimento em lote (M26) de `Fornecedor` a partir do CNPJ já cadastrado — nunca busca por
 * nome. A chave é exata (CNPJ → dados da Receita via BrasilAPI), então não há o risco de
 * correspondência ambígua que existiria tentando achar CNPJ a partir só da razão social (por isso
 * fornecedor sem CNPJ nenhum fica de fora desta rotina, por decisão consciente — ver docs/PLAN.md M26).
 *
 * Cidade/Estado/Tag/E-mail/Telefone: só preenche campo VAZIO — nunca sobrescreve o que já está
 * cadastrado manualmente.
 * - Cidade/Estado: vêm do `municipio`/`uf` da BrasilAPI. Cidade é normalizada contra a grafia
 *   canônica de `CAMADAS_GEOGRAFICAS` (a BrasilAPI devolve município sem acento e em maiúsculas,
 *   ex. "SAO VICENTE" — sem normalizar, "São Vicente" nunca bateria na camada Baixada Santista).
 * - Tag: só quando o fornecedor não tem NENHUMA categoria ainda. Usa a mesma IA de
 *   `sugerirCategoriasParaObjeto` (M25) sobre a descrição do CNAE (principal + secundários) — escolhe
 *   só entre as Tags que já existem no cadastro real, nunca inventa uma nova (mesmo filtro
 *   defensivo do M25, CLAUDE.md §9.12).
 * - E-mail/Telefone: só quando o campo está vazio (`email === ""` / `telefone` nulo ou vazio) —
 *   decisão explícita do usuário em 2026-08-19: nunca substituir um contato já cadastrado.
 *   Telefone chega cru da API (dígitos) e é formatado aqui em `(DD) NNNN(N)-NNNN`.
 *
 * Razão social é a ÚNICA exceção à regra "nunca sobrescreve": é comparada (normalizada) contra o
 * valor da Receita e SUBSTITUÍDA quando diverge — decisão explícita do usuário em 2026-08-19. Isso
 * é seguro porque a chave é o CNPJ (exato, não fuzzy): a Receita é a fonte de verdade de qual razão
 * social pertence àquele CNPJ, ao contrário de Cidade/Estado/Tag, que podem refletir escolha
 * editorial de quem cadastrou. Por isso o alvo do enriquecimento passou a ser TODO fornecedor
 * ativo com CNPJ, não só quem está com campo vazio — só olhando o CNPJ é possível saber se a razão
 * social está errada.
 */

/** Compara razão social ignorando acento/caixa/espaçamento — mesma base de `normalizarTexto`. */
function normalizarRazaoSocial(s: string): string {
  return normalizarTexto(s).replace(/\s+/g, " ");
}

/** `ddd_telefone_1`/`_2` da BrasilAPI vêm como dígitos crus (DDD+número). Formato nacional; descarta o que não bate. */
function formatarTelefone(bruto: string): string | null {
  const digitos = bruto.replace(/\D/g, "");
  if (digitos.length === 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  if (digitos.length === 11) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  return null;
}

interface FornecedorParaEnriquecer {
  id: string;
  cnpj: string;
  razaoSocial: string;
  cidade: string;
  estado: string;
  categoria: string[];
  email: string;
  telefone: string | null;
}

export interface ResultadoEnriquecimentoCnpj {
  processados: number;
  cidadeEstadoPreenchidos: number;
  categoriaSugerida: number;
  emailPreenchido: number;
  telefonePreenchido: number;
  razaoSocialCorrigida: number;
  naoEncontradosNaApi: number;
  falhaTemporaria: number;
  semNadaParaFazer: number;
  erros: { fornecedorId: string; cnpj: string; motivo: string }[];
}

export async function enriquecerFornecedoresPorCnpj(opcoes: {
  limite?: number;
  concorrencia?: number;
  dryRun?: boolean;
} = {}): Promise<ResultadoEnriquecimentoCnpj> {
  // Baixado de 5 para 3 em 2026-08-19 (M26): rodagem anterior contra produção teve mais da metade
  // dos candidatos bucketados como "não encontrado", consistente com 429 esgotando as tentativas
  // sob concorrência alta — ver `MAX_TENTATIVAS` em situacaoCadastralCnpj.ts.
  const concorrencia = opcoes.concorrencia ?? 3;

  // Todo fornecedor ativo com CNPJ é candidato — não só quem tem campo vazio (ver docstring do
  // arquivo: razão social diverge de campo vazio, só a chamada à Receita revela isso).
  const candidatos = (await db.fornecedor.findMany({
    where: { status: "ativo", cnpj: { not: null } },
    select: {
      id: true,
      cnpj: true,
      razaoSocial: true,
      cidade: true,
      estado: true,
      categoria: true,
      email: true,
      telefone: true,
    },
    take: opcoes.limite,
  })) as FornecedorParaEnriquecer[];

  const fornecedoresAtivos = await db.fornecedor.findMany({
    where: { status: "ativo" },
    select: { categoria: true },
  });
  const categoriasDisponiveis = [...new Set(fornecedoresAtivos.flatMap((f) => f.categoria))];

  const resultado: ResultadoEnriquecimentoCnpj = {
    processados: 0,
    cidadeEstadoPreenchidos: 0,
    categoriaSugerida: 0,
    emailPreenchido: 0,
    telefonePreenchido: 0,
    razaoSocialCorrigida: 0,
    naoEncontradosNaApi: 0,
    falhaTemporaria: 0,
    semNadaParaFazer: 0,
    erros: [],
  };

  await processarComConcorrencia(
    candidatos,
    concorrencia,
    async (fornecedor) => {
      resultado.processados++;

      const consulta = await consultarDadosCadastraisCnpj(fornecedor.cnpj);
      if (!consulta.encontrado) {
        // Distingue 404 real (CNPJ não existe na Receita, não adianta tentar de novo) de falha
        // transitória (429/5xx/rede — motivo vem de buscarCnpjNaBrasilApi) para diagnóstico: uma
        // rodagem futura naturalmente reprocessa quem falhou, porque o campo continua vazio/divergente.
        if (consulta.motivo.includes("não encontrado")) {
          resultado.naoEncontradosNaApi++;
        } else {
          resultado.falhaTemporaria++;
        }
        return;
      }

      const dadosUpdate: {
        cidade?: string;
        estado?: string;
        categoria?: string[];
        email?: string;
        telefone?: string;
        razaoSocial?: string;
      } = {};

      const precisaCidadeEstado = fornecedor.cidade === "" && fornecedor.estado === "";
      if (precisaCidadeEstado && consulta.dados.municipio && consulta.dados.uf) {
        dadosUpdate.cidade = normalizarMunicipio(consulta.dados.municipio);
        dadosUpdate.estado = consulta.dados.uf;
      }

      if (fornecedor.categoria.length === 0 && consulta.dados.atividadesEconomicas.length > 0) {
        const sugeridas = await sugerirCategoriasParaObjeto(
          consulta.dados.atividadesEconomicas.join("; "),
          categoriasDisponiveis,
        );
        if (sugeridas.length > 0) dadosUpdate.categoria = sugeridas;
      }

      if (fornecedor.email === "" && consulta.dados.email) {
        dadosUpdate.email = consulta.dados.email.trim();
      }

      if (!fornecedor.telefone && consulta.dados.telefone) {
        const formatado = formatarTelefone(consulta.dados.telefone);
        if (formatado) dadosUpdate.telefone = formatado;
      }

      if (
        consulta.dados.razaoSocial &&
        normalizarRazaoSocial(fornecedor.razaoSocial) !== normalizarRazaoSocial(consulta.dados.razaoSocial)
      ) {
        dadosUpdate.razaoSocial = consulta.dados.razaoSocial;
      }

      if (Object.keys(dadosUpdate).length === 0) {
        resultado.semNadaParaFazer++;
        return;
      }

      if (dadosUpdate.cidade) resultado.cidadeEstadoPreenchidos++;
      if (dadosUpdate.categoria) resultado.categoriaSugerida++;
      if (dadosUpdate.email) resultado.emailPreenchido++;
      if (dadosUpdate.telefone) resultado.telefonePreenchido++;
      if (dadosUpdate.razaoSocial) resultado.razaoSocialCorrigida++;

      if (!opcoes.dryRun) {
        await db.fornecedor.update({ where: { id: fornecedor.id }, data: dadosUpdate });
      }
    },
    (fornecedor, erro) => {
      resultado.erros.push({
        fornecedorId: fornecedor.id,
        cnpj: fornecedor.cnpj,
        motivo: erro instanceof Error ? erro.message : String(erro),
      });
    },
  );

  return resultado;
}
