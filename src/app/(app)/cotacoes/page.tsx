import { Mail, Send, ClipboardCheck, MailQuestion, Bot, FileSearch, Link2, ListChecks } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CotacoesTableReal } from "@/components/cotacoes/CotacoesTableReal";
import { SelecaoFornecedoresForm } from "@/components/cotacoes/SelecaoFornecedoresForm";
import { VerificarRespostasButton } from "@/components/cotacoes/VerificarRespostasButton";
import { HistoricoRespostasButton } from "@/components/cotacoes/HistoricoRespostasButton";
import { RespostasAConfirmar, type RespostaPendenteItem } from "@/components/cotacoes/RespostasAConfirmar";
import { AplicadasPelaIa, type AplicadaPelaIaItem } from "@/components/cotacoes/AplicadasPelaIa";
import { OrcamentosPorPdfARevisar, type OrcamentoPdfRevisarItem } from "@/components/cotacoes/OrcamentosPorPdfARevisar";
import { ConferirClassificacaoIa } from "@/components/cotacoes/ConferirClassificacaoIa";
import { LigarRespostasAFornecedor, type RespostaLigavelItem } from "@/components/cotacoes/LigarRespostasAFornecedor";
import { listarRespostasLigaveis } from "@/lib/emailCotacao/ligarRespostaFornecedor";
import { carregarPainelConferencia, type Escopo } from "@/lib/emailCotacao/conferenciaIa";
import { ehClasse } from "@/lib/domain/cotacaoEmail/conferenciaIa";
import { REGRAS_ORCAMENTO_POR_ANEXO } from "@/lib/domain/cotacaoEmail/regrasOrcamentoPorAnexo";
import { listarClassificaveisSemFornecedor } from "@/lib/emailCotacao/classificarSemFornecedor";
import { listarEncerraveisNaoResposta } from "@/lib/emailCotacao/encerrarNaoResposta";
import { aplicacaoIaLigada, listarAprovadasAplicaveis } from "@/lib/emailCotacao/aplicarIa";
import { AplicarPoliticaIa, type ContagemPolitica } from "@/components/cotacoes/AplicarPoliticaIa";
import { listarAdotaveisPelaPolitica } from "@/lib/emailCotacao/politicaIa";
import { FecharPendenciasIa, type ContagemFechamento } from "@/components/cotacoes/FecharPendenciasIa";
import { planejarFechamento } from "@/lib/emailCotacao/fechamentoIa";
import { linkDoGmail } from "@/lib/domain/cotacaoEmail/gmail";
import { ChecklistProposta } from "@/components/cotacoes/ChecklistProposta";
import { AlertasBanner } from "@/components/common/AlertasBanner";
import { listarCotacoes } from "@/lib/actions/cotacoes";
import { buscarAlertas } from "@/lib/actions/alertas";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/rbac";
import { PageHeader } from "@/components/common/PageHeader";

/**
 * A busca de empresas na base de candidatos (server action desta página) atravessa o Postgres do
 * VPS em Campinas a partir de `iad1`, e a latência entre regiões domina o custo — o padrão da
 * plataforma não dá folga suficiente. Mesmo valor das demais rotas pesadas do projeto.
 */
export const maxDuration = 60;

export default async function CotacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; escopo?: string; classe?: string }>;
}) {
  await requireAuth();
  const { aba, escopo: escopoParam, classe: classeParam } = await searchParams;
  const escopoConferencia: Escopo = escopoParam === "sugeridas" ? "sugeridas" : "aplicadas";
  const classeConferencia = ehClasse(classeParam) ? classeParam : undefined;
  // Lida sempre (como as demais abas): trocar de aba no cliente não refaz a leitura do servidor. A
  // função captura seus próprios erros e devolve "indisponivel", então a página abre mesmo sem a tabela.
  const painelConferencia = await carregarPainelConferencia({ escopo: escopoConferencia, classe: classeConferencia });
  const contagemPolitica = await contarPoliticaIa();
  const contagemFechamento = await contarFechamento();

  const [cotacoesRaw, alertas, processosDb, propostas, respostasPendentes, aplicadasPelaIa, orcamentosPdf, aprovadasPendentes, encerraveis, semFornecedor, ligaveis] = await Promise.all([
    listarCotacoes(),
    buscarAlertas(),
    db.processo.findMany({
      orderBy: { dataAbertura: "desc" },
      select: { id: true, numero: true, objeto: true },
    }),
    db.proposta.findMany({
      where: { statusGeral: { in: ["com_ressalva", "invalida"] } },
      select: {
        id: true,
        cnpjValido: true,
        descricaoValida: true,
        valorUnitarioValido: true,
        valorTotalValido: true,
        dataValida: true,
        responsavelValido: true,
        statusGeral: true,
        observacoes: true,
        valorUnitario: true,
        valorTotal: true,
        cotacao: {
          select: {
            fornecedor: { select: { razaoSocial: true, cnpj: true } },
            processo: { select: { numero: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    carregarRespostasPendentes(),
    carregarAplicadasPelaIa(),
    carregarOrcamentosPdfARevisar(),
    contarAprovadasPendentes(),
    contarEncerraveis(),
    contarSemFornecedor(),
    carregarLigaveis(),
  ]);

  const cotacoes = cotacoesRaw.map((c) => ({
    id: c.id,
    processoNumero: c.processo.numero,
    fornecedorRazaoSocial: c.fornecedor.razaoSocial,
    fornecedorEmail: c.fornecedor.email,
    dataEnvio: c.dataEnvio,
    dataLimite: c.dataLimite,
    status: c.status,
    valorProposto: c.valorProposto ? Number(c.valorProposto) : null,
    lembreteEnviado: c.lembreteEnviado,
  }));

  // Map propostas to ChecklistProposta format
  const propostasParaValidar = propostas.map((p) => ({
    id: p.id,
    fornecedor: {
      razaoSocial: p.cotacao.fornecedor.razaoSocial,
      cnpj: p.cotacao.fornecedor.cnpj,
    },
    processoNumero: p.cotacao.processo.numero,
    itens: [
      { campo: "CNPJ", status: p.cnpjValido, observacao: null },
      { campo: "Descrição do objeto", status: p.descricaoValida, observacao: null },
      { campo: "Valor unitário", status: p.valorUnitarioValido, observacao: null },
      { campo: "Valor total", status: p.valorTotalValido, observacao: null },
      { campo: "Data de emissão", status: p.dataValida, observacao: null },
      { campo: "Responsável / Assinatura", status: p.responsavelValido, observacao: null },
    ],
    statusGeral: p.statusGeral,
    observacoes: p.observacoes,
    valorUnitario: p.valorUnitario ? Number(p.valorUnitario) : undefined,
    valorTotal: p.valorTotal ? Number(p.valorTotal) : undefined,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cotações"
        description="Registro de consultas a fornecedores, controle de SLA e checklist de propostas."
        actions={
          <div className="flex items-center gap-2">
            <HistoricoRespostasButton />
            <VerificarRespostasButton />
          </div>
        }
      />

      {alertas.length > 0 && <AlertasBanner alertas={alertas} />}

      <Tabs defaultValue={aba === "confirmar" ? "confirmar" : aba === "ia" ? "ia" : aba === "revisar-pdf" ? "revisar-pdf" : aba === "ligar" ? "ligar" : aba === "conferir" ? "conferir" : "painel"} className="space-y-4">
        <TabsList>
          <TabsTrigger value="painel" className="gap-2">
            <Mail className="size-3.5" />
            Painel de controle
          </TabsTrigger>
          <TabsTrigger value="nova" className="gap-2">
            <Send className="size-3.5" />
            Nova cotação
          </TabsTrigger>
          <TabsTrigger value="confirmar" className="gap-2">
            <MailQuestion className="size-3.5" />
            Respostas a confirmar
            {respostasPendentes.length > 0 && (
              <span className="rounded-full bg-warning/20 px-1.5 text-xs tabular-nums">
                {respostasPendentes.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="ia" className="gap-2">
            <Bot className="size-3.5" />
            Aplicadas pela IA
            {aplicadasPelaIa.length > 0 && (
              <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{aplicadasPelaIa.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="revisar-pdf" className="gap-2">
            <FileSearch className="size-3.5" />
            Orçamentos por PDF
            {orcamentosPdf.length > 0 && (
              <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{orcamentosPdf.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="ligar" className="gap-2">
            <Link2 className="size-3.5" />
            Ligar fornecedor
            {ligaveis.length > 0 && (
              <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{ligaveis.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="conferir" className="gap-2">
            <ListChecks className="size-3.5" />
            Conferir IA
          </TabsTrigger>
          <TabsTrigger value="propostas" className="gap-2">
            <ClipboardCheck className="size-3.5" />
            Validação de propostas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="painel">
          <CotacoesTableReal cotacoes={cotacoes} />
        </TabsContent>

        <TabsContent value="nova">
          <SelecaoFornecedoresForm processos={processosDb} />
        </TabsContent>

        <TabsContent value="confirmar">
          <RespostasAConfirmar itens={respostasPendentes} encerraveis={encerraveis} semFornecedor={semFornecedor} />
        </TabsContent>

        <TabsContent value="revisar-pdf">
          <OrcamentosPorPdfARevisar itens={orcamentosPdf} />
        </TabsContent>

        <TabsContent value="ligar">
          <LigarRespostasAFornecedor itens={ligaveis} />
        </TabsContent>

        <TabsContent value="conferir">
          <ConferirClassificacaoIa painel={painelConferencia} escopo={escopoConferencia} classe={classeConferencia} />
        </TabsContent>

        <TabsContent value="ia" className="space-y-3">
          <FecharPendenciasIa contagem={contagemFechamento} />
          <AplicarPoliticaIa contagem={contagemPolitica} />
          <AplicadasPelaIa itens={aplicadasPelaIa} aprovadasPendentes={aprovadasPendentes} />
        </TabsContent>

        <TabsContent value="propostas" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {propostasParaValidar.length} proposta{propostasParaValidar.length !== 1 ? "s" : ""} com pendência para revisão.
          </p>
          {propostasParaValidar.map((p) => (
            <ChecklistProposta key={p.id} proposta={p as never} />
          ))}
          {propostasParaValidar.length === 0 && (
            <p className="text-sm text-muted-foreground italic">Nenhuma proposta com pendência.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Fila "a confirmar" (M30.d). `catch` devolve lista vazia: a página precisa abrir também no
 * intervalo entre o deploy do código e a migration que cria a tabela (CLAUDE.md §9.19/§9.46).
 */
async function carregarRespostasPendentes(): Promise<RespostaPendenteItem[]> {
  try {
    const selecao = {
      id: true,
      gmailMensagemId: true,
      dataResposta: true,
      remetenteDominio: true,
      motivo: true,
      temAnexoOrcamento: true,
      contemRecusa: true,
      contemValor: true,
      sugestaoConsultaId: true,
      sugestaoIa: true,
      justificativaIa: true,
      envio: {
        select: { numeroProcessoAssunto: true, processo: { select: { numero: true } } },
      },
    } as const;
    // As sugestões (recusa, orçamento, dúvida) vêm INTEIRAS: o lote de recusa age sobre todas, e o
    // teto de 200 as cortaria. O resto segue limitado, como antes.
    const MOTIVOS_SUGERIDOS = ["provavel_recusa", "provavel_orcamento", "provavel_duvida"];
    const [sugeridas, demais] = await Promise.all([
      db.respostaEmailPendente.findMany({
        where: { resolvidaEm: null, motivo: { in: MOTIVOS_SUGERIDOS } },
        orderBy: [{ motivo: "asc" }, { dataResposta: "desc" }],
        take: 1000,
        select: selecao,
      }),
      db.respostaEmailPendente.findMany({
        where: { resolvidaEm: null, motivo: { notIn: MOTIVOS_SUGERIDOS } },
        orderBy: { dataResposta: "desc" },
        take: 200,
        select: selecao,
      }),
    ]);
    // Ordem de leitura: orçamento (o que vale mais), dúvida e recusa antes do resto.
    const ORDEM: Record<string, number> = { provavel_orcamento: 0, provavel_duvida: 1, provavel_recusa: 2 };
    const pendentes = [
      ...sugeridas.sort((x, y) => (ORDEM[x.motivo] ?? 9) - (ORDEM[y.motivo] ?? 9)),
      ...demais,
    ];
    const ids = pendentes.map((p) => p.sugestaoConsultaId).filter((x): x is string => x !== null);
    const sugestoes = ids.length
      ? await db.consultaCotacao.findMany({
          where: { id: { in: ids } },
          select: { id: true, email: true, razaoSocial: true },
        })
      : [];
    const porId = new Map(sugestoes.map((s) => [s.id, s]));

    return pendentes.map((p) => {
      const s = p.sugestaoConsultaId ? porId.get(p.sugestaoConsultaId) : undefined;
      return {
        id: p.id,
        dataResposta: p.dataResposta.toISOString(),
        motivo: p.motivo,
        remetenteDominio: p.remetenteDominio,
        temAnexoOrcamento: p.temAnexoOrcamento,
        contemRecusa: p.contemRecusa,
        contemValor: p.contemValor,
        processoNumero: p.envio.processo?.numero ?? null,
        numeroNoAssunto: p.envio.numeroProcessoAssunto,
        sugestao: s ? { email: s.email, razaoSocial: s.razaoSocial } : null,
        sugestaoIa: p.sugestaoIa,
        justificativaIa: p.justificativaIa,
        linkGmail: linkDoGmail(p.gmailMensagemId),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Respostas que a IA classificou sozinha e que ainda não foram desfeitas (M30.d, Fase 3b). `catch`
 * devolve lista vazia: a página precisa abrir também antes da migration que cria as colunas (§9.19).
 * `select` explícito em tudo (§9.46).
 */
async function carregarAplicadasPelaIa(): Promise<AplicadaPelaIaItem[]> {
  try {
    const linhas = await db.classificacaoIaResposta.findMany({
      where: { aplicadaEm: { not: null }, desfeitaEm: null },
      orderBy: { aplicadaEm: "desc" },
      take: 200,
      select: { gmailMensagemId: true, classeIa: true, justificativa: true, aplicadaEm: true, consultaId: true },
    });
    if (linhas.length === 0) return [];

    const consultaIds = linhas.map((l) => l.consultaId).filter((x): x is string => x !== null);
    const consultas = await db.consultaCotacao.findMany({
      where: { id: { in: consultaIds } },
      select: {
        id: true,
        email: true,
        razaoSocial: true,
        envio: { select: { numeroProcessoAssunto: true, processo: { select: { numero: true } } } },
      },
    });
    const porId = new Map(consultas.map((c) => [c.id, c]));
    return linhas.map((l) => {
      const c = l.consultaId ? porId.get(l.consultaId) : undefined;
      return {
        gmailMensagemId: l.gmailMensagemId,
        classe: l.classeIa,
        justificativa: l.justificativa,
        aplicadaEm: (l.aplicadaEm as Date).toISOString(),
        processoNumero: c?.envio.processo?.numero ?? c?.envio.numeroProcessoAssunto ?? null,
        fornecedor: c ? (c.razaoSocial ?? c.email) : null,
        linkGmail: linkDoGmail(l.gmailMensagemId),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Consultas "orçamento" decididas só pelo anexo (regras antigas) em que a IA discorda (M30.d).
 * Sem classificação da IA não há o que mostrar: não é divergência. `select` explícito (§9.46); `catch`
 * devolve vazio para a página abrir mesmo se a tabela da IA falhar.
 */
async function carregarOrcamentosPdfARevisar(): Promise<OrcamentoPdfRevisarItem[]> {
  try {
    const consultas = await db.consultaCotacao.findMany({
      where: { situacao: "orcamento", regra: { in: [...REGRAS_ORCAMENTO_POR_ANEXO] }, gmailRespostaId: { not: null } },
      select: {
        id: true,
        email: true,
        razaoSocial: true,
        gmailRespostaId: true,
        envio: { select: { numeroProcessoAssunto: true, processo: { select: { numero: true } } } },
      },
    });
    if (consultas.length === 0) return [];
    const ias = await db.classificacaoIaResposta.findMany({
      where: {
        gmailMensagemId: { in: consultas.map((c) => c.gmailRespostaId as string) },
        classeIa: { in: ["recusa", "duvida", "nao_e_resposta"] },
      },
      select: { gmailMensagemId: true, classeIa: true, justificativa: true },
    });
    const porMsg = new Map(ias.map((i) => [i.gmailMensagemId, i]));
    const itens: OrcamentoPdfRevisarItem[] = [];
    for (const c of consultas) {
      const ia = porMsg.get(c.gmailRespostaId as string);
      if (!ia) continue;
      itens.push({
        consultaId: c.id,
        classeIa: ia.classeIa as OrcamentoPdfRevisarItem["classeIa"],
        justificativa: ia.justificativa,
        processoNumero: c.envio.processo?.numero ?? c.envio.numeroProcessoAssunto ?? null,
        fornecedor: c.razaoSocial ?? c.email,
        linkGmail: linkDoGmail(c.gmailRespostaId as string),
      });
    }
    return itens;
  } catch {
    return [];
  }
}

/** Pendências que o fechamento trata, por grupo (`catch` abre a página). */
async function contarFechamento(): Promise<ContagemFechamento> {
  const zero: ContagemFechamento = { aplicarOrcamento: 0, aplicarRecusa: 0, aplicarDuvida: 0, aplicarNaoEResposta: 0, semFornecedor: 0, fecharSemAlterar: 0, dispensar: 0, consultasOrfas: 0 };
  try {
    const plano = await planejarFechamento();
    for (const a of plano.aplicar) {
      if (a.classeIa === "orcamento") zero.aplicarOrcamento += 1;
      else if (a.classeIa === "recusa") zero.aplicarRecusa += 1;
      else if (a.classeIa === "duvida") zero.aplicarDuvida += 1;
      else if (a.classeIa === "nao_e_resposta") zero.aplicarNaoEResposta += 1;
    }
    zero.semFornecedor = plano.semFornecedor.length;
    zero.fecharSemAlterar = plano.fecharSemAlterar.length;
    zero.dispensar = plano.dispensar.length;
    zero.consultasOrfas = plano.consultasOrfas.length;
    return zero;
  } catch {
    return { aplicarOrcamento: 0, aplicarRecusa: 0, aplicarDuvida: 0, aplicarNaoEResposta: 0, semFornecedor: 0, fecharSemAlterar: 0, dispensar: 0, consultasOrfas: 0 };
  }
}

/** Pendentes que cabem na política da IA, por classe (só conta com a chave ligada; `catch` abre a página). */
async function contarPoliticaIa(): Promise<ContagemPolitica> {
  const zero = { recusa: 0, duvida: 0 };
  if (!aplicacaoIaLigada()) return zero;
  try {
    for (const a of await listarAdotaveisPelaPolitica()) if (a.classeIa in zero) zero[a.classeIa as keyof typeof zero] += 1;
    return zero;
  } catch {
    return { recusa: 0, duvida: 0 };
  }
}

/** Respostas que o critério aprovou em sombra e ainda não foram aplicadas (só conta com a chave ligada). */
async function contarAprovadasPendentes(): Promise<number> {
  if (!aplicacaoIaLigada()) return 0;
  try {
    return (await listarAprovadasAplicaveis()).length;
  } catch {
    return 0;
  }
}

/** Respostas sem fornecedor ligado que a IA leu como "não é resposta" com confiança alta. */
async function contarEncerraveis(): Promise<number> {
  try {
    return (await listarEncerraveisNaoResposta()).length;
  } catch {
    return 0;
  }
}

/** Respostas sem fornecedor ligado que a IA leu com confiança alta, por categoria. */
async function contarSemFornecedor(): Promise<{ orcamento: number; recusa: number; duvida: number }> {
  const zero = { orcamento: 0, recusa: 0, duvida: 0 };
  try {
    const alvos = await listarClassificaveisSemFornecedor();
    for (const a of alvos) if (a.classe in zero) zero[a.classe as keyof typeof zero] += 1;
    return zero;
  } catch {
    return { orcamento: 0, recusa: 0, duvida: 0 };
  }
}

/**
 * Respostas que a IA classificou e que não estão ligadas a nenhum fornecedor (ligação rápida).
 * `catch` devolve vazio para a página abrir mesmo se a leitura falhar.
 */
async function carregarLigaveis(): Promise<RespostaLigavelItem[]> {
  try {
    const itens = await listarRespostasLigaveis();
    return itens.map(({ dataResposta: _dataResposta, ...resto }) => resto);
  } catch {
    return [];
  }
}
