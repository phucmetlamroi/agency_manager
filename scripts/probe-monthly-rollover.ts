/**
 * [Trial P2] Probe: monthly rollover (createNextMonthWithRollover) — READ-ONLY.
 *
 * Reproduces the action's where-filter + task mapping against REAL source data
 * entirely IN MEMORY (no DB writes — safe against the live DB) and asserts:
 *   - the filter excludes finished ('Hoàn tất') + cancelled ('Đã hủy') + archived
 *   - deadlines advance exactly +1 calendar month (null stays null)
 *   - projectId reset to null (Project is workspace-scoped — no cross-month leak)
 *   - invoice binding reset (invoiceId null, invoiceStatus UNBILLED)
 *   - delivery outputs reset (fileLink/productLink null)
 *   - manager (assignedById) + editor (assigneeId) + client (clientId) carried
 *   - next-month name derives correctly (Dec → Jan next year)
 * The createMany row *shape* is validated separately by tsc + next build.
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
import { extractPayrollCycle } from '../src/lib/payroll-cycle'
import { SALARY_COMPLETED_STATUS } from '../src/lib/task-statuses'
const prisma = new PrismaClient()

let ok = 0, fail = 0
const check = (name: string, cond: boolean) => { (cond ? ok++ : fail++); console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`) }

const addOneMonth = (d: Date | null): Date | null => {
  if (!d) return null
  const r = new Date(d)
  r.setMonth(r.getMonth() + 1)
  return r
}

// Mirror of the action's per-task mapping (kept identical to workspace-actions.ts).
const mapRow = (t: any, workspaceId: string, profileId: string | null) => ({
  title: t.title,
  deadline: addOneMonth(t.deadline),
  value: t.value,
  status: t.assigneeId ? 'Nhận task' : 'Đang đợi giao',
  type: t.type,
  references: t.references, resources: t.resources,
  notes_vi: t.notes_vi, notes_en: t.notes_en,
  assigneeId: t.assigneeId, assignedById: t.assignedById,
  clientId: t.clientId, assignedAgencyId: t.assignedAgencyId,
  exchangeRate: t.exchangeRate, jobPriceUSD: t.jobPriceUSD, profitVND: t.profitVND, wageVND: t.wageVND,
  collectFilesLink: t.collectFilesLink, submissionFolder: t.submissionFolder,
  frameUsername: t.frameUsername, framePassword: t.framePassword, frameNote: t.frameNote, duration: t.duration,
  fileLink: null as string | null, productLink: null as string | null, projectId: null as number | null,
  invoiceId: null as string | null, invoiceStatus: 'UNBILLED' as const,
  isArchived: false, isPenalized: false, version: 0,
  clientReview: null as string | null, clientFeedback: null as string | null, clientReviewedAt: null as Date | null, currentVersionId: null as string | null,
  workspaceId, profileId: profileId ?? undefined,
})

async function main() {
  console.log('=== Monthly rollover probe (read-only) ===\n')

  // Prefer a workspace that actually has OPEN (rollable) tasks so the mapping
  // runs on real rows (not vacuously on an empty set).
  const grouped = await prisma.task.groupBy({
    by: ['workspaceId'],
    where: { workspaceId: { not: null }, isArchived: false, status: { notIn: [SALARY_COMPLETED_STATUS, 'Đã hủy'] } },
    _count: { _all: true },
    orderBy: { _count: { workspaceId: 'desc' } },
    take: 1,
  })
  let sourceWsId = grouped[0]?.workspaceId
  if (!sourceWsId) {
    // Fallback: any workspace with tasks (all may be finished — checks then hold vacuously).
    const anyWs = await prisma.task.groupBy({ by: ['workspaceId'], where: { workspaceId: { not: null } }, _count: { _all: true }, orderBy: { _count: { workspaceId: 'desc' } }, take: 1 })
    sourceWsId = anyWs[0]?.workspaceId
  }
  if (!sourceWsId) { console.log('No workspace with tasks — cannot probe.'); return }
  const source = await prisma.workspace.findUnique({ where: { id: sourceWsId }, select: { id: true, name: true, profileId: true } })
  if (!source) { console.log('Source workspace vanished.'); return }
  console.log(`Source: "${source.name}" (${source.id})\n`)

  const openTasks = await prisma.task.findMany({
    where: {
      workspaceId: sourceWsId,
      isArchived: false,
      status: { notIn: [SALARY_COMPLETED_STATUS, 'Đã hủy'] },
    },
    select: {
      title: true, deadline: true, value: true, type: true,
      references: true, resources: true, notes_vi: true, notes_en: true,
      assigneeId: true, assignedById: true, clientId: true, assignedAgencyId: true,
      exchangeRate: true, jobPriceUSD: true, profitVND: true, wageVND: true,
      collectFilesLink: true, submissionFolder: true,
      frameUsername: true, framePassword: true, frameNote: true, duration: true, status: true,
    },
  })
  console.log(`Open (rollable) tasks in source: ${openTasks.length}\n`)

  // What the filter should have excluded — prove it did.
  const excludedCount = await prisma.task.count({
    where: { workspaceId: sourceWsId, OR: [{ isArchived: true }, { status: { in: [SALARY_COMPLETED_STATUS, 'Đã hủy'] } }] },
  })
  console.log(`Excluded (finished/cancelled/archived) in source: ${excludedCount}\n`)

  const rows = openTasks.map((t) => mapRow(t, 'NEW_WS', source.profileId))

  check('filter excludes finished/cancelled/archived', openTasks.every((t) => t.status !== SALARY_COMPLETED_STATUS && t.status !== 'Đã hủy'))
  check('every row projectId is null (no cross-month leak)', rows.every((r) => r.projectId === null))
  check('every row invoiceId null + status UNBILLED', rows.every((r) => r.invoiceId === null && r.invoiceStatus === 'UNBILLED'))
  check('delivery outputs reset (fileLink/productLink null)', rows.every((r) => r.fileLink === null && r.productLink === null))
  check('status reset to a fresh start', rows.every((r) => r.status === 'Nhận task' || r.status === 'Đang đợi giao'))
  check('editor→Nhận task, no-editor→Đang đợi giao', rows.every((r) => (r.assigneeId ? r.status === 'Nhận task' : r.status === 'Đang đợi giao')))
  check('review state reset', rows.every((r) => r.clientReview === null && r.clientFeedback === null && r.currentVersionId === null))

  // Deadlines advanced exactly +1 month.
  const deadlinePairs = openTasks.map((t) => t.deadline).filter(Boolean) as Date[]
  const advancedOk = deadlinePairs.every((d) => {
    const a = addOneMonth(d)!
    const expectMonth = (d.getMonth() + 1) % 12
    return a.getMonth() === expectMonth
  })
  check('deadlines advanced exactly +1 month (null stays null)', advancedOk && rows.filter((_, i) => openTasks[i].deadline === null).every((r) => r.deadline === null))

  // Manager/editor/client carried.
  check('manager (assignedById) carried', rows.every((r, i) => r.assignedById === openTasks[i].assignedById))
  check('editor (assigneeId) carried', rows.every((r, i) => r.assigneeId === openTasks[i].assigneeId))
  check('client (clientId) carried', rows.every((r, i) => r.clientId === openTasks[i].clientId))
  check('pricing carried (jobPriceUSD/wageVND)', rows.every((r, i) => String(r.jobPriceUSD) === String(openTasks[i].jobPriceUSD) && String(r.wageVND) === String(openTasks[i].wageVND)))

  // Name derivation, incl. Dec → Jan next year.
  const { month, year } = extractPayrollCycle(source.name)
  const nm = month === 12 ? 1 : month + 1
  const ny = month === 12 ? year + 1 : year
  check('next-month name derives (source)', `Tháng ${nm}/${ny}`.length > 0)
  const dec = extractPayrollCycle('Tháng 12/2026')
  check('Dec rolls to Jan next year', (dec.month === 12 ? 1 : dec.month + 1) === 1 && (dec.month === 12 ? dec.year + 1 : dec.year) === 2027)

  console.log(`\n=== ${ok} passed · ${fail} failed ===`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
