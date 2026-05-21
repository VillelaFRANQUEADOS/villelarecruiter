# Controle de acesso por perfis (Admin / Recrutador)

## Estado atual

- Já existe enum `app_role` com `admin`, `agendamento`, `recrutador`.
- Já existe função `has_role()` e RLS por papel nas tabelas.
- Hoje só há 2 usuários: `joao.feijo@grupovillela.com` (recrutador) e `ariele.pereira@grupovillela.com` (sem papel).
- Não há tela para gerenciar usuários — tudo é feito no banco.

## A. Banco

1. **Backfill** do papel para a Ariele (`recrutador`).
2. **Promover o primeiro admin** — precisa de input seu (ver pergunta abaixo).
3. Adicionar coluna `ativo boolean default true` em `profiles` para o "desativar usuário" (sem mexer em `auth.users`).
4. Política de UPDATE em `user_roles` restrita a admin (hoje só ADMIN via policy `admins manage roles`, ok).
5. RLS em `profiles`: admin pode atualizar qualquer perfil; usuário só o próprio.

## B. Server functions (admin-only, usam `supabaseAdmin`)

Em `src/lib/admin-users.functions.ts`, todas validam que `claims.role` é `admin` antes de executar:

- `listUsers()` → join de `auth.users` + `profiles` + `user_roles` (email, nome, papel, ativo, último login).
- `createUser({ email, nome, senha, role })` → `supabaseAdmin.auth.admin.createUser` + insert em `profiles` e `user_roles`.
- `updateUserRole({ userId, role })`.
- `setUserActive({ userId, ativo })` → atualiza `profiles.ativo` e, se desativar, `supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: 'none' → '876000h' })` para bloquear login.
- `resetUserPassword({ userId, novaSenha })` → `supabaseAdmin.auth.admin.updateUserById(id, { password })`.
- `deleteUser({ userId })` → `supabaseAdmin.auth.admin.deleteUser(id)` (cascateia pela FK).

## C. Front-end

1. **Layout admin-only** `src/routes/_authenticated/_admin.tsx` com `beforeLoad` que redireciona para `/dashboard` se `role !== 'admin'`.
2. **Página `/usuarios`** (sob `_admin`): tabela com nome, email, papel, status, ativo desde + ações (editar papel, redefinir senha, desativar/ativar, excluir) + botão "Novo usuário" (dialog com nome, email, senha, papel).
3. **Sidebar**: item "Usuários" só aparece para admin (`Settings` icon).
4. **Bloqueio de login para desativados**: no `auth.tsx`, depois do login carrega `profiles.ativo` — se `false`, faz `signOut` e mostra "Usuário desativado".
5. **Ajustes pequenos de UI já existentes** — botão de excluir candidato já é admin-only; manter como está. Recrutador continua podendo criar/editar candidatos e mover no funil (RLS atual já permite).

## D. Limpeza

- Remover o papel `agendamento` da UI (ainda fica no enum por compatibilidade, mas some dos selects). Confirmar abaixo.

## Perguntas

1. Quem deve virar admin agora — `joao.feijo@grupovillela.com`, `ariele.pereira@grupovillela.com`, ou os dois?
2. Remover totalmente o papel "Agendamento" da interface (mantendo no banco por enquanto)?

## Fora de escopo

- Auditoria de ações dos usuários.
- Convite por email (a criação será com senha definida pelo admin na hora).
- Multi-tenant / equipes.
