-- M29: vigência dos contratos gerados pela contratação de um candidato.
--
-- Buscada SOB DEMANDA (clique do analista), porque o PNCP não expõe "contratos
-- desta compra" — o vínculo só existe dentro de cada contrato, no campo
-- numeroControlePncpCompra, e é preciso varrer os contratos do órgão no ano.
--
-- Duas colunas nulas, sem default e sem índice: a escrita é pontual e a leitura
-- vem sempre junto do candidato. `vigenciaBuscadaEm` existe para separar "ainda
-- não procurei" de "procurei e não há contrato" (CLAUDE.md §9.93).
ALTER TABLE "resultados_similaridade" ADD COLUMN     "contratosVigencia" JSONB,
ADD COLUMN     "vigenciaBuscadaEm" TIMESTAMP(3);
