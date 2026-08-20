/**
 * Aplica a máscara padrão XX.XXX.XXX/XXXX-XX a um CNPJ de 14 dígitos sem
 * separadores.
 *
 * Existe porque `EmpresaCandidataFornecedor.cnpj` (M27) é gravado sem máscara
 * (formato bruto do dump da Receita Federal, validado por
 * `linhaCandidatoCnpjSchema`), enquanto `Fornecedor.cnpj` (M24/planilha) é
 * mascarado — comparar/gravar candidato como Fornecedor exige converter para
 * o mesmo formato. Não valida a entrada: quem chama já garantiu 14 dígitos;
 * uma entrada que não bate no padrão volta inalterada (nunca lança).
 */
export function mascararCnpj(cnpjSemMascara: string): string {
  return cnpjSemMascara.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}
