import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 40,
    color: "#18181b",
  },
  header: {
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: "#1e3a5f",
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#1e3a5f",
  },
  headerSub: {
    fontSize: 9,
    color: "#52525b",
    marginTop: 2,
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#71717a",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
    paddingBottom: 3,
  },
  grid2: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  gridCell: {
    width: "48%",
    marginBottom: 6,
  },
  gridCell3: {
    width: "31%",
    marginBottom: 6,
  },
  label: {
    fontSize: 7,
    color: "#71717a",
    marginBottom: 1,
  },
  value: {
    fontSize: 9,
    color: "#18181b",
  },
  valueBold: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#18181b",
  },
  table: {
    width: "100%",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f4f4f5",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f4f4f5",
  },
  tableRowExcluido: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f4f4f5",
    opacity: 0.5,
  },
  th: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#52525b",
  },
  td: {
    fontSize: 8,
    color: "#18181b",
  },
  colFonte: { width: "35%" },
  colTipo: { width: "22%" },
  colData: { width: "16%" },
  colValor: { width: "17%", textAlign: "right" },
  colStatus: { width: "10%" },
  statsBox: {
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  statCell: {
    width: "23%",
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 7,
    color: "#52525b",
    marginBottom: 1,
  },
  statValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#1e3a5f",
  },
  totalBox: {
    backgroundColor: "#1e3a5f",
    borderRadius: 4,
    padding: 10,
    marginTop: 6,
  },
  totalLabel: {
    fontSize: 8,
    color: "#93c5fd",
    marginBottom: 3,
  },
  totalValue: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
  },
  totalSub: {
    fontSize: 7,
    color: "#93c5fd",
    marginTop: 2,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 7,
    color: "#a1a1aa",
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e4e4e7",
    paddingTop: 6,
  },
  cvDanger: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#dc2626" },
  cvWarning: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#d97706" },
  cvSuccess: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#16a34a" },
  badge: {
    fontSize: 7,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  badgeIncluido: { backgroundColor: "#dcfce7", color: "#15803d" },
  badgeExcluido: { backgroundColor: "#f4f4f5", color: "#71717a" },
});

const METODO_LABEL: Record<string, string> = {
  media: "Média aritmética",
  mediana: "Mediana",
  menor_valor: "Menor valor",
};

const FONTE_LABEL: Record<string, string> = {
  contratacao_publica: "Contratação pública",
  site_eletronico: "Site eletrônico",
  fornecedor_direto: "Fornecedor direto",
};

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("pt-BR");
}

export interface MemoriaCalculoPdfData {
  processo: {
    numero: string;
    objeto: string;
    responsavel: string;
    quantidade: number;
    unidade: string;
  };
  serie: {
    metodo: string;
    valorEstimado: number;
    media: number;
    mediana: number;
    menorValor: number;
    coeficienteVariacao: number;
    totalPrecos: number;
    precosIncluidos: number;
    precos: Array<{
      id: string;
      fonte: string;
      descricaoFonte: string;
      fornecedorOuOrgao: string;
      dataReferencia: Date | string;
      valorUnitario: number;
      status: string;
      motivoExclusao?: string | null;
    }>;
  };
  geradoEm: Date;
}

export function MemoriaCalculoPdfDocument({ data }: { data: MemoriaCalculoPdfData }) {
  const { processo, serie } = data;
  const cv = Number(serie.coeficienteVariacao);
  const cvStyle = cv > 25 ? styles.cvDanger : cv > 15 ? styles.cvWarning : styles.cvSuccess;
  const valorTotal = Number(serie.valorEstimado) * processo.quantidade;

  return (
    <Document
      title={`Memória de Cálculo — ${processo.numero}`}
      author="Divisão de Compras CMS"
      subject={`Pesquisa de preços — ${processo.objeto}`}
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Memória de Cálculo — Pesquisa de Preços</Text>
          <Text style={styles.headerSub}>
            Câmara Municipal de Santos — Divisão de Compras | IN SEGES/ME nº 65/2021
          </Text>
        </View>

        {/* Identificação */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Identificação</Text>
          <View style={styles.grid2}>
            <View style={styles.gridCell3}>
              <Text style={styles.label}>Processo</Text>
              <Text style={styles.valueBold}>{processo.numero}</Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.label}>Objeto</Text>
              <Text style={styles.value}>{processo.objeto}</Text>
            </View>
            <View style={styles.gridCell3}>
              <Text style={styles.label}>Responsável</Text>
              <Text style={styles.value}>{processo.responsavel}</Text>
            </View>
            <View style={styles.gridCell3}>
              <Text style={styles.label}>Quantidade estimada</Text>
              <Text style={styles.value}>{processo.quantidade} {processo.unidade}</Text>
            </View>
            <View style={styles.gridCell3}>
              <Text style={styles.label}>Método adotado</Text>
              <Text style={styles.valueBold}>{METODO_LABEL[serie.metodo] ?? serie.metodo}</Text>
            </View>
            <View style={styles.gridCell3}>
              <Text style={styles.label}>Fundamento legal</Text>
              <Text style={styles.value}>IN SEGES/ME nº 65/2021</Text>
            </View>
          </View>
        </View>

        {/* Preços coletados */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preços coletados</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, styles.colFonte]}>Fonte / Referência</Text>
              <Text style={[styles.th, styles.colTipo]}>Tipo</Text>
              <Text style={[styles.th, styles.colData]}>Data</Text>
              <Text style={[styles.th, styles.colValor]}>Valor unit.</Text>
              <Text style={[styles.th, styles.colStatus]}>Status</Text>
            </View>
            {serie.precos.map((p) => (
              <View
                key={p.id}
                style={p.status === "excluido" ? styles.tableRowExcluido : styles.tableRow}
              >
                <Text style={[styles.td, styles.colFonte]}>{p.descricaoFonte}</Text>
                <Text style={[styles.td, styles.colTipo]}>{FONTE_LABEL[p.fonte] ?? p.fonte}</Text>
                <Text style={[styles.td, styles.colData]}>{formatDate(p.dataReferencia)}</Text>
                <Text style={[styles.td, styles.colValor]}>{formatBRL(Number(p.valorUnitario))}</Text>
                <View style={styles.colStatus}>
                  <Text
                    style={[
                      styles.badge,
                      p.status === "incluido" ? styles.badgeIncluido : styles.badgeExcluido,
                    ]}
                  >
                    {p.status === "incluido" ? "Incl." : "Excl."}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Estatísticas */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Estatísticas da série ({serie.precosIncluidos} preços incluídos)
          </Text>
          <View style={styles.statsBox}>
            <View style={styles.statsGrid}>
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>Média aritmética</Text>
                <Text style={styles.statValue}>{formatBRL(Number(serie.media))}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>Mediana</Text>
                <Text style={styles.statValue}>{formatBRL(Number(serie.mediana))}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>Menor valor</Text>
                <Text style={styles.statValue}>{formatBRL(Number(serie.menorValor))}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>CV (coef. variação)</Text>
                <Text style={cvStyle}>{cv.toFixed(1)}%</Text>
              </View>
            </View>
            <View style={styles.totalBox}>
              <Text style={styles.totalLabel}>
                Valor unitário estimado ({METODO_LABEL[serie.metodo] ?? serie.metodo})
              </Text>
              <Text style={styles.totalValue}>{formatBRL(Number(serie.valorEstimado))}</Text>
              <Text style={styles.totalSub}>
                Total estimado: {formatBRL(valorTotal)} ({formatBRL(Number(serie.valorEstimado))} × {processo.quantidade} {processo.unidade})
              </Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>Câmara Municipal de Santos — Divisão de Compras | {processo.numero}</Text>
          <Text>Gerado em {formatDate(data.geradoEm)}</Text>
        </View>
      </Page>
    </Document>
  );
}
