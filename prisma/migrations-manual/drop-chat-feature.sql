-- Chat feature removal migration (Knowledge Hub / Chat purge)
-- Drops all chat-related tables + enums + WikiPage.channelId FK constraint
-- Run via: npx prisma db execute --file prisma/migrations-manual/drop-chat-feature.sql --url <DATABASE_URL>

-- 1) Drop WikiPage.channelId FK + column so Channel can be dropped without conflict
ALTER TABLE "WikiPage" DROP CONSTRAINT IF EXISTS "WikiPage_channelId_fkey";
ALTER TABLE "WikiPage" DROP COLUMN IF EXISTS "channelId";

-- 2) Drop Attachment.messageId FK + column (Attachment now only for WikiPage)
ALTER TABLE "Attachment" DROP CONSTRAINT IF EXISTS "Attachment_messageId_fkey";
DROP INDEX IF EXISTS "Attachment_messageId_idx";
ALTER TABLE "Attachment" DROP COLUMN IF EXISTS "messageId";

-- 3) Drop NotificationType enum values that no longer exist
-- Postgres has no direct enum-value drop; we recreate the type.
-- First reassign any rows using the doomed values to a fallback (TASK_ASSIGNED), then swap types.
-- WARNING: if you have legacy chat notifications, they'll be relabeled.
UPDATE "Notification" SET "type" = 'TASK_ASSIGNED'
 WHERE "type" IN ('NEW_MESSAGE', 'MENTION', 'GROUP_MEMBER_ADDED', 'GROUP_MEMBER_REMOVED',
                  'GROUP_MEMBER_LEFT', 'GROUP_DELETED', 'CHANNEL_MESSAGE', 'THREAD_REPLY', 'TASK_CHAT');

ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
CREATE TYPE "NotificationType" AS ENUM (
    'TASK_ASSIGNED', 'TASK_UNASSIGNED', 'TASK_STATUS_CHANGED',
    'TASK_DEADLINE_APPROACHING', 'TASK_OVERDUE', 'TASK_COMMENT',
    'TASK_STARTED', 'TASK_DELIVERED',
    'WORKSPACE_INVITATION_ACCEPTED', 'WORKSPACE_INVITATION_DECLINED', 'WORKSPACE_INVITATION_RECEIVED'
);
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType" USING ("type"::text::"NotificationType");
DROP TYPE "NotificationType_old";

-- 4) Drop all chat tables (CASCADE handles back-FKs cleanly)
DROP TABLE IF EXISTS "LinkPreview" CASCADE;
DROP TABLE IF EXISTS "ChannelOverwrite" CASCADE;
DROP TABLE IF EXISTS "CustomRoleMember" CASCADE;
DROP TABLE IF EXISTS "CustomRole" CASCADE;
DROP TABLE IF EXISTS "ChannelMember" CASCADE;
DROP TABLE IF EXISTS "Mention" CASCADE;
DROP TABLE IF EXISTS "Reaction" CASCADE;
DROP TABLE IF EXISTS "Message" CASCADE;
DROP TABLE IF EXISTS "Channel" CASCADE;
DROP TABLE IF EXISTS "Category" CASCADE;

-- 5) Drop chat enums
DROP TYPE IF EXISTS "ChannelType";
DROP TYPE IF EXISTS "ChannelVisibility";
DROP TYPE IF EXISTS "PostPolicy";
DROP TYPE IF EXISTS "ChannelRole";
