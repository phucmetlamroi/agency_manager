/**
 * [QA · Track B] Client Task Submission v2 (CTv2) security + functional harness.
 *
 * Exercises the REAL token-path server actions (submitClientRequestViaToken,
 * createSubClientViaToken, getSubmitOptionsViaToken) end-to-end by seeding a
 * ClientShareLink with a self-hashed token — the token IS the credential, so no
 * session is needed and these run from tsx. Admin-side accept/reject are
 * session-gated (cannot run here) → their field-mapping is replayed at the DB
 * layer and the live UI is covered by the manual checklist.
 *
 * SAFETY: runs ONLY against the Neon `test` branch (.env.test → host must
 * contain "frosty-forest"); HARD-EXITS if it looks like prod ("autumn-flower").
 * Every fixture carries the "__cts__" prefix and is deleted before + after.
 *
 *   npx tsx scripts/test-client-task-submission.ts
 */
import fs from 'fs'
import path from 'path'

/* 0) Load .env.test + HARD-GUARD */
function loadEnvTest() {
  const p = path.join(process.cwd(), '.env.test')
  if (!fs.existsSync(p)) { console.error('❌ .env.test not found — refusing to run.'); process.exit(1) }
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}
loadEnvTest()
const DB = process.env.DATABASE_URL || ''
if (!DB.includes('frosty-forest') || DB.includes('autumn-flower')) {
  console.error('❌ SAFETY ABORT: DATABASE_URL is not the Neon test branch (frosty-forest).')
  process.exit(1)
}
// Suppress REAL outbound email — assertions check notification ROWS, not delivery.
// Empty (not delete) so a transitive dotenv reload of .env can't repopulate it;
// email.ts does `API_KEY ? new Resend(API_KEY) : null` → '' is falsy → no send.
process.env.RESEND_API_KEY = ''

/* Dynamic imports after env is set */
let prisma: any, sp: any, auth: any, rl: any
async function init() {
  ;({ prisma } = await import('../src/lib/db'))
  sp = await import('../src/actions/share-portal-actions')
  auth = await import('../src/lib/share-link-auth')
  rl = await import('../src/lib/rate-limit')
}

/* Tiny runner */
let passCount = 0, failCount = 0
const failures: string[] = []
function check(name: string, pass: boolean, detail = '') {
  if (pass) { passCount++; console.log(`  ✅ ${name}`) }
  else { failCount++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const section = (t: string) => console.log(`\n━━ ${t} ━━`)

const P = '__cts__'
const TOKEN = 'cts_test_token_000000000000000000000000000' // matches /^[A-Za-z0-9_-]{20,128}$/
const ids: Record<string, any> = {}

async function cleanup() {
  const staleProfiles = await prisma.profile.findMany({ where: { name: { startsWith: P } }, select: { id: true } })
  const pids = staleProfiles.map((p: any) => p.id)
  if (pids.length) {
    await prisma.clientTaskRequest.deleteMany({ where: { profileId: { in: pids } } })
    await prisma.clientShareLink.deleteMany({ where: { profileId: { in: pids } } })
    await prisma.client.deleteMany({ where: { profileId: { in: pids } } })
  }
  await prisma.notification.deleteMany({ where: { user: { username: { startsWith: P } } } })
  await prisma.workspaceMember.deleteMany({ where: { workspace: { profile: { name: { startsWith: P } } } } })
  await prisma.profileAccess.deleteMany({ where: { profile: { name: { startsWith: P } } } })
  await prisma.workspace.deleteMany({ where: { profile: { name: { startsWith: P } } } })
  await prisma.user.deleteMany({ where: { username: { startsWith: P } } })
  await prisma.profile.deleteMany({ where: { name: { startsWith: P } } })
}

async function seed() {
  const prof = await prisma.profile.create({ data: { name: `${P}P` }, select: { id: true } })
  ids.profileId = prof.id

  const mkUser = async (key: string, role = 'USER') => {
    const u = await prisma.user.create({
      data: { username: `${P}${key}`, email: `${P}${key}@test.local`, role, password: 'x', displayName: `${P}${key}`, profileId: prof.id },
      select: { id: true },
    })
    ids[key] = u.id
    return u.id
  }
  await mkUser('owner'); await prisma.profileAccess.create({ data: { userId: ids.owner, profileId: prof.id, role: 'OWNER' } })
  await mkUser('admin'); await prisma.profileAccess.create({ data: { userId: ids.admin, profileId: prof.id, role: 'ADMIN' } })
  await mkUser('user'); await prisma.profileAccess.create({ data: { userId: ids.user, profileId: prof.id, role: 'USER' } })

  const wsActive = await prisma.workspace.create({ data: { name: `${P}wsActive`, profileId: prof.id, status: 'ACTIVE' }, select: { id: true } })
  const wsArchived = await prisma.workspace.create({ data: { name: `${P}wsArchived`, profileId: prof.id, status: 'SOFT_DELETED' }, select: { id: true } })
  ids.wsActive = wsActive.id
  ids.wsArchived = wsArchived.id
  await prisma.workspaceMember.create({ data: { userId: ids.owner, workspaceId: wsActive.id, role: 'OWNER' } })

  const brand = await prisma.client.create({ data: { name: `${P}Brand`, profileId: prof.id, status: 'ACTIVE' }, select: { id: true } })
  const sub = await prisma.client.create({ data: { name: `${P}Sub`, parentId: brand.id, profileId: prof.id, status: 'ACTIVE' }, select: { id: true } })
  const outsider = await prisma.client.create({ data: { name: `${P}Outsider`, profileId: prof.id, status: 'ACTIVE' }, select: { id: true } })
  ids.brand = brand.id
  ids.sub = sub.id
  ids.outsider = outsider.id

  await prisma.clientShareLink.create({
    data: { tokenHash: auth.hashShareToken(TOKEN), clientId: brand.id, profileId: prof.id, createdById: ids.owner },
  })
}

const validSubmit = (over: Record<string, any> = {}) => ({
  workspaceId: ids.wsActive, clientId: ids.brand, title: `${P}Project`, rawFootage: 'https://drive.example.com/raw', ...over,
})

async function testScope() {
  section('1. Scope resolution + submit options')
  rl.__clearRateLimitStore()
  const scope = await auth.resolveShareToken(TOKEN)
  check('token resolves to scope', !!scope && scope.profileId === ids.profileId)
  check('scope includes canonical + sub brand', !!scope && scope.clientIds.includes(ids.brand) && scope.clientIds.includes(ids.sub))
  check('scope EXCLUDES the unrelated (outsider) brand', !!scope && !scope.clientIds.includes(ids.outsider), `clientIds=${scope?.clientIds}`)

  const opts = await sp.getSubmitOptionsViaToken(TOKEN)
  check('submit options: only ACTIVE workspace listed', !!opts && opts.workspaces.some((w: any) => w.id === ids.wsActive) && !opts.workspaces.some((w: any) => w.id === ids.wsArchived))
  check('submit options: canonical brand listed first', !!opts && opts.brands[0]?.id === ids.brand)
}

async function testSubmitFunctional() {
  section('2. Submit (functional + scope-forced tenancy + notify + audit)')
  rl.__clearRateLimitStore()
  const auditBefore = await prisma.auditLog.count({ where: { action: 'request.client_submitted' } })

  const res = await sp.submitClientRequestViaToken(TOKEN, validSubmit({ desiredType: 'Trial', notes: 'please make it punchy' }))
  check('valid submit succeeds', res?.success === true, res?.error)
  if (res?.success) {
    const req = await prisma.clientTaskRequest.findUnique({ where: { id: res.requestId } })
    check('request tenancy forced from scope (profileId)', req?.profileId === ids.profileId)
    check('request workspaceId honored', req?.workspaceId === ids.wsActive)
    check('request status = NEW', req?.status === 'NEW')
    check('request viaShareLinkId provenance set', !!req?.viaShareLinkId)
    check('request carries NO finance field (schema)', !('jobPriceUSD' in (req || {})) && !('wageVND' in (req || {})))

    // notify fan-out → OWNER + ADMIN only (never USER)
    const nOwner = await prisma.notification.count({ where: { userId: ids.owner, type: 'TASK_CLIENT_SUBMITTED' } })
    const nAdmin = await prisma.notification.count({ where: { userId: ids.admin, type: 'TASK_CLIENT_SUBMITTED' } })
    const nUser = await prisma.notification.count({ where: { userId: ids.user, type: 'TASK_CLIENT_SUBMITTED' } })
    check('notify: OWNER received TASK_CLIENT_SUBMITTED', nOwner >= 1)
    check('notify: ADMIN received TASK_CLIENT_SUBMITTED', nAdmin >= 1)
    check('notify: plain USER received NOTHING', nUser === 0, `got ${nUser}`)

    const auditAfter = await prisma.auditLog.count({ where: { action: 'request.client_submitted' } })
    check('audit row written for submit', auditAfter === auditBefore + 1)
    const arow = await prisma.auditLog.findFirst({ where: { action: 'request.client_submitted', targetId: res.requestId } })
    check('audit actorUserId = null (token-driven)', arow ? arow.actorUserId === null : false)
  }
}

async function testSubClient() {
  section('3. Sub-brand creation via token + auto-scope')
  rl.__clearRateLimitStore()
  const res = await sp.createSubClientViaToken(TOKEN, { name: `${P}NewSub`, parentId: ids.brand })
  check('createSubClient succeeds', res?.success === true, res?.error)
  if (res?.success) {
    rl.__clearRateLimitStore()
    const scope = await auth.resolveShareToken(TOKEN)
    check('new sub-brand auto-enters scope', !!scope && scope.clientIds.includes(res.clientId))
  }
}

async function testAcceptMapping() {
  section('4. Accept → Task field-mapping (DB-layer replay; live action = manual)')
  // Replicate acceptClientRequest's pipe encoding to lock the mapping contract.
  const req = { rawFootage: 'https://r', bRoll: 'https://b', submitFolder: 'https://s', refs: 'https://ref', script: 'https://sc', notes: 'note', videoList: 'v1\nv2' }
  const resources = [req.rawFootage ? `RAW: ${req.rawFootage}` : '', req.bRoll ? `BROLL: ${req.bRoll}` : '', req.submitFolder ? `SUBMISSION: ${req.submitFolder}` : ''].filter(Boolean).join(' | ')
  const references = [req.refs ? `REF: ${req.refs}` : '', req.script ? `SCRIPT: ${req.script}` : ''].filter(Boolean).join(' | ')
  check('resources encode RAW|BROLL|SUBMISSION', resources === 'RAW: https://r | BROLL: https://b | SUBMISSION: https://s')
  check('references encode REF|SCRIPT', references === 'REF: https://ref | SCRIPT: https://sc')
}

async function testSecurity() {
  section('5. Security — token / scope-injection / sanitize / links')
  // token format + lifecycle
  check('malformed token → null', (await auth.resolveShareToken('abc')) === null)
  rl.__clearRateLimitStore()
  check('unknown well-formed token → null', (await auth.resolveShareToken('unknown_token_00000000000000000000')) === null)
  // revoked
  await prisma.clientShareLink.updateMany({ where: { profileId: ids.profileId }, data: { revokedAt: new Date() } })
  rl.__clearRateLimitStore()
  check('revoked token → null', (await auth.resolveShareToken(TOKEN)) === null)
  await prisma.clientShareLink.updateMany({ where: { profileId: ids.profileId }, data: { revokedAt: null } })
  // expired
  await prisma.clientShareLink.updateMany({ where: { profileId: ids.profileId }, data: { expiresAt: new Date(Date.now() - 1000) } })
  rl.__clearRateLimitStore()
  check('expired token → null', (await auth.resolveShareToken(TOKEN)) === null)
  await prisma.clientShareLink.updateMany({ where: { profileId: ids.profileId }, data: { expiresAt: null } })

  // scope-injection
  rl.__clearRateLimitStore()
  const archived = await sp.submitClientRequestViaToken(TOKEN, validSubmit({ workspaceId: ids.wsArchived }))
  check('submit into ARCHIVED workspace rejected', archived?.success === false && /no longer active/i.test(archived.error || ''), archived?.error)
  const badWs = await sp.submitClientRequestViaToken(TOKEN, validSubmit({ workspaceId: 'ws-not-in-scope' }))
  check('submit with out-of-scope workspaceId rejected', badWs?.success === false && /invalid period/i.test(badWs.error || ''), badWs?.error)
  const badClient = await sp.submitClientRequestViaToken(TOKEN, validSubmit({ clientId: ids.outsider }))
  check('submit with out-of-scope clientId rejected', badClient?.success === false && /invalid brand/i.test(badClient.error || ''), badClient?.error)

  // XSS sanitize (stored as plain text, no tags)
  rl.__clearRateLimitStore()
  const xss = await sp.submitClientRequestViaToken(TOKEN, validSubmit({ title: '<script>alert(1)</script>Hi', notes: '<b>bold</b> & <img src=x onerror=y>' }))
  check('XSS submit succeeds (sanitized)', xss?.success === true, xss?.error)
  if (xss?.success) {
    const req = await prisma.clientTaskRequest.findUnique({ where: { id: xss.requestId }, select: { title: true, notes: true } })
    check('title has no angle brackets after sanitize', !!req && !req.title.includes('<') && !req.title.includes('>'), req?.title)
    check('notes has no angle brackets after sanitize', !!req && !(req.notes || '').includes('<'), req?.notes || '')
  }

  // link injection
  rl.__clearRateLimitStore()
  const js = await sp.submitClientRequestViaToken(TOKEN, validSubmit({ rawFootage: 'javascript:alert(1)' }))
  check('javascript: raw link rejected', js?.success === false && /raw footage link is invalid/i.test(js.error || ''), js?.error)
  const notUrl = await sp.submitClientRequestViaToken(TOKEN, validSubmit({ rawFootage: 'just some text' }))
  check('non-URL raw link rejected', notUrl?.success === false, notUrl?.error)
  const badBroll = await sp.submitClientRequestViaToken(TOKEN, validSubmit({ bRoll: 'ftp://x/y' }))
  check('non-http optional link (b-roll) rejected', badBroll?.success === false && /b-roll link is invalid/i.test(badBroll.error || ''), badBroll?.error)
}

async function testRateLimitAndCap() {
  section('6. Rate limits + sub-brand cap')
  // 6a. limiter primitive the submit action uses (20/hr).
  rl.__clearRateLimitStore()
  let ok = 0, blocked = 0
  for (let i = 0; i < 21; i++) { const r = await rl.rateLimit('client-submit-request:probe', 20, 3600_000); r.success ? ok++ : blocked++ }
  check('submit limiter: 20 allowed, 21st blocked', ok === 20 && blocked === 1, `ok=${ok} blocked=${blocked}`)

  // 6b. REAL action over its own rate limit: createSubClient is 10/hr (no email fan-out).
  rl.__clearRateLimitStore()
  let created = 0, rlBlocked = 0
  for (let i = 0; i < 11; i++) {
    const r = await sp.createSubClientViaToken(TOKEN, { name: `${P}rl${i}`, parentId: ids.brand })
    if (r?.success) created++
    else if (/too many/i.test(r?.error || '')) rlBlocked++
  }
  check('createSubClient rate-limited after 10/hr', created === 10 && rlBlocked === 1, `created=${created} blocked=${rlBlocked}`)

  // 6c. Sub-brand CAP (20) — seed a fresh parent with 19 subs, then 20th ok / 21st capped.
  const capParent = await prisma.client.create({ data: { name: `${P}CapParent`, parentId: ids.brand, profileId: ids.profileId, status: 'ACTIVE' }, select: { id: true } })
  for (let i = 0; i < 19; i++) await prisma.client.create({ data: { name: `${P}cap${i}`, parentId: capParent.id, profileId: ids.profileId, status: 'ACTIVE' } })
  rl.__clearRateLimitStore()
  const c20 = await sp.createSubClientViaToken(TOKEN, { name: `${P}cap19`, parentId: capParent.id })
  rl.__clearRateLimitStore()
  const c21 = await sp.createSubClientViaToken(TOKEN, { name: `${P}cap20`, parentId: capParent.id })
  check('20th sub under a parent succeeds', c20?.success === true, c20?.error)
  check('21st sub hits the cap', c21?.success === false && /maximum number of sub-brands/i.test(c21?.error || ''), c21?.error)
}

async function testValidationEdge() {
  section('7. Validation + edge cases')
  rl.__clearRateLimitStore()
  const empty = await sp.submitClientRequestViaToken(TOKEN, validSubmit({ title: '   ' }))
  check('empty title rejected', empty?.success === false && /project \/ video name/i.test(empty.error || ''), empty?.error)

  rl.__clearRateLimitStore()
  const badType = await sp.submitClientRequestViaToken(TOKEN, validSubmit({ desiredType: 'Quantum form' }))
  check('unknown desiredType stored as null', badType?.success === true)
  if (badType?.success) {
    const req = await prisma.clientTaskRequest.findUnique({ where: { id: badType.requestId }, select: { desiredType: true } })
    check('desiredType normalized to null', req?.desiredType === null, String(req?.desiredType))
  }

  rl.__clearRateLimitStore()
  const badDate = await sp.submitClientRequestViaToken(TOKEN, validSubmit({ desiredDeadline: 'not-a-date' }))
  check('invalid desiredDeadline → null (no crash)', badDate?.success === true)
  if (badDate?.success) {
    const req = await prisma.clientTaskRequest.findUnique({ where: { id: badDate.requestId }, select: { desiredDeadline: true } })
    check('desiredDeadline normalized to null', req?.desiredDeadline === null)
  }

  // client hard-delete → request.clientId SetNull (request survives)
  rl.__clearRateLimitStore()
  const delSub = await prisma.client.create({ data: { name: `${P}DelSub`, parentId: ids.brand, profileId: ids.profileId, status: 'ACTIVE' }, select: { id: true } })
  const submitForDel = await sp.submitClientRequestViaToken(TOKEN, validSubmit({ clientId: delSub.id }))
  if (submitForDel?.success) {
    await prisma.client.delete({ where: { id: delSub.id } })
    const req = await prisma.clientTaskRequest.findUnique({ where: { id: submitForDel.requestId }, select: { id: true, clientId: true } })
    check('client hard-delete → request survives with clientId=null', !!req && req.clientId === null, `clientId=${req?.clientId}`)
  } else {
    check('client hard-delete → request survives with clientId=null', false, 'setup submit failed: ' + submitForDel?.error)
  }
}

async function main() {
  await init()
  await cleanup()
  console.log('=== Track B · Client Task Submission v2 (TEST branch) ===')
  try {
    await seed()
    await testScope()
    await testSubmitFunctional()
    await testSubClient()
    await testAcceptMapping()
    await testSecurity()
    await testRateLimitAndCap()
    await testValidationEdge()
  } catch (e) {
    console.error('\n💥 Harness crashed:', e)
    failCount++
  }
  console.log(`\n=== Track B RESULT: ${passCount} passed, ${failCount} failed ===`)
  if (failCount) { console.log('\nFAILURES:'); failures.forEach((f) => console.log('  - ' + f)) }
}

main()
  .catch((e) => { console.error('fatal', e); failCount++ })
  .finally(async () => { if (prisma) { await cleanup(); await prisma.$disconnect() } process.exit(failCount > 0 ? 1 : 0) })
