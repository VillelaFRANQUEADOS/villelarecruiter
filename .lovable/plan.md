
# Sincronização bidirecional ATS ↔ SharePoint

Objetivo: cada candidato vira uma linha em uma lista do SharePoint; editar lá atualiza o ATS e vice-versa. Somente campos do candidato (sem arquivo, sem histórico de status, sem entrevistas — decidido nas respostas).

## 1. Conexão SharePoint

- Usar o conector **Microsoft SharePoint** do Lovable (gateway). Vou solicitar a conexão quando entrar em build mode; você escolhe o site alvo.
- Guardar em uma nova tabela `sharepoint_config` (linha única):
  - `site_id` (SharePoint), `list_id` (SharePoint), `site_url` amigável, `last_delta_link` (para pull incremental), `enabled`, `updated_at`.
- Página nova em `/_admin/integracoes/sharepoint`:
  - Selecionar um site (busca via Graph `/sites?search=`).
  - Botão **Criar lista** → cria uma lista com todas as colunas (item 3) e grava `site_id`/`list_id`.
  - Botão **Sincronizar agora** (dispara o mesmo job da cron).
  - Estado: total de itens sincronizados, última execução, erros recentes.
- Só administradores acessam.

## 2. Modelo de sincronização

**Chave de correlação:** duas colunas novas em `candidatos`:
- `sharepoint_item_id text` — id da linha na lista SP.
- `sharepoint_synced_at timestamptz` — última vez que a linha foi vista igual ao SP.

Novas colunas em `candidatos`:
- `sharepoint_etag text` — eTag do item do SP (para detectar edições remotas sem baixar tudo).
- `deleted_at timestamptz` — soft-delete, usado para propagar exclusões nos dois lados.

Nova tabela `sharepoint_sync_log` (auditoria): `id`, `direction` (`push`|`pull`), `candidato_id`, `sharepoint_item_id`, `action` (`create|update|delete|skip|error`), `message`, `created_at`.

**Resolução de conflito:** *last write wins* por `updated_at` (ATS) vs `lastModifiedDateTime` (SP). Empate → SP vence (é o "editor humano de fora"). Registrado em `sharepoint_sync_log`.

## 3. Colunas da lista no SharePoint

Criadas automaticamente ao clicar "Criar lista". Nomes internos entre parênteses:

| Campo SP (interno) | Tipo | Origem no ATS |
|---|---|---|
| Title | Text (padrão) | `nome` |
| ATSId | Text (indexado) | `candidatos.id` (chave estrangeira) |
| Telefone | Text | `telefone` |
| Email | Text | `email` |
| Cidade | Text | `cidade` |
| UF | Choice (27 UFs) | `estado` |
| Status | Choice (labels PT) | `status` |
| Observacao | MultilineText | `observacoes` |
| Origem | Choice (LINKEDIN/PANDAPE/INDICACAO/SITE/OUTROS) | `origem_curriculo` |
| Vaga | Text | `vaga` |
| Recrutador | Text (nome) | `profiles.nome` via `recrutador_id` |
| DataEntrevista | DateTime | `data_entrevista` + `horario_entrevista` |
| ATSUrl | Hyperlink | link direto para `/candidatos?focus=<id>` |
| ATSUpdatedAt | DateTime (oculto) | `updated_at` (para conflito) |

`ATSId` é a fonte da verdade da correlação. Se um item for criado no SP sem `ATSId`, o pull cria um novo candidato e grava o `ATSId` de volta.

## 4. Push (ATS → SharePoint)

Server function `syncCandidatoToSharePoint(id)` chamada:
- Após INSERT/UPDATE de `candidatos` — via trigger que enfileira em uma tabela `sharepoint_outbox(candidato_id, op, created_at)`. Isso desacopla latência da UI.
- Após soft-delete (`deleted_at`) → deleta o item no SP.

O worker (server route `POST /api/public/hooks/sharepoint-sync`, protegida por secret header) drena o outbox: para cada `candidato_id`, faz upsert via Graph:
- Sem `sharepoint_item_id`: `POST /sites/{sid}/lists/{lid}/items` → salva id + etag.
- Com id: `PATCH /sites/{sid}/lists/{lid}/items/{iid}/fields` com `If-Match: <etag>`. Se 412 (conflito), força pull daquele item e reaplica LWW.

## 5. Pull (SharePoint → ATS)

Mesmo worker faz um pull incremental via `delta`:
- `GET /sites/{sid}/lists/{lid}/items/delta` (primeira vez) e depois usa `last_delta_link`.
- Para cada item retornado:
  - Se tem `ATSId` conhecido: comparar `lastModifiedDateTime` com `sharepoint_synced_at` e `updated_at`; aplicar LWW.
  - Se `ATSId` vazio: criar candidato novo (`origem_curriculo='OUTROS'`, `cidade_validada` validado via IBGE) e escrever `ATSId` de volta no SP.
  - Se item foi removido do SP: soft-delete no ATS.
- Grava novo `deltaLink` em `sharepoint_config.last_delta_link`.

## 6. Cron

`pg_cron` chama `POST https://project--32814c07-...lovable.app/api/public/hooks/sharepoint-sync` a cada 5 min com header secreto `x-sync-secret`. A rota valida o secret, drena outbox (push) e roda delta (pull).

## 7. Segurança / permissões

- Endpoint público valida `x-sync-secret` (secret novo, gerado via `generate_secret`).
- Todas as chamadas Graph via `standard_connectors--call_gateway_connection` server-side.
- RLS: `sharepoint_config`, `sharepoint_outbox`, `sharepoint_sync_log` acessíveis só para `admin`. `service_role` para o worker.
- Nunca expõe token do SharePoint no cliente.

## 8. O que fica de fora (por decisão sua)

- Não sincroniza o PDF do currículo.
- Não sincroniza histórico de status nem entrevistas como itens separados (data/hora vão no campo `DataEntrevista`).
- Não há mapa por vaga — uma única lista para todos os candidatos.

## Detalhes técnicos (arquivos a criar/editar)

**Migrations**
- `candidatos`: adicionar `sharepoint_item_id`, `sharepoint_etag`, `sharepoint_synced_at`, `deleted_at`, índice em `sharepoint_item_id` e em `deleted_at IS NULL`.
- Nova `sharepoint_config` (linha única, admin-only).
- Nova `sharepoint_outbox` (fila de push).
- Nova `sharepoint_sync_log`.
- Trigger em `candidatos` → insere no outbox em INSERT/UPDATE dos campos mapeados e em soft-delete.
- Habilitar `pg_cron` + `pg_net`, agendar hook a cada 5 min (via insert, não migração — contém secret/URL).

**Código**
- `src/lib/sharepoint.server.ts` — helpers Graph (createList, upsertItem, deleteItem, deltaFetch, mapping ATS↔SP).
- `src/lib/sharepoint.functions.ts` — `setupSharepointList`, `getSharepointStatus`, `runSharepointSync` (admin-only server fns).
- `src/routes/api/public/hooks/sharepoint-sync.ts` — endpoint cron/push.
- `src/routes/_authenticated/_admin/integracoes.sharepoint.tsx` — UI de configuração.
- Item no menu do sidebar (só admin) apontando para a página.
- Substituir hard-delete em `candidatos.tsx` por soft-delete (`deleted_at = now()`); listagem já filtra `deleted_at IS NULL`.

**Secrets a provisionar em build mode**
- Conectar `microsoft_sharepoint` (via `standard_connectors--connect`).
- `SHAREPOINT_SYNC_SECRET` (gerado, usado pelo endpoint público).

## Limitações conhecidas

- Latência: uma edição no SP aparece no ATS em até 5 min (janela do cron). Push do ATS é ~imediato quando o outbox drena.
- SharePoint não notifica em tempo real via Graph v1 nesse conector; polling é o único caminho.
- Criar site/coleção de sites não é suportado pelo conector — você aponta um site existente.
- `DataEntrevista` combina `data_entrevista + horario_entrevista`; se você editar só um dos dois no ATS, o SP recebe o valor combinado (e vice-versa vem quebrado nos dois campos).
