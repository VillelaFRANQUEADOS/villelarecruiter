# Problemas identificados

## 1. Recrutador aparece em branco

Verifiquei no banco: o usuário que está enviando os currículos (`a3b1f551…`) **não tem linha em `profiles`** — todos os candidatos dele saem com `recrutador_nome = null`.

Causa raiz: o trigger `on_auth_user_created` que deveria chamar `handle_new_user()` em cada cadastro **não existe** em `auth.users` (a função está criada, mas o trigger nunca foi anexado). Resultado: usuários antigos ficaram sem profile/role, e qualquer novo usuário continuaria com o mesmo problema.

## 2. Telefone vazio em alguns currículos

A IA às vezes não retorna o telefone — formatos brasileiros variam muito (`(35) 99117-1223`, `+55 35 9 9117 1223`, `35.99117.1223`, etc.) e, quando o PDF tem layout estranho, o modelo simplesmente devolve `null`. Hoje não há nenhum fallback: se a IA não achou, fica vazio.

# Plano

## A. Recrutador

1. **Migration** criando o trigger faltante:
   ```sql
   CREATE TRIGGER on_auth_user_created
   AFTER INSERT ON auth.users
   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
   ```
2. **Backfill** (via insert tool) para o usuário atual:
   - Inserir profile a partir de `auth.users` (nome = parte antes do `@`, email = email do auth) onde ainda não existe profile.
   - O role `recrutador` já foi criado anteriormente para esse usuário.
3. Front-end já lê `profiles` corretamente — depois do backfill os candidatos existentes vão exibir o nome do recrutador automaticamente.

## B. Telefone

Em `src/lib/cv-parser.functions.ts`:

1. **Prompt mais explícito** — listar formatos comuns brasileiros e pedir só os dígitos com DDD (11 dígitos para celular, 10 para fixo).
2. **Fallback por regex** sobre `cvText`, executado quando a IA retornar telefone vazio (ou mesmo quando falhar):
   ```ts
   const re = /(?:\+?55\s*)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}/g;
   ```
   - Pega o primeiro match, remove tudo que não for dígito, descarta DDI 55 se vier, mantém só os 10–11 dígitos finais.
3. **Mesma ideia para email** (já existe regex padrão) — se a IA não trouxer, extrai o primeiro `\S+@\S+\.\S+` do texto.
4. Quando a IA falhar totalmente (cenário "criado sem IA"), aplicar os dois fallbacks antes de inserir, em vez de gravar telefone/email vazios.

Sem mudanças em pipeline/dashboard nem em schema de tabelas.

# Fora de escopo

- OCR para PDFs escaneados.
- Reprocessar candidatos antigos com telefone vazio (podemos fazer depois se você quiser; por ora só corrige novos uploads).
