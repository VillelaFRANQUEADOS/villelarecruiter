## Reduzir os status

Hoje há 7 status. Reduzir para 5: **Triagem, Aguardando contato, Remarcar, Sem interesse, Agendado**.

Remover: `compareceu`, `contratado`.

### O que muda
1. **Migração SQL**: criar novo enum `candidato_status` só com os 5 valores. Antes, mapear registros existentes — qualquer `compareceu`/`contratado` vira `agendado` (ou outro à sua escolha) para não perder histórico.
2. **`src/lib/auth.tsx`**: ajustar `CandidatoStatus`, `STATUS_LABELS`, `STATUS_ORDER`, `STATUS_TONE` (remover 2 entradas).
3. **`dashboard.tsx`**: remover métricas/colunas que referenciavam os removidos; manter "Agendado" como estado final do funil.
4. **`pipeline.tsx`**: remover as colunas eliminadas do kanban.
5. **Filtro em Candidatos**: o select de Status atualiza automaticamente via `STATUS_ORDER`.

---

## Melhorias sugeridas (escolha as que quiser)

Olhando o app hoje, essas têm bom custo/benefício:

1. **Histórico de status por candidato** — tabela `candidato_status_log` (status anterior, novo, quem mudou, quando). Aparece como timeline no `CandidatoEditDialog`. Útil para auditoria e para ver quanto tempo cada candidato ficou em cada etapa.

2. **Campo "Data do agendamento"** no candidato — quando status vira `agendado`, abrir um date/time picker. Permite uma aba/visão "Agenda de hoje/semana" com os agendamentos.

3. **Vagas como entidade própria** — hoje `vaga` é texto livre na tabela `candidatos`. Criar tabela `vagas` (título, cidade, status aberto/fechado, recrutador responsável) e referenciar por FK. Habilita filtrar candidatos por vaga real e ver pipeline por vaga.

4. **Tags/etiquetas livres** no candidato (ex.: "CNH", "disponível imediato", "experiência com X") para enriquecer a busca sem virar campo fixo.

5. **Exportar lista filtrada para CSV/Excel** — botão na aba Candidatos que exporta exatamente o que o filtro mostra.

6. **Dedupe na importação em lote** — quando o BulkUpload extrair telefone/email, checar se já existe candidato com o mesmo telefone e mostrar aviso ("já cadastrado por Fulano em DD/MM") em vez de criar duplicata.

7. **Notas/comentários internos** com timestamp e autor (separado de `observacoes`, que vira mais um campo livre fixo). Igual ao histórico de status, vira timeline.

8. **Notificações leves** quando um candidato é marcado como "Remarcar" ou "Aguardando contato" há > N dias — destaque visual em Candidatos ou lista "Pendências".

9. **Foto / avatar do candidato** extraída do PDF (a IA já lê o currículo; pedir para devolver foto base64 quando houver) ou upload manual.

10. **Página de perfil pública do candidato** (`/candidatos/:id`) com tudo: dados, histórico, currículo embed do Drive, notas. Hoje só dá pra editar em modal.

## Perguntas antes de implementar

1. **Quais melhorias você quer dessa lista?** (Pode marcar várias — implemento em sequência.)
2. **Migração dos status removidos**: candidatos que estão hoje em "Compareceu" ou "Contratado" devem virar `agendado`, `triagem`, ou prefere que eu liste eles primeiro para você decidir manualmente?
