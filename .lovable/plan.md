# Plano: Performance, Topbar Liquid Glass e Observações sem falha de IA

## 1. Performance — carregamento mais rápido das informações

Diagnóstico confirmado nas estatísticas do banco:

- A consulta mais lenta do sistema é a de **histórico de status** (`candidato_status_log` ordenado por data, limite 2000): média de ~800ms e 77 mil chamadas. Ela baixa as últimas 2000 mudanças de status da base inteira só para montar o "alterado por" na tabela — e não existe índice para essa ordenação.
- A listagem de candidatos com contagem exata leva em média 400ms–1s.
- O Realtime invalida todas as consultas a cada alteração: durante upload em massa ou reprocessamento, dezenas de recargas desnecessárias disparam em sequência.

Mudanças:

1. **Novo índice no banco** em `candidato_status_log (created_at DESC)` para a ordenação ficar instantânea.
2. **Histórico de status por página**: a consulta passa a filtrar apenas pelos candidatos visíveis na página atual (`.in("candidato_id", ids)`), usando o índice já existente, em vez de baixar 2000 linhas da base inteira.
3. **Realtime com debounce**: as invalidações passam a ser agrupadas (~500ms), de modo que um lote de 20 currículos gere 1 recarga, não 20. A atualização continua automática e em tempo real.
4. Manter o comportamento de "manter dados anteriores" ao trocar de página/filtro (já existe) para transições instantâneas.

Resultado esperado: primeira carga e trocas de página/filtro visivelmente mais rápidas, sem perder a sincronização em tempo real.

## 2. Layout — sidebar vira barra superior "liquid glass"

- Novo componente `AppTopbar`: barra flutuante no topo com efeito vidro líquido — fundo translúcido (`bg-white/60`), desfoque forte (`backdrop-blur-xl` + saturação), borda sutil clara, sombra suave e cantos arredondados, sobre o fundo `#F7F8FA`.
- Conteúdo da barra: logo + "Villela Recruiter" à esquerda; navegação central (Candidatos; Dashboard e Usuários para admin/recrutador) com item ativo em pill destacado; à direita o link Playbook, nome/função do usuário e botão Sair.
- **Mobile**: hoje o sidebar some em telas pequenas e não há navegação alguma — a topbar incluirá menu hambúrguer com os mesmos links, resolvendo esse gap.
- `src/routes/_authenticated.tsx` passa a empilhar topbar + conteúdo (remove o sidebar). `AppSidebar.tsx` será excluído.
- Tokens de marca mantidos (navy `#0B2239`, âmbar `#C9963A`); efeito de vidro via utilitários padrão do Tailwind (sem prefixos manuais).

## 3. Falha de IA não grava mais em Observações

- Em `parseAndCreateCandidato` (`src/lib/cv-parser.functions.ts`): quando a extração por IA falha, o candidato continua sendo criado normalmente, mas **sem** escrever "Extração automática falhou (...)" nas observações — o campo fica vazio.
- O aviso visual no upload em massa ("criado sem IA - edite") é mantido, pois vem do retorno da função, não do banco.
- O reprocessamento já não grava esse texto (apenas falha com erro) — sem mudança.
- **Limpeza dos registros existentes**: migração que apaga apenas as observações automáticas ainda intactas (`observacoes LIKE 'Extração automática falhou%'` e sem edição manual registrada), preservando qualquer observação que alguém tenha editado depois.

## Detalhes técnicos

- Migração SQL: `CREATE INDEX idx_status_log_created ON public.candidato_status_log (created_at DESC)` + limpeza das observações automáticas.
- `src/lib/ats-data.ts`: `useLatestStatusChangesQuery(ids: string[])` filtrado por página; debounce em `useCandidatosRealtime` (timer único agrupando invalidações de candidatos, status log, opções e dashboard).
- `src/routes/_authenticated/candidatos.tsx`: passa os IDs da página atual para a consulta de histórico.
- Novo `src/components/AppTopbar.tsx`; edição de `src/routes/_authenticated.tsx`; remoção de `src/components/AppSidebar.tsx`.
- Verificação: typecheck + validação visual no navegador (topbar, navegação, páginas carregando).
