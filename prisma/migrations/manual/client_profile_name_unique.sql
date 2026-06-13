-- [Canonical Clients 2026-06] Partial unique index — one ACTIVE client per
-- (profile, parent, normalized name).
--
-- WHY a manual SQL file instead of Prisma @@unique:
--   1. Postgres treats NULL parentId values as DISTINCT in a normal unique
--      constraint, so duplicate ROOT clients ("Jacob" twice, parentId NULL)
--      would never be caught. COALESCE(parentId, -1) fixes that.
--   2. Rows with status='MERGED' (absorbed duplicates kept for zero-data-loss
--      rollback) intentionally KEEP their original names — a full-table
--      unique constraint would reject them. The WHERE clause scopes
--      uniqueness to ACTIVE rows only.
--   3. Prisma cannot express functional/partial indexes in schema.prisma.
--
-- WHEN to apply (Step D of the rollout — ORDER MATTERS):
--   ONLY AFTER `scripts/migrate-clients-to-profile-scope.ts --apply` has
--   collapsed all duplicates. Applying before the merge fails on the very
--   duplicates the merge is about to absorb.
--
-- HOW to apply (Neon / any Postgres):
--   psql "$DATABASE_URL" -f prisma/migrations/manual/client_profile_name_unique.sql
--   (CONCURRENTLY → no table lock; safe on a live database. CONCURRENTLY
--    cannot run inside a transaction block — run this file standalone.)
--
-- Until this index is live, the app-level duplicate guard in
-- src/actions/crm-actions.ts (createClient/updateClient) is the only
-- protection — acceptable for the days between merge and index, not months.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS client_profile_path_unique
ON "Client" ("profileId", COALESCE("parentId", -1), lower(btrim("name")))
WHERE "status" = 'ACTIVE' AND "profileId" IS NOT NULL;
