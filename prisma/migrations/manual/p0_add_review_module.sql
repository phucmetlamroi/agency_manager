-- [Review module · P0 · 2026-07-04] Raw-SQL constraints Prisma cannot express
-- (DATA-MODEL.md §12). Applied with:
--   npx prisma db execute --file prisma/migrations/manual/p0_add_review_module.sql --schema prisma/schema.prisma
--
-- SURVIVAL NOTE: the repo's postinstall runs `prisma db push` on every Vercel
-- build. Prisma's diff engine CANNOT model expression/partial indexes or CHECK
-- constraints, so it ignores (and therefore preserves) everything below.
-- Verified after apply by running `prisma db push` again → "already in sync".
-- (The varchar_pattern_ops path index IS Prisma-expressible and lives in the
-- schema itself via `ops: raw(...)` — not here.)

-- (1) Unique live name per parent, case-insensitive (invariant I13)
CREATE UNIQUE INDEX IF NOT EXISTS review_folder_name_per_parent
  ON "ReviewFolder" ("parentId", lower("name")) WHERE "deletedAt" IS NULL AND "parentId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS review_asset_name_per_folder
  ON "ReviewAsset" ("folderId", lower("name")) WHERE "deletedAt" IS NULL;

-- (2) XOR author on comment / reaction (invariant I7)
ALTER TABLE "ReviewComment" DROP CONSTRAINT IF EXISTS comment_author_xor;
ALTER TABLE "ReviewComment" ADD CONSTRAINT comment_author_xor
  CHECK (("authorId" IS NULL) <> ("guestSessionId" IS NULL));
ALTER TABLE "CommentReaction" DROP CONSTRAINT IF EXISTS reaction_actor_xor;
ALTER TABLE "CommentReaction" ADD CONSTRAINT reaction_actor_xor
  CHECK (("userId" IS NULL) <> ("guestSessionId" IS NULL));

-- (3) Range comment requires a timecode (invariant I5)
ALTER TABLE "ReviewComment" DROP CONSTRAINT IF EXISTS comment_range_needs_timecode;
ALTER TABLE "ReviewComment" ADD CONSTRAINT comment_range_needs_timecode
  CHECK ("durationMs" IS NULL OR "timecodeMs" IS NOT NULL);

-- (4) ShareLinkItem scope XOR (invariant I9)
ALTER TABLE "ShareLinkItem" DROP CONSTRAINT IF EXISTS share_item_scope_xor;
ALTER TABLE "ShareLinkItem" ADD CONSTRAINT share_item_scope_xor
  CHECK (("folderId" IS NULL) <> ("assetId" IS NULL));

-- (5) Attachments are images only (invariant I11)
ALTER TABLE "CommentAttachment" DROP CONSTRAINT IF EXISTS attachment_image_only;
ALTER TABLE "CommentAttachment" ADD CONSTRAINT attachment_image_only
  CHECK ("mimeType" LIKE 'image/%');

-- ── Rollback ────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS review_folder_name_per_parent;
-- DROP INDEX IF EXISTS review_asset_name_per_folder;
-- ALTER TABLE "ReviewComment"     DROP CONSTRAINT IF EXISTS comment_author_xor;
-- ALTER TABLE "CommentReaction"   DROP CONSTRAINT IF EXISTS reaction_actor_xor;
-- ALTER TABLE "ReviewComment"     DROP CONSTRAINT IF EXISTS comment_range_needs_timecode;
-- ALTER TABLE "ShareLinkItem"     DROP CONSTRAINT IF EXISTS share_item_scope_xor;
-- ALTER TABLE "CommentAttachment" DROP CONSTRAINT IF EXISTS attachment_image_only;
-- (Whole-module rollback: git revert the schema commit + `prisma db push` — tables are empty at P0.)
