// Base de primeiros nomes (prenomes) do Censo IBGE, usada como sinal extra
// no parser determinístico de currículos para confirmar se uma linha parece
// mesmo o nome de uma pessoa.
//
// Fonte: Censo Demográfico (IBGE), dados tratados e publicados em
// https://github.com/datasets-br/prenomes (arquivo nomes-censos-ibge.csv).
// Mantivemos apenas nomes com pelo menos 50 ocorrências acumuladas nos
// censos (~47,5 mil nomes), já normalizados em minúsculas e sem acento,
// para casar diretamente com a normalização (normKey) usada no parser.
import namesJson from "./data/nomes-ibge.json";

export const BR_FIRST_NAMES: Set<string> = new Set(namesJson as string[]);

/** Verifica se uma palavra já normalizada (minúscula, sem acento) é um primeiro nome comum no Brasil. */
export function isKnownBrFirstName(normalizedWord: string): boolean {
  return BR_FIRST_NAMES.has(normalizedWord);
}

/**
 * Conta quantas das primeiras palavras (até `max`) de uma lista já
 * normalizada batem com primeiros nomes conhecidos do IBGE. Útil para
 * pontuar linhas candidatas a "nome completo" (ex.: "João Pedro Silva").
 */
export function countKnownFirstNames(normalizedWords: string[], max = 2): number {
  let count = 0;
  for (let i = 0; i < Math.min(max, normalizedWords.length); i++) {
    if (BR_FIRST_NAMES.has(normalizedWords[i])) count++;
  }
  return count;
}
