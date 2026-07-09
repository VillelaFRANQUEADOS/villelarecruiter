# Sempre usar IA para leitura do nome

## Problema atual
Em `src/lib/cv-parser.functions.ts`, quando o regex encontra email OU telefone no texto, o fluxo pula a IA e usa `regexNome` (heurística determinística) como nome. Isso faz o nome frequentemente vir errado (empresa, cargo, escola). A IA só entra em ação quando não há contato detectável.

O reprocessamento já usa IA, mas só sobrescreve o nome se ele for "plausível" — mantendo restrições que podem impedir correções válidas.

## Mudanças

### 1. `parseAndCreateCandidato` (upload inicial)
- Rodar SEMPRE a chamada à IA (`gemini-2.5-flash`) para obter o nome, mesmo quando regex já encontrou email/telefone.
- Manter regex como fonte primária para telefone, email, cidade e estado (rápido e barato).
- Estratégia de economia: enviar à IA apenas o texto do CV (sem imagens) quando o regex já resolveu contato — reduz custo mantendo qualidade do nome. Imagens/OCR só quando não há texto útil.
- Merge final:
  - nome: IA (se retornar string não-vazia e plausível), senão `cleanFileName(fileName)`
  - telefone/email/cidade/estado: regex, com IA como fallback
- Se a chamada de IA falhar, cair no `regexNome` atual (comportamento antigo) e registrar em `observacoes`.

### 2. `reprocessCandidato` (reprocessamento)
- Remover a restrição `isPlausibleName` que hoje bloqueia atualizações de nome (ex.: nomes com números, iniciais, acentos incomuns).
- Regra nova: se a IA retornar `nomeNew` não-vazio e diferente do atual (case-insensitive, ignorando espaços), sobrescrever `nome`.
- Manter o restante (telefone, email, cidade, estado) como merge não-destrutivo.

## Arquivos afetados
- `src/lib/cv-parser.functions.ts` — único arquivo alterado.

## Impacto de custo
Adiciona 1 chamada `gemini-2.5-flash` por upload (antes era pulada quando havia contato via regex). Como só enviamos texto (sem imagens) nesse caminho, o custo por currículo permanece baixo.
