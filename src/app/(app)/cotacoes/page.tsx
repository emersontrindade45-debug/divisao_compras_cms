import { Mail, Send, ClipboardCheck, MailQuestion } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CotacoesTableReal } from "@/components/cotacoes/CotacoesTableReal";
import { SelecaoFornecedoresForm } from "@/components/cotacoes/SelecaoFornecedoresForm";
import { VerificarRespostasButton } from "@/components/cotacoes/VerificarRespostasButton";
import { RespostasAConfirmar, type RespostaPendenteItem } from "@/components/cotacoes/RespostasAConfirmar";
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
  searchParams: Promise<{ aba?: string }>;
}) {
  await requireAuth();
  const { aba } = await searchParams;

  const [cotacoesRaw, alertas, processosDb, propostas, respostasPendentes] = await Promise.all([
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
        actions={<VerificarRespostasButton />}
      />

      {alertas.length > 0 && <AlertasBanner alertas={alertas} />}

      <Tabs defaultValue={aba === "confirmar" ? "confirmar" : "painel"} className="space-y-4">
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
          <RespostasAConfirmar itens={respostasPendentes} />
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
    const pendentes = await db.respostaEmailPendente.findMany({
      where: { resolvidaEm: null },
      orderBy: { dataResposta: "desc" },
      take: 200,
      select: {
        id: true,
        gmailMensagemId: true,
        dataResposta: true,
        remetenteDominio: true,
        motivo: true,
        temAnexoOrcamento: true,
        contemRecusa: true,
        contemValor: true,
        sugestaoConsultaId: true,
        envio: {
          select: { numeroProcessoAssunto: true, processo: { select: { numero: true } } },
        },
      },
    });
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
        linkGmail: linkDoGmail(p.gmailMensagemId),
      };
    });
  } catch {
    return [];
  }
}
