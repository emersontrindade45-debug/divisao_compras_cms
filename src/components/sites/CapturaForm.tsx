"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { SiteFixture } from "@/lib/fixtures/sites";

export interface NovaCapturaData {
  siteId: string;
  url: string;
  produto: string;
  valorUnitario: number;
  dataHoraAcesso: string;
  evidencia: string;
}

interface CapturaFormProps {
  sites: SiteFixture[];
  processoId: string;
  onSubmit: (data: NovaCapturaData) => void;
}

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus:ring-2 focus:ring-ring/50";

export function CapturaForm({ sites, processoId, onSubmit }: CapturaFormProps) {
  void processoId; // reserved for future server action integration
  const [siteId, setSiteId] = useState("");
  const [url, setUrl] = useState("");
  const [produto, setProduto] = useState("");
  const [valorUnitario, setValorUnitario] = useState("");
  const [dataHoraAcesso, setDataHoraAcesso] = useState(
    () => new Date().toISOString().slice(0, 16),
  );
  const [evidencia, setEvidencia] = useState("");

  const selectedSite = sites.find((s) => s.id === siteId);
  const isBloqueado =
    selectedSite !== undefined &&
    (selectedSite.isMarketplace || selectedSite.lista === "vermelha");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!siteId || !url || !produto || !valorUnitario || !dataHoraAcesso) return;
    onSubmit({
      siteId,
      url,
      produto,
      valorUnitario: parseFloat(valorUnitario),
      dataHoraAcesso: new Date(dataHoraAcesso).toISOString(),
      evidencia,
    });
    setSiteId("");
    setUrl("");
    setProduto("");
    setValorUnitario("");
    setDataHoraAcesso(new Date().toISOString().slice(0, 16));
    setEvidencia("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Registrar nova captura</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Site</label>
              <select
                className={SELECT_CLASS}
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                required
              >
                <option value="">Selecione um site</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">URL da página</label>
              <Input
                className="h-8"
                placeholder="https://..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Produto / item</label>
              <Input
                className="h-8"
                placeholder="Descrição do produto encontrado"
                value={produto}
                onChange={(e) => setProduto(e.target.value)}
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
              <label className="text-sm font-medium">Nome do arquivo de evidência</label>
              <Input
                className="h-8"
                placeholder="captura-site-data.png"
                value={evidencia}
                onChange={(e) => setEvidencia(e.target.value)}
              />
            </div>
          </div>

          {isBloqueado && (
            <div className="rounded-lg border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
              <strong>Atenção:</strong> este site está na lista vermelha ou é um marketplace. Capturas de fontes bloqueadas não podem ser utilizadas como evidência em pesquisa de preços pública.
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={isBloqueado} size="sm">
              Registrar captura
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
