/**
 * Install Postgres trigger để enforce last-OWNER protection at DB level.
 *
 * Idempotent: chạy nhiều lần OK (CREATE OR REPLACE FUNCTION + DROP IF EXISTS TRIGGER).
 *
 * Usage: npx tsx scripts/install-last-owner-trigger.ts
 */

import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()

async function main() {
    console.log('🔧 Installing last-OWNER protection trigger...\n')

    // Prisma $executeRawUnsafe KHÔNG support multiple statements (prepared
    // statement protocol). Phải split inline thành 3 statements rời.

    // Statement 1: CREATE FUNCTION (chứa $$ ... $$ — semicolons bên trong OK)
    const fnDef = `
CREATE OR REPLACE FUNCTION enforce_workspace_owner_count()
RETURNS TRIGGER AS $$
DECLARE
    v_workspace_id TEXT;
    v_owner_count INT;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        v_workspace_id := OLD."workspaceId";
        IF OLD.role <> 'OWNER' THEN
            RETURN OLD;
        END IF;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_workspace_id := NEW."workspaceId";
        IF OLD.role <> 'OWNER' OR NEW.role = 'OWNER' THEN
            RETURN NEW;
        END IF;
    ELSE
        RETURN NEW;
    END IF;

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
`

    // Statement 2: DROP existing trigger (idempotent)
    const dropTrigger = `DROP TRIGGER IF EXISTS ensure_workspace_owner_exists ON "WorkspaceMember"`

    // Statement 3: CREATE trigger
    const createTrigger = `
CREATE TRIGGER ensure_workspace_owner_exists
AFTER UPDATE OR DELETE ON "WorkspaceMember"
FOR EACH ROW
EXECUTE FUNCTION enforce_workspace_owner_count()
`

    try {
        await prisma.$executeRawUnsafe(fnDef)
        console.log('  ✓ Function enforce_workspace_owner_count created')

        await prisma.$executeRawUnsafe(dropTrigger)
        console.log('  ✓ Old trigger dropped (if existed)')

        await prisma.$executeRawUnsafe(createTrigger)
        console.log('  ✓ Trigger ensure_workspace_owner_exists created')

        console.log('\n✅ Trigger installed successfully!\n')
    } catch (e: any) {
        console.error('❌ Install failed:', e.message)
        throw e
    }

    // Verify
    const result = await prisma.$queryRawUnsafe<any[]>(`
        SELECT tgname FROM pg_trigger
        WHERE tgname = 'ensure_workspace_owner_exists'
    `)
    if (result.length > 0) {
        console.log('✅ Verified: trigger "ensure_workspace_owner_exists" is active.')
    } else {
        console.error('⚠️  Trigger not found after install — check Postgres logs.')
    }

    // Smoke test: count current workspaces with 0 OWNERs (existing data integrity)
    const orphans = await prisma.$queryRawUnsafe<any[]>(`
        SELECT w.id, w.name FROM "Workspace" w
        WHERE NOT EXISTS (
            SELECT 1 FROM "WorkspaceMember" wm
            WHERE wm."workspaceId" = w.id AND wm.role = 'OWNER'
        )
        AND w.status != 'SOFT_DELETED'
    `)
    if (orphans.length > 0) {
        console.warn(`\n⚠️  WARNING: ${orphans.length} workspace(s) đã có 0 OWNER (legacy bug):`)
        for (const w of orphans) {
            console.warn(`   • ${w.id} — "${w.name}"`)
        }
        console.warn('\nXử lý: assign 1 admin/member làm OWNER thủ công, vd:')
        console.warn(`   UPDATE "WorkspaceMember" SET role='OWNER' WHERE id='<member-id>';`)
    } else {
        console.log('\n✅ Tất cả workspaces đều có ít nhất 1 OWNER.')
    }
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
