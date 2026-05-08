-- Migration: Workspace Security Phase 1
-- Date: 2026-05-07
-- Plan: .claude/plans/kind-gliding-wren.md
--
-- This migration is ADDITIVE-ONLY — no existing columns are dropped or
-- retyped. Safe to deploy on a live DB without downtime.
--
-- Changes:
-- 1. New `AuditLog` table (immutable, append-only audit trail)
-- 2. New columns on `Workspace`: status, deletedAt, hardDeleteAfter (soft-delete)
-- 3. New optional column `TagCategory.workspaceId` + relation
--
-- DEFERRED TO LATER MIGRATION:
-- - WorkspaceMember.role: TEXT → enum WorkspaceRole (needs data audit first)
-- - TagCategory.workspaceId: NOT NULL (after backfill complete)
-- - REVOKE UPDATE/DELETE on AuditLog from app role (Phase 2 hardening)
-- - Postgres trigger for "always >= 1 OWNER" CHECK (Phase 2 race-safe guard)

-- 1. AuditLog -----------------------------------------------------------------
CREATE TABLE "AuditLog" (
    "id"            BIGSERIAL    NOT NULL,
    "workspaceId"   TEXT         NOT NULL,
    "actorUserId"   TEXT,
    "action"        TEXT         NOT NULL,
    "targetType"    TEXT         NOT NULL,
    "targetId"      TEXT,
    "beforeData"    JSONB,
    "afterData"     JSONB,
    "ipAddress"     TEXT,
    "userAgent"     TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

ALTER TABLE "AuditLog"
    ADD CONSTRAINT "AuditLog_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
    ADD CONSTRAINT "AuditLog_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Workspace soft-delete ---------------------------------------------------
ALTER TABLE "Workspace"
    ADD COLUMN "status"          TEXT         NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN "deletedAt"       TIMESTAMP(3),
    ADD COLUMN "hardDeleteAfter" TIMESTAMP(3);

CREATE INDEX "Workspace_status_deletedAt_idx" ON "Workspace"("status", "deletedAt");

-- 3. TagCategory.workspaceId (nullable for now, backfill via app) ------------
ALTER TABLE "TagCategory"
    ADD COLUMN "workspaceId" TEXT;

CREATE INDEX "TagCategory_workspaceId_idx" ON "TagCategory"("workspaceId");

ALTER TABLE "TagCategory"
    ADD CONSTRAINT "TagCategory_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
