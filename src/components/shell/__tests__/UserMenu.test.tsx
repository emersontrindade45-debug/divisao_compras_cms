/**
 * O menu do usuário quebrava ao abrir em produção (2026-11-16) com "Base UI error #31":
 * `DropdownMenuLabel` (Menu.GroupLabel) estava fora de um `DropdownMenuGroup`. Nenhum teste
 * abria o menu, então o defeito existia desde a criação do componente sem ninguém ver.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock("@/lib/actions/auth", () => ({ logout: mocks.logout }));

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

  // "Sair" usava `onSelect` (padrão do Radix); o MenuItem do Base UI não tem essa prop, e o clique
  // não fazia nada em produção (2026-11-16).
  it("clicar em Sair chama o logout", async () => {
    render(<UserMenu name="Pedro Tavares da Costa" role="aprovacao" />);

    fireEvent.click(screen.getByRole("button", { name: "Menu do usuário" }));
    fireEvent.click(await screen.findByText("Sair"));

    await waitFor(() => expect(mocks.logout).toHaveBeenCalledTimes(1));
  });
});
