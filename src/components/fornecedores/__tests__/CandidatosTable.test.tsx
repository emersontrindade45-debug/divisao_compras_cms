import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CandidatosTable } from "../CandidatosTable";
import type { CandidatoFornecedorListItem } from "@/lib/actions/candidatosFornecedor";

vi.mock("../PromoverCandidatoButton", () => ({
  PromoverCandidatoButton: ({ jaCadastrado }: { jaCadastrado: boolean }) => (
    <span>{jaCadastrado ? "Já cadastrado" : "Promover"}</span>
  ),
}));

const CANDIDATO: CandidatoFornecedorListItem = {
  id: "c-1",
  cnpj: "12345678000199",
  cnpjMascarado: "12.345.678/0001-99",
  razaoSocial: "FERRAGENS BAIXADA LTDA",
  nomeFantasia: "Ferragens",
  municipio: "Santos",
  estado: "SP",
  cnaePrincipalCodigo: "4744001",
  cnaePrincipalDescricao: "Comercio varejista de ferragens",
  categoriaSugerida: ["ferragens"],
  email: null,
  telefone: null,
  jaCadastrado: false,
};

describe("CandidatosTable", () => {
  it("mostra razão social, CNPJ mascarado e município", () => {
    render(<CandidatosTable candidatos={[CANDIDATO]} categoriasDisponiveis={["ferragens"]} />);
    expect(screen.getByText("FERRAGENS BAIXADA LTDA")).toBeInTheDocument();
    expect(screen.getByText("12.345.678/0001-99")).toBeInTheDocument();
    expect(screen.getByText("Santos/SP")).toBeInTheDocument();
  });

  it("mostra o CNAE com código e descrição", () => {
    render(<CandidatosTable candidatos={[CANDIDATO]} categoriasDisponiveis={["ferragens"]} />);
    expect(screen.getByText("4744001")).toBeInTheDocument();
    expect(screen.getByText(/Comercio varejista de ferragens/)).toBeInTheDocument();
  });
});
