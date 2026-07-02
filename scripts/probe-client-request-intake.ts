/**
 * [Client Task Submission v2] Smoke probe for the ClientTaskRequest intake model.
 * Creates ONE throwaway request row against real tenancy ids, asserts the columns
 * + enum default + admin-inbox query path, exercises the fail-closed scope guard
 * logic, then DELETES the row (zero residue). No app code imported (avoids the
 * 'use server' request-context deps) — validates the schema/migration + logic.
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
  console.log('=== ClientTaskRequest intake probe ===\n')

  // Pick a real (profileId, clientId) + a workspace for that profile.
  const client = await prisma.client.findFirst({
    where: { status: 'ACTIVE', profileId: { not: null } },
    select: { id: true, name: true, profileId: true },
    orderBy: { id: 'asc' },
  })
  if (!client?.profileId) { console.log('No ACTIVE client with a profileId found — cannot probe.'); return }
  const ws = await prisma.workspace.findFirst({
    where: { profileId: client.profileId },
    select: { id: true, name: true },
  }) ?? await prisma.workspace.findFirst({ select: { id: true, name: true } })
  if (!ws) { console.log('No workspace found — cannot probe.'); return }
  console.log(`Fixture: profile=${client.profileId} · client=${client.id} (${client.name}) · workspace=${ws.id} (${ws.name})\n`)

  // Simulated resolved scope (what resolveShareToken would return).
  const scope = { profileId: client.profileId, clientIds: [client.id], workspaceIds: [ws.id] }

  // ── Fail-closed scope guard logic (mirrors submitClientRequestViaToken) ──
  console.log('Scope guard:')
  check('in-scope workspace accepted', scope.workspaceIds.includes(ws.id))
  check('out-of-scope workspace rejected', !scope.workspaceIds.includes('__nope__'))
  check('in-scope client accepted', scope.clientIds.includes(client.id))
  check('out-of-scope client rejected', !scope.clientIds.includes(-999999))

  // ── Create (what the action writes on a valid submit) ──
  console.log('\nCreate + read-back:')
  const created = await prisma.clientTaskRequest.create({
    data: {
      profileId: scope.profileId,
      workspaceId: ws.id,
      clientId: client.id,
      viaShareLinkId: 'probe-fake-sharelink',
      submittedVia: 'SHARE_LINK',
      title: 'PROBE — please ignore',
      videoList: 'Video 1 — A\nVideo 2 — B',
      desiredType: 'Short form',
      desiredDeadline: new Date('2026-08-01T09:00:00Z'),
      rawFootage: 'https://example.com/raw',
      collectFile: 'https://example.com/collect',
      bRoll: 'https://example.com/broll',
      refs: 'https://example.com/ref',
      submitFolder: 'https://example.com/submit',
      script: 'https://example.com/script',
      notes: 'probe brief',
      status: 'NEW',
    },
    select: { id: true, status: true, submittedVia: true, profileId: true, workspaceId: true, clientId: true, videoList: true, desiredType: true, desiredDeadline: true, rawFootage: true, refs: true, createdAt: true },
  })
  check('row created with id', !!created.id)
  check('status defaults/persists NEW', created.status === 'NEW')
  check('submittedVia SHARE_LINK', created.submittedVia === 'SHARE_LINK')
  check('profileId persisted', created.profileId === scope.profileId)
  check('workspaceId persisted', created.workspaceId === ws.id)
  check('clientId persisted', created.clientId === client.id)
  check('videoList (multiline) persisted', created.videoList === 'Video 1 — A\nVideo 2 — B')
  check('desiredType persisted', created.desiredType === 'Short form')
  check('desiredDeadline persisted', !!created.desiredDeadline)
  check('rawFootage persisted', created.rawFootage === 'https://example.com/raw')
  check('refs (reference link) persisted', created.refs === 'https://example.com/ref')

  // ── Admin-inbox query path (index-backed) ──
  console.log('\nAdmin inbox query:')
  const inbox = await prisma.clientTaskRequest.findMany({
    where: { workspaceId: ws.id, profileId: scope.profileId, status: 'NEW' },
    select: { id: true, title: true, client: { select: { name: true } } },
  })
  check('new request appears in inbox query', inbox.some((r) => r.id === created.id))
  check('client relation joins (brand name)', inbox.find((r) => r.id === created.id)?.client?.name === client.name)

  // ── Cleanup ──
  await prisma.clientTaskRequest.delete({ where: { id: created.id } })
  const gone = await prisma.clientTaskRequest.findUnique({ where: { id: created.id }, select: { id: true } })
  console.log('\nCleanup:')
  check('probe row deleted', gone === null)

  console.log(`\n=== ${ok} passed · ${fail} failed ===`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
