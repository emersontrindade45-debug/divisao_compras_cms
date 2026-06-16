import {
  CAMADAS_GEOGRAFICAS,
  type NomeCamadaGeografica,
  type CamadaGeografica,
} from "./camadaGeografica";

interface FornecedorBase {
  cidade: string;
  estado: string;
  categoria: string[];
}

function pertenceACamada(
  fornecedor: FornecedorBase,
  camada: CamadaGeografica
): boolean {
  if (camada.cidades) return camada.cidades.includes(fornecedor.cidade);
  if (camada.estados) return camada.estados.includes(fornecedor.estado);
  return false;
}

export function buscarFornecedorPorCamada<T extends FornecedorBase>(
  fornecedores: T[],
  nicho: string
): { camadaEncontrada: NomeCamadaGeografica | null; fornecedores: T[] } {
  const candidatosNicho = fornecedores.filter((f) =>
    f.categoria.includes(nicho)
  );

  for (const camada of CAMADAS_GEOGRAFICAS) {
    const naCamada = candidatosNicho.filter((f) => pertenceACamada(f, camada));
    if (naCamada.length > 0) {
      return { camadaEncontrada: camada.nome, fornecedores: naCamada };
    }
  }

  return { camadaEncontrada: null, fornecedores: [] };
}
