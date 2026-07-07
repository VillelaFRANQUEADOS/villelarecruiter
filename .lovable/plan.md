# Objetivo

1. Ler os currículos de forma consistente, sem depender de quem enviou.
2. Padronizar cidades pela nomenclatura oficial IBGE — inclusive registros já existentes.
3. Permitir editar a coluna **Origem** direto na listagem, clicando sobre ela (como já acontece com a Observação).

---

## 1. Leitura consistente dos currículos

Hoje, em `src/lib/cv-parser.functions.ts` (`parseAndCreateCandidato`), quando o parser determinístico encontra **e-mail OU telefone**, ele usa somente regex e nem chama a IA. Isso faz com que currículos vindos de layouts pesados (Pandapé, LinkedIn PDF, Canva) sejam salvos com nome/cidade errados, dependendo do modelo que o recrutador anexou.

**Ajuste:**

- Chamar **sempre** a IA quando houver texto (>= 80 chars) ou imagens, mesmo que o regex já tenha email/telefone.
- Fazer **merge** dos dois resultados com regras claras:
  - `telefone` / `email`: preferir o extraído pela IA quando válido; cair para o regex.
  - `nome`: preferir IA; se vazio/curto/blocklisted (Pandapé, Grupo Villela, etc.), cair para o determinístico; se ambos vazios, usar o nome do arquivo.
  - `cidade` / `estado`: rodar `validateCity` (IBGE) primeiro com o par vindo da IA; se não validar, tentar com o par do determinístico; se ainda não validar, salvar `cidade_original_extraida` como hoje.
- Manter fallback puro para regex apenas quando a IA falhar ou não houver texto.
- Nenhuma mudança visual, nenhum novo campo no banco.

Resultado: extração independente do formato/recrutador do envio.

---

## 2. Padronização IBGE (inclusive registros antigos)

Além da validação já feita nos novos, vamos normalizar a base histórica.

**Server function nova** (`revalidateAllCities`, admin-only, em `src/lib/candidatos-admin.functions.ts`):

- Percorre todos os candidatos em lotes de 500.
- Para cada linha, roda `validateCity(cidade_original_extraida || cidade, estado)`.
- Se validar: atualiza `cidade`, `estado`, `codigo_ibge`, `cidade_validada = true`, limpa `cidade_original_extraida`.
- Se não validar: move o texto atual de `cidade` para `cidade_original_extraida` (quando ainda vazio), zera `codigo_ibge`, marca `cidade_validada = false`.
- Retorna `{ total, validadas, invalidas }`.

**UI:** botão discreto **"Padronizar cidades (IBGE)"** no topo da listagem de candidatos, visível somente para admin, exibindo o resultado num toast. Sem nova tela.

Filtro de cidades da listagem continua mostrando apenas `cidade_validada = true`, então a base ganha consistência progressiva.

---

## 3. Edição inline da coluna Origem

Mesmo padrão da coluna **Observação**:

- Clicar na célula abre um `<select>` inline com as opções `ORIGEM_LABELS` (LinkedIn, Pandapé, Indicação, Site, Outros).
- Ao escolher, faz `update` em `candidatos.origem_curriculo` via `supabase`, mostra toast de sucesso/erro e fecha o editor.
- `Esc` cancela. Sem novo modal.
- Reaproveita permissões atuais da tabela (RLS já permite ao recrutador dono e admin editar).

Arquivo afetado: `src/routes/_authenticated/candidatos.tsx` (estado `editingOrigemId` + handler `saveOrigem`).

---

## Detalhes técnicos

**Arquivos alterados**
- `src/lib/cv-parser.functions.ts` — remover o short-circuit "regex-only" e implementar merge IA + determinístico + IBGE.
- `src/routes/_authenticated/candidatos.tsx` — célula de Origem editável + botão admin de padronização.

**Arquivo novo**
- `src/lib/candidatos-admin.functions.ts` — `revalidateAllCities` (`requireSupabaseAuth` + checagem `has_role('admin')`, usa `supabaseAdmin` só para o UPDATE em lote).

**Sem alterações**
- Nenhuma migração de schema (colunas `origem_curriculo`, `cidade_validada`, `codigo_ibge`, `cidade_original_extraida` já existem).
- Nada muda em `candidate-parser.ts`, `city-validation.ts`, layout, filtros ou paginação.

## Critério de aceite

- Currículos em qualquer layout (Pandapé, LinkedIn, Canva, Word simples) chegam com nome/cidade/estado corretos com muito menor incidência de erro.
- Após rodar "Padronizar cidades (IBGE)", registros antigos com cidade grafada de forma divergente (ex.: "São paulo", "SAO PAULO", "Rio Janeiro") passam para a grafia oficial ou vão para `cidade_original_extraida` com `cidade_validada = false`.
- Clicar na célula Origem abre o select, salva e reflete na lista sem recarregar a página.
