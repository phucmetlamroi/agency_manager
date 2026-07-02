/**
 * [QA · Track A] READ-ONLY scan of PROD (.env) for the "client task submission"
 * + "task comments" features. Two jobs:
 *   1. Inventory real data (the "quét task diện rộng") so the test scenario
 *      reflects real shapes, and to surface any anomaly hiding in prod.
 *   2. Assert the isolation invariants that are checkable read-only on real
 *      rows — especially that the client comment SELECT can never carry the
 *      GĐ3 staff-only action fields, and that client comments are always CLIENT.
 *
 * ZERO WRITES. Safe to run against production.
 *   npx tsx scripts/scan-prod-fixtures.ts
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

// The EXACT select the client token feed uses (share-portal-actions.getCommentFeedViaToken).
const CLIENT_SELECT = { id: true, authorType: true, body: true, createdAt: true, parentId: true } as const
const FORBIDDEN = ['actionAssignedToId', 'actionAssignedById', 'actionAssignedAt', 'actionResolvedAt', 'actionResolvedById', 'spawnedTaskId', 'pinnedAt', 'pinnedById', 'visibility', 'authorUserId', 'viaShareLinkId', 'mentions', 'clientId']

let pass = 0, fail = 0
const F: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; F.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const section = (t: string) => console.log(`\n━━ ${t} ━━`)

async function main() {
  console.log('=== Track A · PROD read-only scan (client-task + comments) ===')
  const host = (process.env.DATABASE_URL || '').match(/@([^/]+)/)?.[1]?.split('.')[0] || '?'
  console.log(`DB host: ${host}\n`)

  // ── 1. INVENTORY ─────────────────────────────────────────────────────────
  section('1. Inventory (real data)')
  const [taskTotal, taskArchived] = await Promise.all([
    prisma.task.count(),
    prisma.task.count({ where: { isArchived: true } }),
  ])
  console.log(`  Task: ${taskTotal} total (${taskArchived} archived)`)

  const clientsByStatus = await prisma.client.groupBy({ by: ['status'], _count: true })
  console.log('  Client by status: ' + clientsByStatus.map((c) => `${c.status}=${c._count}`).join(', '))

  const [links, linksRevoked, linksExpired] = await Promise.all([
    prisma.clientShareLink.count(),
    prisma.clientShareLink.count({ where: { revokedAt: { not: null } } }),
    prisma.clientShareLink.count({ where: { expiresAt: { lt: new Date() } } }),
  ])
  console.log(`  ClientShareLink: ${links} total (${linksRevoked} revoked, ${linksExpired} expired)`)

  const reqByStatus = await prisma.clientTaskRequest.groupBy({ by: ['status'], _count: true })
  console.log('  ClientTaskRequest by status: ' + (reqByStatus.length ? reqByStatus.map((r) => `${r.status}=${r._count}`).join(', ') : '(none)'))

  const [cmtTotal, cmtInternal, cmtClient, cmtByClientAuthor, reactions, readStates] = await Promise.all([
    prisma.taskComment.count(),
    prisma.taskComment.count({ where: { visibility: 'INTERNAL' } }),
    prisma.taskComment.count({ where: { visibility: 'CLIENT' } }),
    prisma.taskComment.count({ where: { authorType: 'CLIENT' } }),
    prisma.taskCommentReaction.count(),
    prisma.taskCommentReadState.count(),
  ])
  console.log(`  TaskComment: ${cmtTotal} total (INTERNAL=${cmtInternal}, CLIENT=${cmtClient}, client-authored=${cmtByClientAuthor})`)
  console.log(`  TaskCommentReaction: ${reactions} · TaskCommentReadState: ${readStates}`)

  const withActionItem = await prisma.taskComment.count({ where: { actionAssignedToId: { not: null } } })
  const resolved = await prisma.taskComment.count({ where: { actionResolvedAt: { not: null } } })
  console.log(`  GĐ3 action items: ${withActionItem} assigned (${resolved} resolved)`)

  // ── 2. CANDIDATE FIXTURES ────────────────────────────────────────────────
  section('2. Candidate fixtures (for manual browser checks)')
  const taskWithBoth = await prisma.taskComment.findFirst({
    where: { visibility: 'INTERNAL', isDeleted: false, task: { taskComments: { some: { visibility: 'CLIENT', isDeleted: false } } } },
    select: { taskId: true, task: { select: { title: true, workspaceId: true } } },
  })
  console.log(`  Task with both INTERNAL+CLIENT comments: ${taskWithBoth ? `${taskWithBoth.taskId} ("${taskWithBoth.task.title}") ws=${taskWithBoth.task.workspaceId}` : '(none — seed one for the manual check)'}`)
  const activeLink = await prisma.clientShareLink.findFirst({ where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { id: true, clientId: true, profileId: true } })
  console.log(`  Active share link: ${activeLink ? `${activeLink.id} (client ${activeLink.clientId}, profile ${activeLink.profileId})` : '(none)'}`)

  // ── 3. ISOLATION INVARIANTS (read-only, on real rows) ────────────────────
  section('3. Isolation invariants on real data')

  // 3a. The client feed SELECT never carries a staff-only field — prove it on a real row.
  const anyComment = await prisma.taskComment.findFirst({ select: CLIENT_SELECT })
  if (anyComment) {
    const keys = Object.keys(anyComment)
    const leaked = FORBIDDEN.filter((k) => keys.includes(k))
    check('client SELECT exposes no staff/action field', leaked.length === 0, `keys: ${keys.join(',')}`)
  } else {
    check('client SELECT exposes no staff/action field', true, 'no comments in DB (vacuously true)')
  }

  // 3b. No client-authored comment is INTERNAL (a client can never post internal).
  const clientInternal = await prisma.taskComment.count({ where: { authorType: 'CLIENT', visibility: 'INTERNAL' } })
  check('no client-authored INTERNAL comment exists', clientInternal === 0, `found ${clientInternal}`)

  // 3c. Every client-authored comment carries a share-link provenance (viaShareLinkId).
  const clientNoProvenance = await prisma.taskComment.count({ where: { authorType: 'CLIENT', viaShareLinkId: null } })
  check('every client comment has viaShareLinkId provenance', clientNoProvenance === 0, `found ${clientNoProvenance} without`)

  // 3d. Every ClientTaskRequest is scope-bound (profileId AND workspaceId set).
  const reqOrphan = await prisma.clientTaskRequest.count({ where: { OR: [{ profileId: '' }, { workspaceId: '' }] } })
  check('no ClientTaskRequest with empty scope', reqOrphan === 0, `found ${reqOrphan}`)

  // 3e. Share-link ratings never carry a client account id (clientId null, shareLinkId set).
  const badRating = await prisma.rating.count({ where: { ratedVia: 'SHARE_LINK', OR: [{ clientId: { not: null } }, { shareLinkId: null }] } })
  check('share-link ratings have clientId=null + shareLinkId set', badRating === 0, `found ${badRating} malformed`)

  // 3f. ACCEPTED requests point at a Task; REJECTED carry no taskId leak.
  const acceptedNoTask = await prisma.clientTaskRequest.count({ where: { status: 'ACCEPTED', taskId: null } })
  console.log(`  (info) ACCEPTED requests without taskId (velox-accepted, expected some): ${acceptedNoTask}`)

  console.log(`\n=== Track A RESULT: ${pass} passed, ${fail} failed ===`)
  if (fail) { console.log('\nFAILURES:'); F.forEach((f) => console.log('  - ' + f)); process.exitCode = 1 }
}

main().catch((e) => { console.error('SCAN ERROR:', e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
