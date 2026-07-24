# Migração com utilizadores criados à mão (plano Free)

Sim — **produtos, pedidos, lojas, imagens**, etc. podem ir para o projeto novo **depois** de criares os utilizadores lá. O Auth é só a “âncora” do `stores.owner_id`.

## Fluxo recomendado

### Passo 1 — Exportar do projeto antigo (SQL Editor ou CSV)

Usa [`sql-editor-export.sql`](sql-editor-export.sql) e guarda em `.migration-export/`:

| Ficheiro | Conteúdo |
|----------|----------|
| `auth_users.json` | `id` + `email` (do export SQL) |
| `stores.json` | todas as lojas (**mantém `id` e `owner_id`**) |
| `products.json` | produtos |
| `orders.json` | comandas/pedidos |
| `order_items.json` | itens |
| … | outras tabelas que precisares |

### Passo 2 — Criar users no projeto novo

**Opção A (melhor):** mesmo `id` do export

No Dashboard → Authentication → Add user, ou deixa o script criar:

```bash
node scripts/supabase-migrate/import-all.mjs
```

(o script usa `createUser({ id: u.id, email, ... })` se existir `auth_users.json`)

**Opção B:** crias à mão com emails iguais → preenche `.migration-export/owner-map.json`:

```json
{
  "48357da1-a7f3-4b97-988b-1cefff055b7e": "NOVO-UUID-DO-USER",
  "outro-id-antigo": "outro-id-novo"
}
```

Chaves = `owner_id` **antigo**; valores = `id` Auth **novo**.

### Passo 3 — Schema no projeto novo

As migrações do Git **não criam** `stores` / `products` / `orders` (vieram antes do repo).

Precisas de uma destas:

- DDL exportado do antigo (SQL Editor: “show create table” / backup manual), **ou**
- `pg_dump --schema-only` quando a ligação voltar, **ou**
- recriar tabelas pelo Table Editor (trabalhoso)

Depois corre as migrações em `supabase/migrations/` (RLS, RPCs, índices).

### Passo 4 — Importar dados

```bash
node scripts/supabase-migrate/import-all.mjs
```

O script:

1. Cria users (se `auth_users.json` existir)
2. Aplica `owner-map.json` em `stores.owner_id`
3. Faz `upsert` de lojas → produtos → pedidos → …

### Passo 5 — Imagens (Storage)

```bash
node scripts/supabase-migrate/migrate-storage.mjs
```

Lê paths de `products.image_url`, `stores.logo_url`, etc. nos JSON exportados, tenta descarregar do projeto antigo (URLs públicas) e envia para o bucket novo `product-images`.

Buckets: `product-images`, `contratos`, `fiscal-invoices`.

---

## O que fica de fora sem export do antigo

- Passwords antigas (lojistas usam **recuperar senha** no projeto novo)
- Ficheiros que não estiverem em URL pública acessível
- Dados que não exportares (tabelas em falta no JSON)

## Ordem de importação (automática)

`usuarios` → `stores` → `products` → `orders` → `order_items` → … (ver `lib.mjs`)

---

## Quando tiveres os JSON prontos

Avisa — validamos contagens e corremos import + storage no projeto `ijukzuwdrobtwcqqytlu`.
