/**
 * Install a Postgres BEFORE-DELETE guard on "Workspace" that BLOCKS hard-deleting an
 * ACTIVE workspace that sits under a live profile — the exact vector that silently
 * destroyed Hustly's "Tháng 6/2026" (a raw DELETE bypassing the app, no audit).
 *
 * It still ALLOWS every legitimate flow:
 *   - hard-delete-workspaces cron → only deletes status='SOFT_DELETED' rows  → allowed
 *   - hard-delete-profiles  cron → cascade where the parent Profile is SOFT_DELETED
 *     (or already gone mid-cascade) → allowed
 *   - deleteWorkspaceAction → soft-deletes (UPDATE), never a row DELETE → unaffected
 *
 * Only a DIRECT hard-delete of a live workspace under a live profile is blocked,
 * forcing the soft-delete → 30-day-trash → cron path. Idempotent (CREATE OR REPLACE
 * + DROP IF EXISTS). Reversible: DROP TRIGGER guard_active_workspace_delete ON "Workspace".
 *
 * Usage: npx tsx scripts/install-workspace-delete-guard.ts
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const fnDef = `
CREATE OR REPLACE FUNCTION block_active_workspace_hard_delete()
RETURNS TRIGGER AS $$
DECLARE
    v_profile_status TEXT;
BEGIN
    -- Purging a soft-deleted workspace (the 30-day cron) is fine.
    IF OLD.status = 'SOFT_DELETED' THEN
        RETURN OLD;
    END IF;

    -- Cascade from a profile that is itself being torn down (soft-deleted) or already
    -- removed earlier in the same cascade → allow.
    SELECT status INTO v_profile_status FROM "Profile" WHERE id = OLD."profileId";
    IF v_profile_status IS NULL OR v_profile_status = 'SOFT_DELETED' THEN
        RETURN OLD;
    END IF;

    -- Otherwise: a live workspace under a live profile is being hard-deleted directly.
    -- This is the accidental/unauthorised data-loss vector. Block it.
    RAISE EXCEPTION 'BLOCKED_ACTIVE_WORKSPACE_DELETE: workspace % ("%") is ACTIVE under a live profile; soft-delete it first (status=SOFT_DELETED). Direct hard-deletes are forbidden to prevent data loss.', OLD.id, OLD.name
        USING ERRCODE = 'P0001';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
`

const dropTrigger = `DROP TRIGGER IF EXISTS guard_active_workspace_delete ON "Workspace"`
const createTrigger = `
CREATE TRIGGER guard_active_workspace_delete
BEFORE DELETE ON "Workspace"
FOR EACH ROW
EXECUTE FUNCTION block_active_workspace_hard_delete()
`

async function main() {
    const host = (process.env.DATABASE_URL ?? '').match(/@([^/:?]+)/)?.[1] ?? '(unset)'
    console.log(`🔧 Installing workspace hard-delete guard on ${host} ...\n`)

    await prisma.$executeRawUnsafe(fnDef)
    console.log('  ✓ Function block_active_workspace_hard_delete created')
    await prisma.$executeRawUnsafe(dropTrigger)
    console.log('  ✓ Old trigger dropped (if existed)')
    await prisma.$executeRawUnsafe(createTrigger)
    console.log('  ✓ Trigger guard_active_workspace_delete created')

    const check = await prisma.$queryRawUnsafe<any[]>(
        `SELECT tgname FROM pg_trigger WHERE tgname = 'guard_active_workspace_delete'`
    )
    console.log(check.length > 0
        ? '\n✅ Verified: guard_active_workspace_delete is active.'
        : '\n⚠️  Trigger not found after install — check Postgres logs.')

    // Read-only self-test: confirm the recovered June workspace would now be protected.
    const june = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, name, status FROM "Workspace" WHERE name='Tháng 6/2026' AND "profileId"='61f25775-eb95-4ece-96e8-99ae97542af1'`
    )
    if (june.length) console.log(`   (Recovered "${june[0].name}" status=${june[0].status} → a raw DELETE on it is now blocked.)`)
}

main().catch((e) => { console.error('install failed:', e.message); process.exit(1) }).finally(() => prisma.$disconnect())
