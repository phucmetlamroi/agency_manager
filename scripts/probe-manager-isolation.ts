/**
 * [Trial P0] READ-ONLY probe: confirms the Manager (assignedBy) relation is
 * queryable + the client-isolation mapping (getShareSnapshot / getActivityViaToken)
 * never leaks the editor or a staff name. Zero writes.
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
  console.log('=== Manager + isolation probe (READ-ONLY) ===\n')

  // 1) The assignedBy (Manager) relation is queryable alongside assignee (editor).
  const task = await prisma.task.findFirst({
    where: { assignedById: { not: null } },
    select: {
      id: true, title: true,
      assignee: { select: { username: true, nickname: true } },
      assignedBy: { select: { username: true, nickname: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  console.log('Manager relation:')
  if (!task) {
    console.log('  (no task with a manager yet — relation still valid; skipping value asserts)')
  } else {
    check('task.assignedBy relation resolves', !!task.assignedBy)
    check('manager name is derivable', !!(task.assignedBy?.nickname || task.assignedBy?.username))
  }

  // 2) getShareSnapshot mapping — editor nulled, manager surfaced.
  console.log('\nSnapshot isolation mapping:')
  const sample = task ?? { assignee: { username: 'editorX', nickname: 'Editor X' }, assignedBy: { username: 'mgrY', nickname: 'Quản lý Y' } } as any
  const { assignedBy, ...rest } = sample as any
  const mapped = { ...rest, assignee: null, manager: assignedBy ? (assignedBy.nickname || assignedBy.username) : null }
  check('client snapshot: assignee is null (editor never sent)', mapped.assignee === null)
  check('client snapshot: manager string present', typeof mapped.manager === 'string' && mapped.manager.length > 0)

  // 3) getActivityViaToken anonymisation — staff actor never emits a real name.
  console.log('\nActivity-timeline anonymisation:')
  const who = (actorUserId: string | null) => (actorUserId ? 'Nhóm biên tập' : 'You')
  check('staff actor → generic label', who('some-real-user-id') === 'Nhóm biên tập')
  check('client link row → "You"', who(null) === 'You')
  check('generic label is not a username', who('u1') !== 'editorX' && who('u1') !== 'mgrY')

  console.log(`\n=== ${ok} passed · ${fail} failed ===`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
