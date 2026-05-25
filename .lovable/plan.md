## 1. Filtros por coluna na aba Candidatos

Substituir a barra de busca única + select de status por uma linha de filtros com um campo para cada coluna principal:

- **Nome** (texto)
- **Telefone** (texto)
- **Cidade** (texto)
- **Email** (texto)
- **Vaga** (texto)
- **Status** (select, mantém)
- **Recrutador** (select com a lista de profiles)

Comportamento:
- Filtragem client-side em cima do `useCandidatosQuery` (já carregado), mantendo a velocidade e o realtime.
- Botão "Limpar filtros" e contador "X de Y candidatos".
- Layout responsivo: em telas menores os filtros viram um grid 2 colunas; em desktop ficam em linha acima da tabela.
- Mantém a seleção em lote, edição e exclusão como hoje.

## 2. Hospedagem de currículos no Google Drive

Hoje os PDFs ficam no bucket `curriculos` do Lovable Cloud. Vamos migrar para o Google Drive da sua conta corporativa via connector.

### Como vai funcionar
- O connector autentica **uma conta Google** (a sua / da empresa). Todos os recrutadores fazem upload e leitura através dessa mesma conta — eles não precisam logar no Drive.
- Cria-se uma pasta única no Drive (ex: `ATS - Currículos`) e os arquivos ficam organizados lá. O ID da pasta fica num secret.
- No banco, a coluna `curriculo_url` passa a guardar o `fileId` do Drive (string curta) em vez do path do Storage.

### Fluxo técnico (TanStack server functions)
1. Conectar **Google Drive** via `standard_connectors--connect` (escopo `drive.file` — só vê arquivos criados pelo app, mais seguro que `drive`).
2. Criar `src/lib/curriculos.functions.ts` com:
   - `uploadCurriculoToDrive({ filename, contentBase64, mimeType })` → faz `POST /upload/drive/v3/files?uploadType=multipart` via gateway, retorna `fileId`.
   - `getCurriculoDownloadUrl({ fileId })` → gera link curto via `GET /files/{fileId}?fields=webContentLink` ou faz proxy do conteúdo.
   - `deleteCurriculoFromDrive({ fileId })` → `DELETE /files/{fileId}`.
3. Atualizar `BulkUpload` e o fluxo de upload individual para chamar `uploadCurriculoToDrive` em vez do `supabase.storage`.
4. Atualizar `openCurriculo` em `candidatos.tsx` para usar `getCurriculoDownloadUrl`.
5. Adicionar secret `GOOGLE_DRIVE_FOLDER_ID` (você cria a pasta no Drive e cola o ID).

### Migração dos currículos existentes
Os arquivos que já estão no Lovable Cloud não somem automaticamente. Duas opções (decidimos depois de aprovar o plano):
- **A** — Deixar como está: registros antigos continuam abrindo do Storage, novos vão para o Drive. Código detecta pelo formato de `curriculo_url` (path vs fileId).
- **B** — Script único de migração: baixa do Storage e re-envia para o Drive, atualiza os registros e zera o bucket.

### Trade-offs honestos
- **Vantagem**: storage do Lovable Cloud fica praticamente vazio; backups e gestão dos PDFs ficam no Drive (que você já paga).
- **Limitação**: cota da API do Drive é generosa mas não infinita (1.000 req/100s por usuário). Para um ATS de recrutamento isso sobra.
- **Single-account**: se um dia quiser que cada recrutador use o próprio Drive, precisaria trocar para OAuth per-user (refazer auth).

## Arquivos afetados
- `src/routes/_authenticated/candidatos.tsx` — novos filtros
- `src/lib/curriculos.functions.ts` — novo
- `src/components/BulkUpload.tsx` — troca de destino
- `src/components/CandidatoEditDialog.tsx` — troca de destino (se faz upload)
- `src/start.ts` — sem mudança
- Migração SQL: nenhuma (reaproveita `curriculo_url`)

## Perguntas antes de implementar
1. **Migração A ou B** para os currículos já existentes?
2. Você quer que eu já chame o `connect` do Google Drive agora ou prefere preparar o código primeiro e conectar depois?
