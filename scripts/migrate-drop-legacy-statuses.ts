/**
 * [bug-report #2] Data migration for the status cleanup (owner 2026-07-07).
 *
 * Remaps every existing Task row sitting at a REMOVED status to a kept status BEFORE the code that
 * drops those statuses from VALID_TASK_STATUSES is deployed. Without this, those rows would hold an
 * invalid status → they vanish from every board/tab filter AND (for the salaryPending ones) the editor
 * would be under-counted. All three targets keep the correct payroll semantics:
 *
 *   'Sửa frame'  → 'Revision'         (salaryPending:true  → true   — editor stays owed)
 *   'Gửi lại'    → 'Revision'         (salaryPending:true  → true   — editor stays owed)
 *   'Tạm ngưng'  → 'Đang thực hiện'   (salaryPending:false → true — a resumed task now counts, intended)
 *
 * 'Revision' and 'Đã hủy' are KEPT and untouched. The archive/cancel mechanism ('Đã hủy' + isArchived)
 * is unchanged.
 *
 * SAFETY: dry-run by default (counts only). Pass --apply to write. Idempotent — after a successful
 * apply there are zero rows in the removed statuses, so a re-run is a no-op. Prints the target DB host
 * (from DATABASE_URL) so you can CONFIRM you are pointed at the intended database before applying.
 *
 * Connection: uses the plain PrismaClient exactly like the app (src/lib/db). The generated client is
 * `--no-engine` (Accelerate), so it must be run in an environment whose DATABASE_URL is the SAME
 * Accelerate URL the app deploys with (a direct postgresql:// URL will not connect with this client).
 * Easiest: run it from the deploy environment / with the prod DATABASE_URL the app already uses.
 *
 * DEPLOY ORDER (must precede the code deploy): run --apply on PROD FIRST, then deploy the branch that
 * removes the statuses. Running the code deploy first would strand any remaining legacy-status rows.
 *
 * Usage (with the app's DATABASE_URL in the environment):
 *   npx tsx scripts/migrate-drop-legacy-statuses.ts            # DRY RUN (no writes)
 *   npx tsx scripts/migrate-drop-legacy-statuses.ts --apply    # APPLY — run on PROD before deploy
 */
import { PrismaClient } from '@prisma/client'

const REMAP: { from: string; to: string }[] = [
    { from: 'Sửa frame', to: 'Revision' },
    { from: 'Gửi lại', to: 'Revision' },
    { from: 'Tạm ngưng', to: 'Đang thực hiện' },
]

function dbHost(): string {
    try {
        const u = process.env.DATABASE_URL || ''
        return u ? new URL(u).host : '(DATABASE_URL not set)'
    } catch {
        return '(unparseable DATABASE_URL)'
    }
}

async function main() {
    const apply = process.argv.includes('--apply')
    const prisma = new PrismaClient()

    console.log(`\n[migrate-drop-legacy-statuses] DB host: ${dbHost()}`)
    console.log(apply ? '>>> APPLY mode — will WRITE\n' : '>>> DRY RUN — no writes (pass --apply to write)\n')

    let totalToChange = 0
    for (const { from } of REMAP) {
        const n = await prisma.task.count({ where: { status: from } })
        totalToChange += n
        console.log(`  ${n.toString().padStart(5)}  task(s) at "${from}"`)
    }
    console.log(`  ${'—'.repeat(5)}`)
    console.log(`  ${totalToChange.toString().padStart(5)}  total to remap\n`)

    if (totalToChange === 0) {
        console.log('Nothing to migrate (already clean or no legacy rows). ✅\n')
        return
    }
    if (!apply) {
        console.log('DRY RUN complete — re-run with --apply to perform the remap.\n')
        return
    }

    let changed = 0
    for (const { from, to } of REMAP) {
        const res = await prisma.task.updateMany({ where: { status: from }, data: { status: to } })
        changed += res.count
        console.log(`  "${from}" → "${to}": updated ${res.count}`)
    }
    console.log(`\nDONE — remapped ${changed} task(s). ✅`)

    // Post-check: confirm zero rows remain at the removed statuses (idempotency proof).
    let remaining = 0
    for (const { from } of REMAP) remaining += await prisma.task.count({ where: { status: from } })
    if (remaining === 0) console.log('Post-check: 0 rows remain at removed statuses. ✅\n')
    else console.error(`Post-check FAILED: ${remaining} rows still at removed statuses.\n`)
}

main().catch((e) => {
    console.error('[migrate-drop-legacy-statuses] ERROR:', e)
    process.exit(1)
})
