import { describe, it, expect, vi } from "vitest";
import { processarComConcorrencia } from "../processarComConcorrencia";

describe("processarComConcorrencia", () => {
  it("nao executa mais que o limite de tarefas simultaneamente", async () => {
    let emExecucao = 0;
    let picoSimultaneo = 0;

    await processarComConcorrencia([1, 2, 3, 4, 5, 6], 2, async (item) => {
      emExecucao++;
      picoSimultaneo = Math.max(picoSimultaneo, emExecucao);
      await new Promise((resolve) => setTimeout(resolve, 10));
      emExecucao--;
      return item * 2;
    });

    expect(picoSimultaneo).toBeLessThanOrEqual(2);
  });

  it("preserva a ordem dos resultados independente da ordem de conclusao", async () => {
    const resultado = await processarComConcorrencia([10, 5, 1], 3, async (item) => {
      await new Promise((resolve) => setTimeout(resolve, item));
      return item;
    });

    expect(resultado).toEqual([10, 5, 1]);
  });

  it("isola falha de um item sem interromper os demais", async () => {
    const onErro = vi.fn();
    const resultado = await processarComConcorrencia(
      [1, 2, 3],
      3,
      async (item) => {
        if (item === 2) throw new Error("falhou no item 2");
        return item;
      },
      onErro,
    );

    expect(resultado).toEqual([1, undefined, 3]);
    expect(onErro).toHaveBeenCalledWith(2, expect.any(Error), 1);
  });
});
