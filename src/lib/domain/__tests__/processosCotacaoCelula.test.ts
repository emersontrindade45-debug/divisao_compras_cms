import { describe, expect, it } from "vitest";
import { acrescentarProcessoCotacao } from "../processosCotacaoCelula";

describe("acrescentarProcessoCotacao", () => {
  it("preenche a célula vazia com o processo", () => {
    expect(acrescentarProcessoCotacao("", "908/2024")).toBe("908/2024");
    expect(acrescentarProcessoCotacao(null, "908/2024")).toBe("908/2024");
    expect(acrescentarProcessoCotacao(undefined, "908/2024")).toBe("908/2024");
  });

  it("ACRESCENTA sem apagar o processo que já estava lá", () => {
    expect(acrescentarProcessoCotacao("908/2024", "13137/2024")).toBe("908/2024, 13137/2024");
  });

  it("acumula vários processos ao longo do tempo", () => {
    let celula = "";
    for (const p of ["908/2024", "13137/2024", "105/2026"]) {
      celula = acrescentarProcessoCotacao(celula, p);
    }
    expect(celula).toBe("908/2024, 13137/2024, 105/2026");
  });

  it("não duplica quando o mesmo processo é reenviado", () => {
    expect(acrescentarProcessoCotacao("908/2024, 105/2026", "908/2024")).toBe("908/2024, 105/2026");
  });

  it("ignora espaçamento irregular já existente na célula", () => {
    expect(acrescentarProcessoCotacao("908/2024 ,  105/2026", "13137/2024")).toBe(
      "908/2024, 105/2026, 13137/2024",
    );
  });

  it("descarta entradas vazias de célula mal formada (vírgulas soltas)", () => {
    expect(acrescentarProcessoCotacao("908/2024, , ,", "105/2026")).toBe("908/2024, 105/2026");
  });

  it("processo vazio não altera a célula nem acrescenta vírgula", () => {
    expect(acrescentarProcessoCotacao("908/2024", "")).toBe("908/2024");
    expect(acrescentarProcessoCotacao("908/2024", "   ")).toBe("908/2024");
  });

  it("trata '908/2024' e '0908/2024' como processos distintos", () => {
    // Não normalizamos zero à esquerda: são identificadores, e presumir equivalência poderia
    // esconder um processo real diferente.
    expect(acrescentarProcessoCotacao("908/2024", "0908/2024")).toBe("908/2024, 0908/2024");
  });
});
