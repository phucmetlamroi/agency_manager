-- ────────────────────────────────────────────────────────────────────────
-- Migration: Chat GĐ3 — TaskComment as action item + per-task read state
-- Date: 2026-07-02 · Branch: claude/cranky-austin
-- ────────────────────────────────────────────────────────────────────────
--
-- WHAT (all ADDITIVE — nullable columns, one new table, two new enum values,
-- two new indexes). Nothing existing is altered or transformed → zero data
-- loss, and the app keeps running unchanged before this is applied.
--
--   TaskComment:
--     + actionAssignedToId / actionAssignedById / actionAssignedAt          (C2 assign)
--     + actionResolvedAt / actionResolvedById                               (C2 resolve)
--     + spawnedTaskId                                                       (C4 backlink)
--     + pinnedAt / pinnedById                                              (F2 pin, GĐ5)
--   TaskCommentReadState (new)                                             (D1 unread)
--   NotificationType += COMMENT_ASSIGNED, COMMENT_RESOLVED                 (C2 notify)
--
-- WHY a manual SQL file instead of `prisma migrate dev`:
--   The migration history (last formal migration 2026-05-07) is DRIFTED from
--   the live Neon schema because additive changes since then were applied via
--   `prisma db push`. Running `migrate dev` now would detect drift and offer
--   to RESET the database. So this repo's convention is: apply additive schema
--   with `prisma db push`, and keep this hand-written pair (forward + rollback)
--   as the documented, runnable rollback artifact. This file mirrors exactly
--   what `db push` does for the schema.prisma change of the same commit.
--
-- HOW to apply (either is fine — they converge):
--   A) prisma db push        (from repo root — the mechanism actually used)
--   B) psql "$DATABASE_URL" -f prisma/migrations/manual/chat_gd3_task_comment_actions.sql
--
-- Idempotent: every statement uses IF NOT EXISTS so re-running is safe.

-- 1. TaskComment additive columns (C2 assign/resolve, C4 backlink, F2 pin)
ALTER TABLE "TaskComment" ADD COLUMN IF NOT EXISTS "actionAssignedToId" TEXT;
ALTER TABLE "TaskComment" ADD COLUMN IF NOT EXISTS "actionAssignedById" TEXT;
ALTER TABLE "TaskComment" ADD COLUMN IF NOT EXISTS "actionAssignedAt"   TIMESTAMP(3);
ALTER TABLE "TaskComment" ADD COLUMN IF NOT EXISTS "actionResolvedAt"   TIMESTAMP(3);
ALTER TABLE "TaskComment" ADD COLUMN IF NOT EXISTS "actionResolvedById" TEXT;
ALTER TABLE "TaskComment" ADD COLUMN IF NOT EXISTS "spawnedTaskId"      TEXT;
ALTER TABLE "TaskComment" ADD COLUMN IF NOT EXISTS "pinnedAt"           TIMESTAMP(3);
ALTER TABLE "TaskComment" ADD COLUMN IF NOT EXISTS "pinnedById"         TEXT;

-- 2. Indexes for FollowUps ("assigned to me, still open") + pinned list
CREATE INDEX IF NOT EXISTS "TaskComment_actionAssignedToId_actionResolvedAt_idx"
  ON "TaskComment" ("actionAssignedToId", "actionResolvedAt");
CREATE INDEX IF NOT EXISTS "TaskComment_taskId_pinnedAt_idx"
  ON "TaskComment" ("taskId", "pinnedAt");

-- 3. Per-(user, task) read marker (D1)
CREATE TABLE IF NOT EXISTS "TaskCommentReadState" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "taskId"     TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskCommentReadState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TaskCommentReadState_userId_taskId_key"
  ON "TaskCommentReadState" ("userId", "taskId");
CREATE INDEX IF NOT EXISTS "TaskCommentReadState_userId_idx"
  ON "TaskCommentReadState" ("userId");

-- 4. New NotificationType enum values (C2). ADD VALUE IF NOT EXISTS cannot run
--    inside a transaction block; run this file standalone (psql does by default).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COMMENT_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COMMENT_RESOLVED';
