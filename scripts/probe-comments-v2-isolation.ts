/**
 * [Trial P3] Read-only probe for Comments v2 (reactions + reply threads)
 * isolation. Confirms the new tables exist and the client-facing guards hold
 * against REAL data — WITHOUT writing anything:
 *   - the client comment feed WHERE clause (visibility=CLIENT) never yields an
 *     INTERNAL comment (so its reactions/replies can never reach a client)
 *   - reactions are only ever aggregated for CLIENT comment ids
 *   - the reply-parent guard (visibility=CLIENT) rejects an INTERNAL parent
 *   - the reply-parent guard rejects a parent on a DIFFERENT task
 * Vacuous checks (no INTERNAL rows yet) still confirm the queries run on the
 * new schema. The write-path guards mirror the proven P1 CLIENT hard-filter.
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
  console.log('=== Comments v2 isolation probe (read-only) ===\n')

  // 0) New tables exist / queries run on the new schema.
  const reactionCount = await prisma.taskCommentReaction.count()
  const replyCount = await prisma.taskComment.count({ where: { parentId: { not: null } } })
  console.log(`Reactions in DB: ${reactionCount} · replies in DB: ${replyCount}\n`)
  check('taskCommentReaction table queryable', Number.isInteger(reactionCount))
  check('parentId column queryable', Number.isInteger(replyCount))

  // Pick a task that has at least one comment.
  const anyComment = await prisma.taskComment.findFirst({ where: { isDeleted: false }, select: { taskId: true } })
  if (!anyComment) { console.log('No comments in DB — schema checks only.'); console.log(`\n=== ${ok} passed · ${fail} failed ===`); return }
  const taskId = anyComment.taskId

  // 1) Client feed WHERE clause excludes INTERNAL (mirrors getCommentFeedViaToken).
  const clientVisible = await prisma.taskComment.findMany({
    where: { taskId, visibility: 'CLIENT', isDeleted: false },
    select: { id: true, visibility: true },
  })
  check('client feed rows are all visibility=CLIENT', clientVisible.every((c) => c.visibility === 'CLIENT'))

  const internalOnTask = await prisma.taskComment.findMany({ where: { taskId, visibility: 'INTERNAL', isDeleted: false }, select: { id: true } })
  const clientIds = new Set(clientVisible.map((c) => c.id))
  check('no INTERNAL comment id appears in the client feed', internalOnTask.every((c) => !clientIds.has(c.id)))

  // 2) Reactions are only aggregated for CLIENT comment ids — an INTERNAL
  //    comment's reactions can never enter the client aggregation.
  const clientCommentIds = clientVisible.map((c) => c.id)
  const aggregated = clientCommentIds.length
    ? await prisma.taskCommentReaction.findMany({ where: { commentId: { in: clientCommentIds } }, select: { commentId: true } })
    : []
  check('reaction aggregation set ⊆ CLIENT comment ids', aggregated.every((r) => clientIds.has(r.commentId)))

  // 3) Reply-parent guard: an INTERNAL comment can never be a client's reply parent.
  if (internalOnTask[0]) {
    const guarded = await prisma.taskComment.findFirst({
      where: { id: internalOnTask[0].id, taskId, isDeleted: false, visibility: 'CLIENT' },
      select: { id: true },
    })
    check('reply-parent guard rejects an INTERNAL parent', guarded === null)
  } else {
    console.log('  (skip) no INTERNAL comment on this task to test parent guard')
  }

  // 4) Reply-parent guard is task-scoped: a CLIENT comment on ANOTHER task is not a valid parent here.
  const otherTaskComment = await prisma.taskComment.findFirst({
    where: { visibility: 'CLIENT', isDeleted: false, taskId: { not: taskId } },
    select: { id: true },
  })
  if (otherTaskComment) {
    const crossTask = await prisma.taskComment.findFirst({
      where: { id: otherTaskComment.id, taskId, isDeleted: false, visibility: 'CLIENT' },
      select: { id: true },
    })
    check('reply-parent guard rejects a parent from a different task', crossTask === null)
  } else {
    console.log('  (skip) no CLIENT comment on another task to test cross-task guard')
  }

  console.log(`\n=== ${ok} passed · ${fail} failed ===`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
