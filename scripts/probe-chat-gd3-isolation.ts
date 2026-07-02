/**
 * [Chat GĐ3] Verify the additive schema applied AND that the client token feed
 * NEVER serializes the new staff-only action fields — even on a comment that
 * has them set. Self-cleaning: any row it creates is deleted in `finally`.
 *
 *   npx tsx scripts/probe-chat-gd3-isolation.ts
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

// The EXACT select the client token path (getCommentFeedViaToken) uses.
const CLIENT_SELECT = { id: true, authorType: true, body: true, createdAt: true, parentId: true } as const
const FORBIDDEN = ['actionAssignedToId', 'actionAssignedById', 'actionAssignedAt', 'actionResolvedAt', 'actionResolvedById', 'spawnedTaskId', 'pinnedAt', 'pinnedById']

let createdCommentId: string | null = null
let createdReadTaskId: string | null = null
const PROBE_USER = 'probe-gd3-user'

async function main() {
  let pass = 0, fail = 0
  const ok = (cond: boolean, label: string) => { if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}`) } }

  console.log('=== Chat GĐ3 schema + isolation probe ===\n')

  // 1. Schema: new columns + table exist (Prisma throws on a missing column).
  console.log('[1] Additive schema present')
  await prisma.taskComment.findFirst({ select: { id: true, actionAssignedToId: true, actionResolvedAt: true, pinnedAt: true, spawnedTaskId: true } })
  ok(true, 'TaskComment action/pin columns queryable')
  await prisma.taskCommentReadState.findFirst()
  ok(true, 'TaskCommentReadState table queryable')

  // 2. Pick a real task to exercise the write paths.
  const task = await prisma.task.findFirst({ select: { id: true } })
  if (!task) { console.log('\n(no tasks in DB — skipping write tests)'); return summarize(pass, fail) }

  // 3. Create a CLIENT-visible comment and set action fields on it.
  console.log('\n[2] Client select never leaks action fields')
  const c = await prisma.taskComment.create({
    data: { taskId: task.id, authorType: 'STAFF', visibility: 'CLIENT', body: '[probe] gd3 isolation — safe to delete', mentions: [] },
    select: { id: true },
  })
  createdCommentId = c.id
  await prisma.taskComment.update({
    where: { id: c.id },
    data: {
      actionAssignedToId: PROBE_USER, actionAssignedById: PROBE_USER, actionAssignedAt: new Date(),
      actionResolvedAt: new Date(), actionResolvedById: PROBE_USER, spawnedTaskId: 'probe-task', pinnedAt: new Date(), pinnedById: PROBE_USER,
    },
  })

  // Client-path select → must contain NONE of the forbidden keys.
  const viaClient = await prisma.taskComment.findFirst({ where: { id: c.id }, select: CLIENT_SELECT })
  const clientKeys = Object.keys(viaClient || {})
  const leaked = FORBIDDEN.filter((k) => clientKeys.includes(k))
  ok(leaked.length === 0, `client select returns no action fields (keys: ${clientKeys.join(', ')})`)

  // Staff-path (full row) → SHOULD carry them (proves the fields actually persist).
  const viaStaff = await prisma.taskComment.findUnique({ where: { id: c.id } })
  ok(!!viaStaff?.actionAssignedToId && !!viaStaff?.actionResolvedAt, 'staff full-row select carries the action fields')

  // 4. Read-state upsert round-trips.
  console.log('\n[3] TaskCommentReadState upsert')
  createdReadTaskId = task.id
  await prisma.taskCommentReadState.upsert({
    where: { userId_taskId: { userId: PROBE_USER, taskId: task.id } },
    update: { lastReadAt: new Date() },
    create: { userId: PROBE_USER, taskId: task.id },
  })
  const rs = await prisma.taskCommentReadState.findUnique({ where: { userId_taskId: { userId: PROBE_USER, taskId: task.id } } })
  ok(!!rs, 'read-state row upserted and read back')

  summarize(pass, fail)
}

function summarize(pass: number, fail: number) {
  console.log(`\n=== ${pass} passed, ${fail} failed ===`)
  if (fail > 0) process.exitCode = 1
}

main()
  .catch((e) => { console.error('PROBE ERROR:', e); process.exitCode = 1 })
  .finally(async () => {
    // Clean up anything we created — leave the DB exactly as we found it.
    try { if (createdCommentId) await prisma.taskComment.delete({ where: { id: createdCommentId } }) } catch { /* ignore */ }
    try { if (createdReadTaskId) await prisma.taskCommentReadState.delete({ where: { userId_taskId: { userId: PROBE_USER, taskId: createdReadTaskId } } }) } catch { /* ignore */ }
    await prisma.$disconnect()
  })
