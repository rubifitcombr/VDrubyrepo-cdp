# Migrar Vyria → novo projeto Supabase

Projeto **novo**: `https://ijukzuwdrobtwcqqytlu.supabase.co`  
Projeto **antigo**: `ksmpktfyxkduvaoxyiel`

## Plano Free (sem backup automático)

Se `pg_dump` e REST falharem, usa o **SQL Editor** do projeto antigo:

1. Abre `scripts/supabase-migrate/sql-editor-export.sql`
2. Corre bloco a bloco no Dashboard
3. Copia o JSON de cada query para `.migration-export/<tabela>.json`
4. No projeto novo: `node scripts/supabase-migrate/import-all.mjs` (depois de schema aplicado)

**Table Editor:** Database → Tables → tabela → Export CSV (tabela a tabela).

**Connection string:** Settings → Database → copia a URI **exacta** (região/host) para `DATABASE_URL_OLD` — não adivinhar `aws-0-sa-east-1`.

**Suporte Supabase:** projeto degradado (`ECONNREFUSED` + timeout) pode ser recuperável pelo lado deles mesmo no Free.

**Último recurso:** lojistas voltam a registar-se no projeto novo; só recuperas o que exportares manualmente.

## 1. Chaves no `.env.local`

Adiciona (Settings → API no projeto novo):

```env
SUPABASE_NEW_URL=https://ijukzuwdrobtwcqqytlu.supabase.co
SUPABASE_NEW_ANON_KEY=<anon key>
SUPABASE_NEW_SERVICE_ROLE_KEY=<service_role key>
```

Opcional para `pg_dump` (senha **diferente** das API keys):

```env
# Obter em: Dashboard → Project Settings → Database → Database password
# Se não souber: clique em "Reset database password" e copie a nova senha.
DATABASE_URL_OLD=postgresql://postgres.ksmpktfyxkduvaoxyiel:[SENHA]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
DATABASE_URL_NEW=postgresql://postgres.ijukzuwdrobtwcqqytlu:[SENHA]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
```

**Nota:** a senha do Postgres é a mesma para os dois projetos só se você definiu igual ao criar — em geral **cada projeto tem a sua**. Use "Reset database password" em cada um.

### Onde achar a senha no Supabase

1. Abra o projeto (antigo ou novo)
2. **Project Settings** (engrenagem) → **Database**
3. Secção **Database password**
   - Se aparecer mascarada e você não guardou: **Reset database password**
4. Na mesma página, **Connection string** → URI → substitua `[YOUR-PASSWORD]` pela senha

As variáveis `SUPABASE_*_SERVICE_ROLE_KEY` **não servem** como senha do Postgres.

## 2. Schema no projeto novo

```bash
node scripts/supabase-migrate/build-schema.mjs
```

Abre `.migration-export/00-schema-all-migrations.sql` no **SQL Editor** do projeto novo e executa.

## 3. Exportar dados do antigo

### Opção A — `pg_dump` (recomendado se REST em timeout)

```bash
bash scripts/supabase-migrate/pgdump-auth.sh      # passwords preservadas
bash scripts/supabase-migrate/pgdump-public.sh    # lojas, produtos, pedidos...
psql "$DATABASE_URL_NEW" -f .migration-export/pgdump-auth-data.sql
psql "$DATABASE_URL_NEW" -f .migration-export/pgdump-public-data.sql
```

### Opção B — REST (se o antigo responder)

```bash
node scripts/supabase-migrate/export-all.mjs
node scripts/supabase-migrate/import-all.mjs
```

**Utilizadores:** a Opção B recria contas com password temporária — os lojistas precisam de «recuperar senha». Para manter passwords, use **pgdump-auth**.

## 4. Storage (imagens, contratos)

Copiar buckets manualmente no Dashboard ou com script:

- `product-images`
- `contratos`
- `fiscal-invoices`

## 5. Apontar a app

Na Vercel e `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://ijukzuwdrobtwcqqytlu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<novo anon>
SUPABASE_SERVICE_ROLE_KEY=<novo service_role>
```

## 6. Validar

```bash
NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_NEW_URL \
NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_NEW_ANON_KEY \
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_NEW_SERVICE_ROLE_KEY \
node scripts/supabase-schema-audit.mjs
```
