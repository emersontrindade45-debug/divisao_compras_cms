import { useEffect, useRef, useState } from "react";

/** Conta segundos decorridos enquanto `ativo` for true; reinicia quando `ativo` volta a true. */
export function useElapsedSeconds(ativo: boolean): number {
  const [segundos, setSegundos] = useState(0);
  const inicioRef = useRef<number | null>(null);

  useEffect(() => {
    if (!ativo) {
      inicioRef.current = null;
      return;
    }

    inicioRef.current = Date.now();
    const intervalo = setInterval(() => {
      setSegundos(Math.floor((Date.now() - (inicioRef.current ?? Date.now())) / 1000));
    }, 1000);

    return () => clearInterval(intervalo);
  }, [ativo]);

  return ativo ? segundos : 0;
}
