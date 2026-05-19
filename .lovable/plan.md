## Problema

Dois pontos a resolver:

1. **Erro "NO OBJECT GENERATED"** ao anexar currículo — vem do `generateText` + `experimental_output` quando o modelo não consegue produzir JSON estruturado válido. Causas mais comuns no nosso fluxo:
   - PDF escaneado (imagem) → `pdfjs-dist` extrai texto vazio ou quase vazio → modelo não tem o que retornar
   - Texto muito curto / ruído → modelo devolve algo que não bate com o schema Zod
   - `experimental_output` com `Output.object` é frágil em alguns modelos do Gemini

2. **Cadastro manual** não existe — hoje só dá pra criar candidato via upload.

## Plano

### 1. Robustez do parser de currículo (`src/lib/cv-parser.functions.ts`)

- Trocar `generateText` + `experimental_output` por `generateObject` (AI SDK) com o mesmo `ExtractedSchema` — API feita exatamente pra saída estruturada, muito mais estável.
- Schema mais tolerante: todos os campos opcionais exceto `nome`; se o modelo não achar nome, usar fallback "Candidato sem nome" + nome do arquivo, em vez de quebrar.
- Detectar PDF "ruim" antes de chamar a IA: se `cvText` tiver menos de ~80 caracteres alfabéticos, pular a IA e criar candidato com:
   - `nome` = nome do arquivo (sem extensão, limpo)
   - `observacoes` = "PDF não pôde ser lido automaticamente (possivelmente escaneado). Edite manualmente."
   - status `triagem`, PDF salvo normalmente
- Try/catch em volta da chamada de IA: se falhar, mesmo fallback acima — sempre cria o candidato e sobe o PDF, nunca trava o upload em massa.
- Retornar `{ candidato, aiFailed: boolean }` pro frontend mostrar aviso quando a IA falhou.

### 2. Melhor extração de texto (`src/lib/pdf-extract.ts`)

- Subir limite de 10 → 20 páginas.
- Helper `isLikelyScanned(text)` → usado no item 1.

### 3. Feedback no `BulkUpload.tsx`

- Quando `aiFailed = true`, marcar item como "criado (sem IA)" com ícone de alerta amarelo em vez de "criado" verde — usuário sabe que precisa editar.
- Mensagens de erro mais claras (mostrar o erro real do servidor).

### 4. Cadastro manual

- Reaproveitar `CandidatoEditDialog` para também criar:
   - Aceitar prop `candidato: CandidatoRow | null` (já aceita) — quando `null` e `open=true`, faz `insert` em vez de `update`.
   - Título dinâmico: "Novo candidato" / "Editar candidato".
   - No insert: `recrutador_id = user.id`, `status = 'triagem'` por padrão.
- Em `/candidatos`: botão **"+ Novo candidato"** no header, ao lado do título, abre o dialog em modo criação.

### Fora de escopo

- OCR de PDFs escaneados (Vision API) — fica como melhoria futura; por ora o candidato é criado com nome do arquivo e marcado para edição.
- Mudanças no pipeline / dashboard.

## Detalhes técnicos

- `generateObject` vem de `import { generateObject } from "ai"` — já temos o pacote.
- Validar `output.nome` antes de inserir; se vazio, usar `path.basename(fileName, ".pdf")`.
- Para criação manual, o dialog faz `supabase.from("candidatos").insert({...}).select().single()` quando `candidato === null`.
- Sem mudança de schema do banco — campos atuais bastam.
