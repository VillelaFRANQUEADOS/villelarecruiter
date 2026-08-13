// Normalização de texto compartilhada entre parser de currículo, validação
// de cidade IBGE e demais comparações. Usada tanto no processamento inicial
// (upload) quanto no reprocessamento.
//
// IMPORTANTE: isto é usado só para COMPARAR texto (ex.: contra a lista de
// primeiros nomes do IBGE, que não tem acento, ou contra o cadastro de
// municípios). O valor final salvo no cadastro do candidato continua sendo
// o texto original extraído do currículo, com os acentos como estiverem
// no documento — nunca a versão normalizada.

/** Remove marcas diacríticas (acentos, til, cedilha etc.) de uma string. */
export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Normaliza uma string para comparação: remove acentos, converte para
 * minúsculas, colapsa espaços e remove espaços nas pontas.
 */
export function normKey(s: string): string {
  return stripDiacritics(s).toLowerCase().replace(/\s+/g, " ").trim();
}
