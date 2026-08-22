"use server";

import { dbCandidatos } from "@/lib/dbCandidatos";
import { requireAuth } from "@/lib/auth/rbac";
import { registrarAuditoria } from "@/lib/auth/audit";
import { sugerirCnaesParaObjeto, type ClasseCnae } from "@/lib/ia/sugerirCnaesParaObjeto";
import { ordenarCandidatosCotacao } from "@/lib/domain/ordenarCandidatosCotacao";
import {
  TETO_CANDIDATOS,
  type CandidatoSugerido,
  type ResultadoSugestaoCandidatos,
} from "@/lib/domain/candidatoSugerido";

const ESTADO_IMPORTADO = "SP";

// Cache em memória do processo para o catálogo de CNAEs — mesmo padrão de
// `listarMunicipiosComCandidatos` (candidatosCnpj.ts), e pelo mesmo motivo: o `groupBy` que o monta
// não tem índice que o cubra e varre a tabela inteira (medido: 1,9s de Execution Time e 400 mil
// páginas lidas, contra a base local). Da função em `iad1` até o VPS em Campinas esse custo é
// bem maior, e ele se pagava a CADA clique no botão.
//
// TTL de 1h é seguro aqui porque o catálogo só muda quando a base de candidatos é reimportada —
// evento raro e manual, ao contrário da lista de municípios (§9 do PLAN, TTL reduzido para 5min
// depois de uma carga nova demorar a aparecer).
interface CacheCatalogo {
  classes: ClasseCnae[];
  expiraEm: number;
}
let cacheCatalogo: CacheCatalogo | null = null;
const TTL_CACHE_CATALOGO_MS = 60 * 60 * 1000;

async function obterCatalogoCnaes(): Promise<ClasseCnae[]> {
  if (cacheCatalogo && cacheCatalogo.expiraEm > Date.now()) return cacheCatalogo.classes;

  const grupos = await dbCandidatos.empresaCandidataFornecedor.groupBy({
    by: ["cnaePrincipalCodigo", "cnaePrincipalDescricao"],
  });
  const porClasse = new Map<string, ClasseCnae>();
  for (const g of grupos) {
    if (!porClasse.has(g.cnaePrincipalCodigo)) {
      porClasse.set(g.cnaePrincipalCodigo, {
        classe: g.cnaePrincipalCodigo,
        descricao: g.cnaePrincipalDescricao,
      });
    }
  }

  const classes = [...porClasse.values()];
  cacheCatalogo = { classes, expiraEm: Date.now() + TTL_CACHE_CATALOGO_MS };
  return classes;
}

/**
 * Sugere empresas capazes de atender o objeto de um processo, buscando na base de candidatos
 * (milhões de empresas ativas de SP, derivada do dump da Receita) em vez do cadastro próprio de
 * `Fornecedor`, que é pequeno demais para sustentar sozinho uma pesquisa de preços com ≥3
 * fornecedores consultados (IN 65/2021).
 *
 * O caminho é objeto → CNAEs (via IA) → empresas daqueles CNAEs, porque o CNAE é o único atributo
 * que TODA empresa da base tem: a categorização por tag cobre uma fração dos candidatos, então
 * filtrar por ela descartaria em silêncio a maioria das empresas aptas.
 *
 * Não grava nada: devolve sugestão para o analista revisar e selecionar. A cotação em si continua
 * sendo registrada pelo fluxo existente, e o envio do e-mail segue externo à plataforma (§9.3).
 */
export async function sugerirCandidatosParaObjeto(
  objeto: string,
): Promise<ResultadoSugestaoCandidatos> {
  const user = await requireAuth();

  const vazio: ResultadoSugestaoCandidatos = { cnaesSugeridos: [], candidatos: [], totalEncontrado: 0 };
  if (!objeto.trim()) return vazio;

  // Catálogo de subclasses realmente presentes na base — a IA só pode escolher entre estas, e usar
  // a base como fonte (em vez de uma tabela oficial de CNAEs) garante que todo código sugerido tem
  // pelo menos uma empresa por trás. Sem agrupar por classe de 5 dígitos: ver ClasseCnae.
  const catalogo = await obterCatalogoCnaes();

  const cnaesSugeridos = await sugerirCnaesParaObjeto(objeto, catalogo);
  if (cnaesSugeridos.length === 0) return vazio;

  // Igualdade exata: a IA já escolhe a subclasse de 7 dígitos, que é o formato gravado na base.
  const encontrados = await dbCandidatos.empresaCandidataFornecedor.findMany({
    where: {
      estado: ESTADO_IMPORTADO,
      email: { not: null },
      cnaePrincipalCodigo: { in: cnaesSugeridos },
    },
    select: {
      id: true,
      cnpj: true,
      razaoSocial: true,
      email: true,
      municipio: true,
      estado: true,
      cnaePrincipalCodigo: true,
      cnaePrincipalDescricao: true,
    },
    // Janela acima do teto da UI: a ordenação por localidade precisa enxergar mais que os 500
    // finais, senão o corte aconteceria antes de priorizar a Baixada e devolveria 500 empresas
    // arbitrárias do estado inteiro. 4x (2.000 linhas, ~600 KB) em vez de 20x: medido que 10.000
    // linhas trafegam ~3 MB do VPS em Campinas até `iad1` a cada clique, e a Baixada Santista cabe
    // folgadamente nessa janela.
    take: TETO_CANDIDATOS * 4,
  });

  const comEmail = encontrados.filter((c): c is typeof c & { email: string } => Boolean(c.email));

  // Total real, não o tamanho da janela lida acima: `encontrados` está limitado por `take`, então
  // usar o comprimento dele faria a tela anunciar "10.000 empresas" sempre que houvesse mais que
  // isso — um número inventado pelo teto, não medido na base.
  const totalEncontrado = await dbCandidatos.empresaCandidataFornecedor.count({
    where: {
      estado: ESTADO_IMPORTADO,
      email: { not: null },
      cnaePrincipalCodigo: { in: cnaesSugeridos },
    },
  });

  // Quantas empresas dividem cada e-mail — base do critério "e-mail de contador" da ordenação.
  const contagemPorEmail = new Map<string, number>();
  for (const c of comEmail) {
    const chave = c.email.toLowerCase();
    contagemPorEmail.set(chave, (contagemPorEmail.get(chave) ?? 0) + 1);
  }

  const ordenados = ordenarCandidatosCotacao(
    comEmail.map((c) => ({
      ...c,
      empresasComMesmoEmail: (contagemPorEmail.get(c.email.toLowerCase()) ?? 1) - 1,
    })),
  );

  const candidatos: CandidatoSugerido[] = ordenados.slice(0, TETO_CANDIDATOS).map((c) => ({
    id: c.id,
    cnpj: c.cnpj,
    razaoSocial: c.razaoSocial,
    email: c.email,
    municipio: c.municipio,
    estado: c.estado,
    cnaePrincipalCodigo: c.cnaePrincipalCodigo,
    cnaePrincipalDescricao: c.cnaePrincipalDescricao,
    emailCompartilhado: c.empresasComMesmoEmail > 0,
  }));

  await registrarAuditoria({
    userId: user.id,
    acao: "sugerir_candidatos_cotacao",
    detalhes: { cnaesSugeridos, totalEncontrado, devolvidos: candidatos.length },
  });

  return { cnaesSugeridos, candidatos, totalEncontrado };
}
