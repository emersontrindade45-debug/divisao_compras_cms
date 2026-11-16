/**
 * O menu do usuário quebrava ao abrir em produção (2026-11-16) com "Base UI error #31":
 * `DropdownMenuLabel` (Menu.GroupLabel) estava fora de um `DropdownMenuGroup`. Nenhum teste
 * abria o menu, então o defeito existia desde a criação do componente sem ninguém ver.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/actions/auth", () => ({ logout: vi.fn() }));

import { UserMenu } from "../UserMenu";

describe("UserMenu", () => {
  it("abre sem erro e mostra nome, papel e os itens", async () => {
    render(<UserMenu name="Hélia Maria dos Santos" role="aprovacao" />);

    fireEvent.click(screen.getByRole("button", { name: "Menu do usuário" }));

    expect(await screen.findByText("Hélia Maria dos Santos")).toBeInTheDocument();
    expect(screen.getByText("Aprovação")).toBeInTheDocument();
    expect(screen.getByText("Guia de uso")).toBeInTheDocument();
    expect(screen.getByText("Sair")).toBeInTheDocument();
  });

  it("o item Alterar senha leva para /conta/senha", async () => {
    render(<UserMenu name="Douglas Cardoso" role="aprovacao" />);

    fireEvent.click(screen.getByRole("button", { name: "Menu do usuário" }));

    const item = await screen.findByText("Alterar senha");
    expect(item.closest("a")).toHaveAttribute("href", "/conta/senha");
  });
});
