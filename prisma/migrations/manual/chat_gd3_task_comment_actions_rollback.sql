-- ────────────────────────────────────────────────────────────────────────
-- ROLLBACK for: chat_gd3_task_comment_actions.sql
-- Date: 2026-07-02 · Branch: claude/cranky-austin
-- ────────────────────────────────────────────────────────────────────────
--
-- Reverses the Chat GĐ3 additive schema. Because the forward migration only
-- ADDED nullable columns / a new table / new indexes, dropping them loses NO
-- pre-existing data — only the GĐ3 assign/resolve/read-state data, which did
-- not exist before this feature.
--
-- ONE CAVEAT (documented, harmless): Postgres cannot DROP a single enum value.
-- The two added NotificationType values (COMMENT_ASSIGNED, COMMENT_RESOLVED)
-- are therefore LEFT in place after rollback. They are inert unless a row uses
-- them; before running this, ensure no Notification rows reference them:
--   DELETE FROM "Notification" WHERE "type" IN ('COMMENT_ASSIGNED','COMMENT_RESOLVED');
-- (Only needed if you must also remove the enum values via a full type swap —
--  otherwise leaving the extra values is completely safe.)
--
-- HOW to apply:
--   psql "$DATABASE_URL" -f prisma/migrations/manual/chat_gd3_task_comment_actions_rollback.sql
--   then revert schema.prisma and run `prisma generate`.

-- 3. Drop read-state table (D1)
DROP TABLE IF EXISTS "TaskCommentReadState";

-- 2. Drop the GĐ3 indexes
DROP INDEX IF EXISTS "TaskComment_actionAssignedToId_actionResolvedAt_idx";
DROP INDEX IF EXISTS "TaskComment_taskId_pinnedAt_idx";

-- 1. Drop the additive TaskComment columns
ALTER TABLE "TaskComment" DROP COLUMN IF EXISTS "actionAssignedToId";
ALTER TABLE "TaskComment" DROP COLUMN IF EXISTS "actionAssignedById";
ALTER TABLE "TaskComment" DROP COLUMN IF EXISTS "actionAssignedAt";
ALTER TABLE "TaskComment" DROP COLUMN IF EXISTS "actionResolvedAt";
ALTER TABLE "TaskComment" DROP COLUMN IF EXISTS "actionResolvedById";
ALTER TABLE "TaskComment" DROP COLUMN IF EXISTS "spawnedTaskId";
ALTER TABLE "TaskComment" DROP COLUMN IF EXISTS "pinnedAt";
ALTER TABLE "TaskComment" DROP COLUMN IF EXISTS "pinnedById";

-- 4. NotificationType enum values are intentionally NOT dropped (see caveat).
