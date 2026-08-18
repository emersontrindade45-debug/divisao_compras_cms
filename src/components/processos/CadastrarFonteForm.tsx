"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { criarFonteManual } from "@/lib/actions/fontes";
import { SELECT_CLASS as SELECT_BASE } from "@/components/common/selectClass";
import { cn } from "@/lib/utils";

const SELECT_CLASS = cn(SELECT_BASE, "w-full");

type TipoFonte = "contratacao_publica" | "site_eletronico" | "fornecedor_direto";

const TIPO_FONTE_LABEL: Record<TipoFonte, string> = {
  contratacao_publica: "Contratação pública",
  site_eletronico: "Site eletrônico",
  fornecedor_direto: "Fornecedor direto",
};

export interface ItemOption {
  id: string;
  descricao: string;
}

/**
 * Cadastro retroativo de fonte: para pesquisa já feita fora do sistema
 * (fornecedor consultado por e-mail, site visitado, contratação pública já
 * conhecida) que nunca foi digitada aqui. Complementa a promoção automática de
 * candidatos de similaridade — aquela só cobre o que a busca por similaridade
 * encontrou; esta cobre o que o servidor já sabe por outra via.
 */
export function CadastrarFonteForm({ itens }: { itens: ItemOption[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const [itemId, setItemId] = useState("");
  const [tipo, setTipo] = useState<TipoFonte>("contratacao_publica");
  const [descricao, setDescricao] = useState("");
  const [orgaoOuFornecedor, setOrgaoOuFornecedor] = useState("");
  const [valorUnitario, setValorUnitario] = useState("");
  const [dataReferencia, setDataReferencia] = useState("");
  const [dataHoraAcesso, setDataHoraAcesso] = useState(() =>
    new Date().toISOString().slice(0, 16),
  );
  const [url, setUrl] = useState("");
  const [descricaoEvidencia, setDescricaoEvidencia] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);

  function resetar() {
    setItemId("");
    setTipo("contratacao_publica");
    setDescricao("");
    setOrgaoOuFornecedor("");
    setValorUnitario("");
    setDataReferencia("");
    setDataHoraAcesso(new Date().toISOString().slice(0, 16));
    setUrl("");
    setDescricaoEvidencia("");
    setArquivo(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url && !arquivo) {
      toast.error("Informe a URL da evidência ou anexe um arquivo.");
      return;
    }

    setEnviando(true);
    try {
      const resultado = await criarFonteManual(
        {
          itemId,
          tipo,
          descricao,
          orgaoOuFornecedor,
          dataReferencia: new Date(dataReferencia),
          valorUnitario: parseFloat(valorUnitario),
          dataHoraAcesso: new Date(dataHoraAcesso),
          url: url || undefined,
          descricaoEvidencia: descricaoEvidencia || undefined,
        },
        arquivo ?? undefined,
      );

      if (resultado.error) {
        toast.error(resultado.error);
        return;
      }

      toast.success("Fonte cadastrada com evidência anexada.");
      resetar();
      setAberto(false);
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  if (!aberto) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
        <PlusCircle className="size-3.5" aria-hidden />
        Cadastrar fonte manualmente
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Cadastrar fonte manualmente</CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setAberto(false);
            resetar();
          }}
        >
          Cancelar
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Use quando a pesquisa já foi feita fora do sistema (contratação pública já conhecida,
            site consultado, fornecedor respondeu por fora) e precisa ser registrada com evidência
            para compor a série de preços.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Item</label>
              <select
                className={SELECT_CLASS}
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
                required
              >
                <option value="">Selecione o item</option>
                {itens.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.descricao}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tipo de fonte</label>
              <select
                className={SELECT_CLASS}
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoFonte)}
                required
              >
                {(Object.keys(TIPO_FONTE_LABEL) as TipoFonte[]).map((t) => (
                  <option key={t} value={t}>
                    {TIPO_FONTE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Descrição do preço encontrado</label>
              <Input
                className="h-8"
                placeholder="Ex.: item equivalente no contrato nº..."
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Órgão ou fornecedor</label>
              <Input
                className="h-8"
                value={orgaoOuFornecedor}
                onChange={(e) => setOrgaoOuFornecedor(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Valor unitário (R$)</label>
              <Input
                className="h-8"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={valorUnitario}
                onChange={(e) => setValorUnitario(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Data de referência do preço</label>
              <input
                type="date"
                className={SELECT_CLASS}
                value={dataReferencia}
                onChange={(e) => setDataReferencia(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Evidência (obrigatória)</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Data e hora de acesso</label>
                <input
                  type="datetime-local"
                  className={SELECT_CLASS}
                  value={dataHoraAcesso}
                  onChange={(e) => setDataHoraAcesso(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">URL (se houver)</label>
                <Input
                  className="h-8"
                  placeholder="https://..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Arquivo de evidência (se houver)</label>
                <Input
                  type="file"
                  onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Observação da evidência</label>
                <Textarea
                  placeholder="Ex.: e-mail do fornecedor de .../.../...., anexado ao processo físico."
                  value={descricaoEvidencia}
                  onChange={(e) => setDescricaoEvidencia(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Informe a URL ou anexe um arquivo — pelo menos um dos dois é obrigatório (IN
              65/2021: nenhum preço entra na estimativa sem evidência).
            </p>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={enviando} size="sm">
              {enviando ? "Cadastrando…" : "Cadastrar fonte"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
