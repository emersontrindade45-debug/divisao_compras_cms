import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "../DataTable";

type Row = { nome: string; valor: number };
const columns: ColumnDef<Row>[] = [
  { accessorKey: "nome", header: "Nome" },
  { accessorKey: "valor", header: "Valor" },
];
const data: Row[] = [
  { nome: "Item A", valor: 10 },
  { nome: "Item B", valor: 20 },
];

describe("DataTable", () => {
  it("renderiza cabeçalhos e linhas", () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText("Nome")).toBeInTheDocument();
    expect(screen.getByText("Item A")).toBeInTheDocument();
    expect(screen.getByText("Item B")).toBeInTheDocument();
  });

  it("mostra estado vazio quando não há dados", () => {
    render(<DataTable columns={columns} data={[]} />);
    expect(screen.getByText(/nenhum resultado/i)).toBeInTheDocument();
  });
});
