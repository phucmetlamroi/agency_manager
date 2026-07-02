/**
 * [Trial P1] Probe: TaskComment isolation. Creates one INTERNAL + one CLIENT
 * comment on a real task, asserts the client-portal filter (visibility=CLIENT)
 * NEVER returns the internal note, and the staff feed sees both — then deletes
 * both (zero residue).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
if (!process.env.DATABASE_URL) {
  try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8')
    const m = env.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m)
    if (m) process.env.DATABASE_URL = m[1].trim()
  } catch { /* ignore */ }
}
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

let ok = 0, fail = 0
const check = (name: string, cond: boolean) => { (cond ? ok++ : fail++); console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`) }

async function main() {
  console.log('=== TaskComment isolation probe ===\n')

  const task = await prisma.task.findFirst({ where: { workspaceId: { not: null } }, select: { id: true, workspaceId: true } })
  if (!task) { console.log('No task found — cannot probe.'); return }
  console.log(`Fixture task: ${task.id}\n`)

  const internal = await prisma.taskComment.create({
    data: { taskId: task.id, authorType: 'STAFF', visibility: 'INTERNAL', body: 'PROBE internal note (staff-only)', mentions: [] },
    select: { id: true },
  })
  const client = await prisma.taskComment.create({
    data: { taskId: task.id, authorType: 'CLIENT', visibility: 'CLIENT', body: 'PROBE client message', viaShareLinkId: 'probe-link', mentions: [] },
    select: { id: true },
  })

  // Client-portal query: hard-filter visibility=CLIENT (mirrors getCommentFeedViaToken).
  const clientVisible = await prisma.taskComment.findMany({
    where: { taskId: task.id, visibility: 'CLIENT', isDeleted: false },
    select: { id: true, authorType: true, visibility: true },
  })
  check('client feed contains the CLIENT comment', clientVisible.some((c) => c.id === client.id))
  check('client feed NEVER contains the INTERNAL comment', !clientVisible.some((c) => c.id === internal.id))
  check('every client-feed row is visibility=CLIENT', clientVisible.every((c) => c.visibility === 'CLIENT'))

  // Staff feed: all visibilities.
  const staffVisible = await prisma.taskComment.findMany({ where: { taskId: task.id, isDeleted: false }, select: { id: true } })
  check('staff feed sees the INTERNAL comment', staffVisible.some((c) => c.id === internal.id))
  check('staff feed sees the CLIENT comment', staffVisible.some((c) => c.id === client.id))

  // Cleanup.
  await prisma.taskComment.deleteMany({ where: { id: { in: [internal.id, client.id] } } })
  const gone = await prisma.taskComment.count({ where: { id: { in: [internal.id, client.id] } } })
  check('probe comments deleted', gone === 0)

  console.log(`\n=== ${ok} passed · ${fail} failed ===`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
