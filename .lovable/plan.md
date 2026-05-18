## Objetivo
Transformar o RecrutaCRM em um ATS operacional ultra-simples: o recrutador arrasta PDFs em massa e a IA cria os candidatos automaticamente.

## Mudanças no banco de dados

**Atualizar enum `candidato_status`** para os 7 estágios novos:
- `triagem`, `aguardando_contato`, `remarcar`, `sem_interesse`, `agendado`, `compareceu`, `contratado`
- Migrar registros antigos (`novo` → `triagem`, `reprovado` → `sem_interesse`)
- Default passa a ser `triagem`

**Tabela `candidatos`** — adicionar campos que a IA vai extrair, tornar opcionais os que hoje são obrigatórios:
- `email` (novo)
- `experiencias` (text, novo)
- Tornar `regiao` e `vaga` opcionais (a IA nem sempre extrai)
- Manter `curriculo_url` apontando para o Storage

## Backend (TanStack server functions)

Criar `src/lib/cv-parser.functions.ts`:
- `parseAndCreateCandidato` — recebe um PDF em base64, extrai texto, chama Lovable AI (`google/gemini-3-flash-preview`) com schema estruturado para extrair `{ nome, telefone, email, cidade, experiencias }`, faz upload no bucket `curriculos`, insere na tabela `candidatos` com status `triagem` e `recrutador_id = userId`.
- Protegida com `requireSupabaseAuth`.
- Processada uma por vez no cliente (concorrência limitada a 3) para suportar centenas sem travar.

Setup do AI Gateway helper em `src/lib/ai-gateway.ts` (provider OpenAI-compatible com `Lovable-API-Key`).

## Frontend

**Página `/candidatos` — Upload em massa**
- Dropzone grande aceitando múltiplos PDFs (drag-and-drop).
- Lista de progresso por arquivo: pendente → lendo IA → criado / erro.
- Após sucesso, candidato aparece na lista abaixo.
- Lista simplificada: tabela com checkbox, nome, telefone, cidade, recrutador, status (dropdown inline).
- Barra de ações em massa: mudar status dos selecionados.
- Busca única por nome / telefone / cidade.

**Página `/pipeline` — Kanban enxuto**
- 7 colunas novas.
- Cards mostram apenas: nome, telefone, cidade, recrutador.
- Drag-and-drop para mover (manter o atual) + seleção múltipla com ação "mover selecionados para…".

**Página `/dashboard` — Simplificado**
- 4 cards: total de candidatos, aguardando contato, agendados, compareceram.
- Lista compacta dos últimos candidatos adicionados.

**Remover** a página `/agendamento` do menu (fora de escopo do ATS simples) — manter rota acessível mas tirar do sidebar, ou remover totalmente. **Vou remover totalmente** para enxugar.

**Sidebar/Layout**
- Itens: Dashboard, Candidatos, Pipeline.
- Visual mais "ferramenta interna": densidade maior, menos padding, ações sempre visíveis.

## UX / Performance
- Sem modal de criação manual de candidato (o upload é o único caminho). Editar candidato continua via dialog enxuto (telefone, cidade, status, observações).
- Listas com virtualização leve via paginação simples de 100 itens.
- Mutations otimistas em mudanças de status.
- Limite de 3 PDFs processados em paralelo, fila para o restante.

## Detalhes técnicos
- PDF → texto: usar `pdfjs-dist` no client (extrai texto rapidamente sem dependências nativas). Envia só o texto + bytes para a server function.
- Lovable AI: `generateText` + `Output.object` com schema Zod para garantir JSON estruturado.
- Storage: bucket `curriculos` já existe (privado). Adicionar policies de INSERT/SELECT por usuário autenticado.
- `LOVABLE_API_KEY` já está nos secrets.

## Fora de escopo (confirmar se quer incluir)
- Edição de roles de usuário
- Notificações por e-mail / WhatsApp
- Histórico de movimentações no pipeline

Posso seguir com essa implementação?
