export type NomeCamadaGeografica =
  | "baixada_santista"
  | "estado_sp"
  | "sudeste"
  | "sul"
  | "centro_oeste";

export interface CamadaGeografica {
  nome: NomeCamadaGeografica;
  cidades?: string[];
  estados?: string[];
}

export const CAMADAS_GEOGRAFICAS: CamadaGeografica[] = [
  {
    nome: "baixada_santista",
    cidades: [
      "Santos",
      "São Vicente",
      "Praia Grande",
      "Cubatão",
      "Guarujá",
      "Bertioga",
      "Mongaguá",
      "Itanhaém",
      "Peruíbe",
    ],
  },
  { nome: "estado_sp", estados: ["SP"] },
  { nome: "sudeste", estados: ["SP", "RJ", "MG", "ES"] },
  { nome: "sul", estados: ["PR", "SC", "RS"] },
  { nome: "centro_oeste", estados: ["MT", "MS", "GO", "DF"] },
];

export function proximaCamada(
  atual: NomeCamadaGeografica
): NomeCamadaGeografica | null {
  const idx = CAMADAS_GEOGRAFICAS.findIndex((c) => c.nome === atual);
  const proxima = CAMADAS_GEOGRAFICAS[idx + 1];
  return proxima ? proxima.nome : null;
}
