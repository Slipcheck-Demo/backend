---
name: prisma-postgres-history
description: Use when setting up Prisma + Postgres for the Betway booking-code product's request-history table, writing schema.prisma, configuring the Prisma 7 driver adapter, or generating an ERD for docs/architecture.md. Triggers on "add a prisma model", "set up postgres", "generate the schema", "erd diagram".
---

> **Adapted from** [`prisma/skills`](https://github.com/prisma/skills) (`prisma-database-setup`,
> official, MIT) and [`borghei/Claude-Skills`](https://github.com/borghei/Claude-Skills)
> (`database-schema-designer`, MIT + Commons Clause — `scripts/erd_generator.py`). The
> `borghei` skill targets full multi-tenant schema design with RLS, audit trails and
> migration diffing across four ORMs; we only take its ERD generator, since our schema is
> one small history table, not a multi-tenant system.

# Prisma + Postgres for booking-code request history

Scope, per the project plan: the backend is a thin proxy over Betway's API. The only thing
that needs persistence is a **history of decode/encode/convert requests** — not user
accounts, not slip data (that's always re-fetched live from Betway). Keep the schema small
on purpose; do not add tables "just in case."

## Setup (Prisma 7 + Postgres)

1. **Provider**: `postgresql`. Whichever host is picked for the database (Vercel Postgres /
   Neon / Railway), the setup is the same — only `DATABASE_URL` changes.

2. **Prisma 7 config shape** — connection URL goes in `prisma.config.ts`, not in
   `schema.prisma`:

   ```ts
   // prisma.config.ts
   import 'dotenv/config'
   import { defineConfig } from 'prisma/config'

   export default defineConfig({
     schema: 'prisma/schema.prisma',
   })
   ```

   ```prisma
   // prisma/schema.prisma
   datasource db {
     provider = "postgresql"
   }

   generator client {
     provider = "prisma-client"
     output   = "../generated"
   }
   ```

3. **Client setup with the driver adapter** (required in Prisma 7 for Postgres):

   ```bash
   npm install prisma --save-dev
   npm install @prisma/client @prisma/adapter-pg pg
   ```

   ```ts
   // backend/src/db/client.ts
   import { PrismaClient } from '../../generated/client'
   import { PrismaPg } from '@prisma/adapter-pg'

   const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
   export const prisma = new PrismaClient({ adapter })
   ```

4. Re-run `npx prisma generate` after every schema change, and `npx prisma migrate dev`
   to create/apply migrations (never hand-edit the database directly).

## Schema

One table is enough for this project:

```prisma
model BookingCodeRequest {
  id          String   @id @default(uuid())
  operation   String   // "resolve" | "create" | "convert"
  bookingCode String?  // input code for resolve/convert; output code for create
  resultCode  String?  // the code produced by create/convert
  status      String   // "ok" | "invalid_code" | "conflicting_selections" | "upstream_error"
  legCount    Int?
  createdAt   DateTime @default(now())

  @@index([createdAt])
  @@index([bookingCode])
}
```

Do not add relations, soft deletes, RLS policies, or multi-tenancy — none of that is
needed for a single-operator internal history log. If a future requirement adds user
accounts, that's a new model added then, not something to pre-build now.

## Generating the ERD for docs/architecture.md

Use `scripts/erd_generator.py` (bundled with this skill) against a plain SQL DDL dump —
it has no dependencies beyond the Python standard library.

```bash
# Dump the current schema as DDL (Prisma doesn't emit raw DDL directly, use migrate diff):
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > /tmp/schema.sql

python3 .claude/skills/prisma-postgres-history/scripts/erd_generator.py /tmp/schema.sql -o docs/erd.mmd
```

Paste the resulting Mermaid `erDiagram` block into `docs/architecture.md`. Since there is
only one table, don't expect (or force) relationships in the diagram — a single-entity ERD
is a correct, honest output, not an incomplete one.

## What was left out of the source skills

- `prisma-database-setup`'s MySQL/SQLite/MongoDB/SQL Server sections — irrelevant, we're
  Postgres-only.
- `database-schema-designer`'s RLS policies, multi-tenancy patterns, `migration_diffr.py`,
  and `schema_validator.py` — built for schemas with many related tables; not worth the
  overhead for one table.
