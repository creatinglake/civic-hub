# Supabase

Database schema and migrations for the Civic Hub's Postgres store.

## Layout

```
supabase/
└── migrations/
    └── 20260416000000_initial_schema.sql   # tables, indexes, RLS, triggers
```

Filenames follow the Supabase CLI convention: `YYYYMMDDHHMMSS_<name>.sql`. Migrations run in filename-sort order.

## Applying migrations

### First run (or any one-off change)

1. Open the Supabase dashboard for the project.
2. SQL Editor → New query.
3. Paste the migration file contents.
4. Run.

### Once the Supabase CLI is installed (recommended going forward)

```bash
# one-time link
supabase login
supabase link --project-ref <your-project-ref>

# apply any new migrations in this folder
supabase db push
```

## Conventions

- **IDs are text.** Application code generates readable IDs (`user_<hex>`, `proc_<hex>`, …). Don't switch to UUIDs without a migration plan.
- **RLS is on everywhere with no permissive policies.** The backend uses the `service_role` key (bypasses RLS). The anon/publishable key gets nothing.
- **`events` is append-only.** A trigger blocks `UPDATE` and `DELETE`. Emit new events instead of mutating old ones.
- **`vote_records` and `vote_participation` must never share a join key.** This separation is the anonymous-voting privacy guarantee. Do not add `user_id` to `vote_records` or `receipt_id` to `vote_participation`.
- **Nested state is JSONB.** `processes.state`, `processes.content`, `processes.config`, and event `object`/`context`/`metadata` are JSONB — handler-shaped, not normalized.

## Don'ts

- Don't edit old migration files after they've been applied. Write a new migration.
- Don't run ad-hoc `ALTER` statements in the production SQL Editor. Anything schema-changing lives in a migration file.
- Don't commit the database password or `service_role` key.
