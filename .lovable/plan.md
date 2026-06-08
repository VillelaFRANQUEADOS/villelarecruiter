# Melhorar IA de extração + botão "Reprocessar"

Dois eixos: (1) elevar a qualidade da leitura padrão sem perder velocidade; (2) adicionar um modo "deep" acionado manualmente pelo botão Reprocessar na listagem.

## 1. Extração padrão mais robusta (mantendo performance)

`src/lib/file-extract.ts`
- PDF: extrair texto de **todas as páginas** (já faz) mas elevar limiar `hasEnoughText` de 120 para ~250 caracteres por página média (detecta PDFs parcialmente escaneados). Quando texto fraco → renderizar páginas como imagem (cap: até 6 páginas, hoje sem limite — adicionar guarda).
- Render: aumentar `scale` de 1.6 → 2.0 para OCR mais nítido; JPEG quality 0.9.
- DOCX: além de `extractRawText`, fazer fallback para `convertToHtml` quando texto < 100 chars (alguns DOCX guardam tudo em tabelas).
- Adicionar utilitário `extractFromFileDeep(file)` que sempre renderiza todas as páginas do PDF como imagem (mesmo com texto), retornando texto + imagens para análise multimodal completa.

`src/lib/cv-parser.functions.ts`
- Aumentar `cvText` de 14000 → 24000 chars e `images` de 3 → 8 (capa do currículo costuma estar nas primeiras páginas, mas precisamos cobrir múltiplas).
- Reforçar prompt com exemplos negativos e regras anti-alucinação para nome (não confundir com nome de empresa/curso) e cidade/UF (priorizar bloco de contato/endereço).
- Já existem fallbacks por regex (telefone/email/UF) — manter.

## 2. Modo "Reprocessar" (deep, sob demanda)

### Backend — nova server function

`src/lib/cv-parser.functions.ts` → `reprocessCandidato`
- Input: `{ candidatoId: string }`.
- Fluxo:
  1. Buscar candidato no banco (RLS aplica). Se sem `curriculo_url` ou não `drive:` → erro amigável.
  2. Baixar arquivo do Drive (reutiliza lógica de `getCurriculoContent`).
  3. Extração **deep**: chamar Gemini multimodal direto com o **arquivo original como anexo** (PDF/imagem via base64 `file` part da AI SDK), além do texto extraído server-side simples. Usar `google/gemini-2.5-pro` (mais robusto que o flash preview padrão).
  4. Normalizar (telefone/email/UF) como hoje.
  5. **Merge não-destrutivo**: para cada campo (`nome`, `telefone`, `email`, `cidade`, `estado`), só sobrescrever se o valor atual estiver vazio/null OU se a IA retornou valor e o atual nunca foi editado manualmente. Como heurística simples e segura: **só preencher campos vazios** (o usuário marcou caixas; respeitamos o que ele já editou). Documentar isso no toast ("preenchidos N campos vazios").
  6. Atualizar `ultimo_reprocessamento_at` (timestamptz) — nova coluna.
  7. Retornar `{ updatedFields: string[], ultimo_reprocessamento_at }`.

### Migration

Adicionar coluna na tabela `candidatos`:
- `ultimo_reprocessamento_at timestamptz null`

(sem alteração de RLS — herda das policies existentes da tabela.)

### Tipos

- `src/lib/auth.tsx` `CandidatoRow`: adicionar `ultimo_reprocessamento_at: string | null`.
- `src/lib/ats-data.ts` `CANDIDATOS_SELECT`: adicionar campo.

### UI — botão na listagem

`src/routes/_authenticated/candidatos.tsx`, célula PDF (linhas 489–500):
- Adicionar botão "Reprocessar" (ícone `RefreshCw`) ao lado do PDF, visível apenas quando `r.curriculo_url` existir.
- Estado local `reprocessing: Set<string>` para spinner por linha.
- Click → confirma rapidamente (toast loading), chama `reprocessCandidato({ data: { candidatoId: r.id } })`, ao concluir mostra toast com nº de campos atualizados e invalida queries.
- Abaixo do botão (texto pequeno mute), quando `r.ultimo_reprocessamento_at` existir: "Reprocessado em DD/MM HH:mm".

### Erros

- 429 (rate limit) / 402 (créditos) / falha Drive → toast com mensagem clara, sem alterar dados.

## Resumo de arquivos

**Criar:**
- migration: adiciona `ultimo_reprocessamento_at` em `candidatos`.

**Editar:**
- `src/lib/file-extract.ts` — limiar OCR, scale, fallback DOCX, novo `extractFromFileDeep`.
- `src/lib/cv-parser.functions.ts` — prompt reforçado, limites maiores, nova função `reprocessCandidato` (modo deep, merge não-destrutivo).
- `src/lib/auth.tsx` — adicionar campo `ultimo_reprocessamento_at`.
- `src/lib/ats-data.ts` — incluir campo no SELECT.
- `src/routes/_authenticated/candidatos.tsx` — botão Reprocessar + indicador + timestamp.

Nada muda no fluxo de bulk upload — continua usando a extração rápida atual já melhorada.

## Perguntas (responda antes de implementar se quiser ajustar)

1. **Merge**: confirmar que o reprocessamento só preenche campos **vazios** (nunca sobrescreve dados existentes, mesmo que pareçam errados)? Alternativa: sobrescrever sempre, mantendo histórico.
2. **Modelo deep**: usar `google/gemini-2.5-pro` (mais caro/lento mas melhor)? Ou manter `gemini-3-flash-preview` e apenas enviar o arquivo completo como anexo?
