-- [P0-pre · 2026-07-03] Drop the Cloudflare-Stream video-review EXPERIMENT
-- (superseded by the Mux + R2 review module — docs/review-module/).
--
-- Verified via read-only probe BEFORE the drop (prod, autumn-flower):
--   VideoVersion=0, ReviewComment=0, CommentReaction=0, CommentAttachment=0,
--   Task.currentVersionId set on 0 rows  → zero data loss.
--
-- Applied via `prisma db push` after removing the models from schema.prisma
-- (this file is the audit record of the DDL, matching repo convention).
-- Core tables (Task/User/Client/Workspace) are NOT altered; the legacy scalar
-- column "Task"."currentVersionId" is intentionally KEPT (additive-only rule).

DROP TABLE IF EXISTS "CommentAttachment";
DROP TABLE IF EXISTS "CommentReaction";
DROP TABLE IF EXISTS "ReviewComment";
DROP TABLE IF EXISTS "VideoVersion";
DROP TYPE  IF EXISTS "VideoVersionStatus";
DROP TYPE  IF EXISTS "CommentAuthorType";
-- NOTE: enum "CommentVisibility" is KEPT — TaskComment.visibility depends on it.

-- ── Rollback ────────────────────────────────────────────────────────────────
-- Tables were empty; full restore = `git revert` the schema commit that
-- removed these models, then `prisma db push` (recreates all 4 tables + the
-- 2 enums exactly as defined at commit f64a317 and earlier).
