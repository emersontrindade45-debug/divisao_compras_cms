import { describe, expect, it, vi } from "vitest";

describe("enfileirarBuscaVigencia", () => {
  it("não deixa duas tarefas rodarem ao mesmo tempo: a segunda só começa depois que a primeira termina", async () => {
    vi.resetModules();
    const { enfileirarBuscaVigencia } = await import("../filaVigenciaContrato");

    const eventos: string[] = [];
    let resolverPrimeira: () => void = () => {};
    const primeiraPromise = new Promise<void>((resolve) => {
      resolverPrimeira = resolve;
    });

    const tarefa1 = () => {
      eventos.push("tarefa1:inicio");
      return primeiraPromise.then(() => {
        eventos.push("tarefa1:fim");
      });
    };
    const tarefa2 = async () => {
      eventos.push("tarefa2:inicio");
    };

    const p1 = enfileirarBuscaVigencia(tarefa1);
    const p2 = enfileirarBuscaVigencia(tarefa2);

    // Dá espaço para microtasks rodarem sem resolver a primeira tarefa.
    await Promise.resolve();
    await Promise.resolve();

    // A segunda tarefa não pode ter começado enquanto a primeira está presa.
    expect(eventos).toEqual(["tarefa1:inicio"]);

    resolverPrimeira();
    await p1;
    await p2;

    expect(eventos).toEqual(["tarefa1:inicio", "tarefa1:fim", "tarefa2:inicio"]);
  });

  it("uma tarefa que rejeita não trava a fila para a próxima", async () => {
    vi.resetModules();
    const { enfileirarBuscaVigencia } = await import("../filaVigenciaContrato");

    const tarefaComErro = () => Promise.reject(new Error("falhou"));
    const tarefaOk = async () => "ok";

    await expect(enfileirarBuscaVigencia(tarefaComErro)).rejects.toThrow("falhou");
    await expect(enfileirarBuscaVigencia(tarefaOk)).resolves.toBe("ok");
  });

  it("propaga o valor de retorno de cada tarefa para quem chamou", async () => {
    vi.resetModules();
    const { enfileirarBuscaVigencia } = await import("../filaVigenciaContrato");

    const resultado = await enfileirarBuscaVigencia(async () => 42);
    expect(resultado).toBe(42);
  });
});
