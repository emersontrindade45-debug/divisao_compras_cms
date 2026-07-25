/**
 * Classe base dos `<select>` nativos usados nos filtros e formulários.
 *
 * A UI base (Base UI) tem um `Select` completo, mas os filtros densos usam o
 * elemento nativo — mais leve e com comportamento de teclado do sistema. Esta
 * constante existe para que todos tenham a mesma altura e foco; largura fica a
 * cargo de cada uso, via `cn(SELECT_CLASS, "w-52")`.
 */
export const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus:ring-2 focus:ring-ring/50";
