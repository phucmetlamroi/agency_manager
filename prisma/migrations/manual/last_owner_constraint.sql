-- ────────────────────────────────────────────────────────────────────────
-- Migration: Last-OWNER protection (DB-level trigger)
-- ────────────────────────────────────────────────────────────────────────
--
-- Audit finding #5 (CRITICAL): Race condition trong workspace-guards.ts —
-- 2 OWNER concurrent demote nhau → cả 2 pass check `ownerCount <= 1` trước
-- khi DB cập nhật → workspace mồ côi 0 OWNER (Microsoft Loop bug pattern).
--
-- Fix: DB-level trigger guarantee atomic — không thể có state ownerCount=0
-- bất kể application code có race hay không. App-level check trong
-- `src/lib/workspace-guards.ts:ensureNotLastOwner()` vẫn giữ làm
-- defense-in-depth (UX better — user nhận lỗi sớm hơn round-trip DB).
--
-- Apply: chạy SQL này manually trên Neon production:
--   psql "$DATABASE_URL" -f prisma/migrations/manual/last_owner_constraint.sql
--
-- Hoặc Neon Console → SQL Editor → paste + run.
--
-- Idempotent: dùng CREATE OR REPLACE — chạy lại nhiều lần OK.

CREATE OR REPLACE FUNCTION enforce_workspace_owner_count()
RETURNS TRIGGER AS $$
DECLARE
    v_workspace_id TEXT;
    v_owner_count INT;
BEGIN
    -- Workspaces are not deleted by removing all members; the workspace itself
    -- has its own delete cascade. We only check on UPDATE (role change away
    -- from OWNER) and DELETE (member removed/left workspace).
    IF (TG_OP = 'DELETE') THEN
        v_workspace_id := OLD."workspaceId";
        -- Skip if old member was not OWNER (no impact)
        IF OLD.role <> 'OWNER' THEN
            RETURN OLD;
        END IF;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_workspace_id := NEW."workspaceId";
        -- Skip if not demoting an OWNER
        IF OLD.role <> 'OWNER' OR NEW.role = 'OWNER' THEN
            RETURN NEW;
        END IF;
    ELSE
        RETURN NEW;
    END IF;

    -- Count remaining OWNERs in the workspace AFTER this change.
    -- For DELETE: count rows excluding the deleted one (row already gone in AFTER trigger context for DELETE).
    -- For UPDATE: count rows where role='OWNER' (NEW row excluded since it's no longer OWNER).
    SELECT COUNT(*) INTO v_owner_count
    FROM "WorkspaceMember"
    WHERE "workspaceId" = v_workspace_id AND role = 'OWNER';

    IF v_owner_count = 0 THEN
        RAISE EXCEPTION 'CANNOT_REMOVE_LAST_OWNER: Workspace % must have at least one OWNER. Transfer ownership first.', v_workspace_id
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger nếu có (để re-apply clean)
DROP TRIGGER IF EXISTS ensure_workspace_owner_exists ON "WorkspaceMember";

-- AFTER trigger để row đã apply rồi mới count → chính xác
CREATE TRIGGER ensure_workspace_owner_exists
AFTER UPDATE OR DELETE ON "WorkspaceMember"
FOR EACH ROW
EXECUTE FUNCTION enforce_workspace_owner_count();

-- ────────────────────────────────────────────────────────────────────────
-- Verify trigger installed
-- ────────────────────────────────────────────────────────────────────────
-- SELECT tgname, tgrelid::regclass, tgtype
-- FROM pg_trigger
-- WHERE tgname = 'ensure_workspace_owner_exists';
--
-- Expected: 1 row matching "WorkspaceMember" relation.
-- ────────────────────────────────────────────────────────────────────────
