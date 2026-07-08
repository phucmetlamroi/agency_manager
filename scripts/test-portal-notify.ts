/**
 * [review-fixes Phase C / Phase D verify] Portal notify-email harness — the OTP + token-scope +
 * client-isolation gate for the client Settings feature (feat 6bcf094).
 *
 * Exercises the REAL token actions (getPortalNotifyEmail / requestPortalNotifyEmail /
 * verifyPortalNotifyEmail / removePortalNotifyEmail / unsubscribePortalNotify) — they are
 * SESSION-FREE (resolveShareToken + getRequestIp both try/catch headers() → safe outside a
 * request), so a tsx script drives the exact code the /share Settings panel calls. It also
 * replicates the guest-notify audience-2 fan-out query to prove tenant isolation.
 *
 * SAFETY: runs ONLY against the Neon `test` branch (.env.test host must contain "frosty-forest");
 * HARD-EXITS if DATABASE_URL looks like prod ("autumn-flower"). Fixtures carry the "__pn__" prefix
 * and are deleted before + after the run.
 *
 * Usage:  npx tsx scripts/test-portal-notify.ts
 */

import fs from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'

/* ── 0) Load .env.test + HARD-GUARD the test branch (mirror test-folder-scope-db) ────────── */

function loadEnvTest() {
  const p = path.join(process.cwd(), '.env.test')
  if (!fs.existsSync(p)) {
    console.error('❌ .env.test not found — refusing to run (will NOT fall back to prod .env).')
    process.exit(1)
  }
  const txt = fs.readFileSync(p, 'utf8')
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}
loadEnvTest()

const DB = process.env.DATABASE_URL || ''
if (!DB.includes('frosty-forest') || DB.includes('autumn-flower')) {
  console.error('❌ SAFETY ABORT: DATABASE_URL is not the Neon test branch (need "frosty-forest", not "autumn-flower").')
  console.error(`   got: ${DB.replace(/:[^:@/]+@/, ':***@').slice(0, 90)}...`)
  process.exit(1)
}

/* ── dynamic imports AFTER env is set ───────────────────────────────────────────────────── */

let prisma: any
let actions: typeof import('../src/actions/share-portal-actions')
let otp: typeof import('../src/lib/otp')
let auth: typeof import('../src/lib/share-link-auth')
let guestNotify: typeof import('../src/lib/review/guest-notify')
let ratelimit: typeof import('../src/lib/rate-limit')

async function init() {
  ;({ prisma } = await import('../src/lib/db'))
  actions = await import('../src/actions/share-portal-actions')
  otp = await import('../src/lib/otp')
  auth = await import('../src/lib/share-link-auth')
  guestNotify = await import('../src/lib/review/guest-notify')
  ratelimit = await import('../src/lib/rate-limit')
}

/* ── tiny runner ────────────────────────────────────────────────────────────────────────── */

let passCount = 0
let failCount = 0
function check(name: string, pass: boolean, detail = '') {
  if (pass) { passCount++; console.log(`  ✅ ${name}`) }
  else { failCount++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`) }
}
function section(t: string) { console.log(`\n━━ ${t} ━━`) }

const P = '__pn__'
const mintToken = () => randomBytes(32).toString('base64url') // matches TOKEN_RX

async function cleanup() {
  const profs = await prisma.profile.findMany({ where: { name: { startsWith: P } }, select: { id: true } })
  const profIds = profs.map((x: { id: string }) => x.id)
  if (profIds.length) {
    await prisma.clientShareLink.deleteMany({ where: { profileId: { in: profIds } } })
    await prisma.client.deleteMany({ where: { profileId: { in: profIds } } })
    await prisma.profileAccess.deleteMany({ where: { profileId: { in: profIds } } }).catch(() => {})
  }
  await prisma.user.deleteMany({ where: { username: { startsWith: P } } })
  await prisma.profile.deleteMany({ where: { name: { startsWith: P } } })
}

/* fixtures created in seed() */
const F: any = {}

async function seed() {
  const prof = await prisma.profile.create({ data: { name: `${P}P` }, select: { id: true } })
  F.profId = prof.id
  const u = await prisma.user.create({
    data: { username: `${P}u`, email: `${P}u@test.local`, role: 'USER', password: 'x', displayName: `${P}u` },
    select: { id: true },
  })
  F.userId = u.id

  const clientA = await prisma.client.create({ data: { name: `${P}ClientA`, profileId: prof.id, status: 'ACTIVE' }, select: { id: true } })
  const clientB = await prisma.client.create({ data: { name: `${P}ClientB`, profileId: prof.id, status: 'ACTIVE' }, select: { id: true } })
  F.clientA = clientA.id
  F.clientB = clientB.id

  async function mkLink(clientId: number, extra: Record<string, unknown> = {}) {
    const raw = mintToken()
    const link = await prisma.clientShareLink.create({
      data: { tokenHash: auth.hashShareToken(raw), clientId, profileId: prof.id, createdById: F.userId, ...extra },
      select: { id: true },
    })
    return { raw, id: link.id }
  }
  F.LA = await mkLink(F.clientA) // clientA, live
  F.LB = await mkLink(F.clientB) // clientB, live (isolation)
  F.LR = await mkLink(F.clientA, { revokedAt: new Date() }) // revoked
  F.LE = await mkLink(F.clientA, { expiresAt: new Date(Date.now() - 60_000) }) // expired
  F.LRL = await mkLink(F.clientA) // dedicated for rate-limit
}

/* ── tests ─────────────────────────────────────────────────────────────────────────────── */

async function run() {
  section('1. Token scope — invalid / revoked / expired tokens cannot read or manage')
  check('empty token → null', (await actions.getPortalNotifyEmail('')) === null)
  check('malformed token → null', (await actions.getPortalNotifyEmail('bad!!token')) === null)
  check('well-formed but unknown token → null', (await actions.getPortalNotifyEmail(mintToken())) === null)
  check('revoked link → getPortalNotifyEmail null', (await actions.getPortalNotifyEmail(F.LR.raw)) === null)
  check('expired link → getPortalNotifyEmail null', (await actions.getPortalNotifyEmail(F.LE.raw)) === null)
  const rq = await actions.requestPortalNotifyEmail(F.LR.raw, 'x@example.com')
  check('revoked link → requestPortalNotifyEmail refused', rq.success === false, JSON.stringify(rq))

  section('2. request → stores PENDING + hashed code + expiry, does NOT verify yet')
  const st0 = await actions.getPortalNotifyEmail(F.LA.raw)
  check('initial state: no email, not verified, no pending', !!st0 && st0.email === null && st0.verified === false && st0.pending === null, JSON.stringify(st0))
  const rReq = await actions.requestPortalNotifyEmail(F.LA.raw, 'User@Example.com')
  check('request valid email → success', rReq.success === true, JSON.stringify(rReq))
  const row1 = await prisma.clientShareLink.findUnique({ where: { id: F.LA.id }, select: { notifyEmail: true, notifyEmailVerifiedAt: true, notifyEmailPending: true, notifyEmailCodeHash: true, notifyEmailCodeExpiresAt: true } })
  check('pending = lowercased email', row1.notifyEmailPending === 'user@example.com', row1.notifyEmailPending)
  check('code hash stored (never plain, non-null)', typeof row1.notifyEmailCodeHash === 'string' && row1.notifyEmailCodeHash.length === 64, String(row1.notifyEmailCodeHash))
  check('code expiry ~15min future', !!row1.notifyEmailCodeExpiresAt && row1.notifyEmailCodeExpiresAt.getTime() > Date.now() + 13 * 60_000 && row1.notifyEmailCodeExpiresAt.getTime() < Date.now() + 16 * 60_000)
  check('notifyEmail still null before verify', row1.notifyEmail === null && row1.notifyEmailVerifiedAt === null)
  const rBad = await actions.requestPortalNotifyEmail(F.LA.raw, 'not-an-email')
  check('request invalid email → refused', rBad.success === false)

  section('3. verify — wrong code fails; correct code promotes pending → verified')
  // Seed a KNOWN code hash (the real one is random) to drive verify deterministically.
  await prisma.clientShareLink.update({ where: { id: F.LA.id }, data: { notifyEmailPending: 'user@example.com', notifyEmailCodeHash: otp.hashOtp('654321'), notifyEmailCodeExpiresAt: new Date(Date.now() + 10 * 60_000), notifyEmail: null, notifyEmailVerifiedAt: null, notifyEmailUnsubToken: null } })
  const vWrong = await actions.verifyPortalNotifyEmail(F.LA.raw, '000000')
  check('wrong code → refused', vWrong.success === false, JSON.stringify(vWrong))
  const rowStillPending = await prisma.clientShareLink.findUnique({ where: { id: F.LA.id }, select: { notifyEmail: true, notifyEmailPending: true } })
  check('wrong code did NOT promote', rowStillPending.notifyEmail === null && rowStillPending.notifyEmailPending === 'user@example.com')
  const vOk = await actions.verifyPortalNotifyEmail(F.LA.raw, '654321')
  check('correct code → success', vOk.success === true, JSON.stringify(vOk))
  const row2 = await prisma.clientShareLink.findUnique({ where: { id: F.LA.id }, select: { notifyEmail: true, notifyEmailVerifiedAt: true, notifyEmailPending: true, notifyEmailCodeHash: true, notifyEmailUnsubToken: true } })
  check('verified: email promoted + verifiedAt set', row2.notifyEmail === 'user@example.com' && !!row2.notifyEmailVerifiedAt)
  check('verified: pending + code cleared (single-use)', row2.notifyEmailPending === null && row2.notifyEmailCodeHash === null)
  check('verified: unsub token generated (≥40 hex)', typeof row2.notifyEmailUnsubToken === 'string' && row2.notifyEmailUnsubToken.length >= 40)
  const st1 = await actions.getPortalNotifyEmail(F.LA.raw)
  check('getPortalNotifyEmail reports verified', !!st1 && st1.email === 'user@example.com' && st1.verified === true && st1.pending === null)

  section('4. verify — expired code is rejected')
  await prisma.clientShareLink.update({ where: { id: F.LA.id }, data: { notifyEmailPending: 'x@example.com', notifyEmailCodeHash: otp.hashOtp('111111'), notifyEmailCodeExpiresAt: new Date(Date.now() - 60_000), notifyEmail: null, notifyEmailVerifiedAt: null } })
  const vExp = await actions.verifyPortalNotifyEmail(F.LA.raw, '111111')
  check('expired code → refused', vExp.success === false && /expire/i.test(vExp.error || ''), JSON.stringify(vExp))

  section('5. remove — clears every notify field')
  await prisma.clientShareLink.update({ where: { id: F.LA.id }, data: { notifyEmail: 'keep@example.com', notifyEmailVerifiedAt: new Date(), notifyEmailUnsubToken: otp.generateRandomToken(), notifyEmailPending: null, notifyEmailCodeHash: null } })
  const rRem = await actions.removePortalNotifyEmail(F.LA.raw)
  check('remove → success', rRem.success === true)
  const row3 = await prisma.clientShareLink.findUnique({ where: { id: F.LA.id }, select: { notifyEmail: true, notifyEmailVerifiedAt: true, notifyEmailUnsubToken: true } })
  check('remove cleared email + verifiedAt + unsubToken', row3.notifyEmail === null && row3.notifyEmailVerifiedAt === null && row3.notifyEmailUnsubToken === null)

  section('6. unsubscribe — auth is the unsub token, not the share token')
  const unsub = otp.generateRandomToken()
  await prisma.clientShareLink.update({ where: { id: F.LA.id }, data: { notifyEmail: 'sub@example.com', notifyEmailVerifiedAt: new Date(), notifyEmailUnsubToken: unsub } })
  check('short/garbage unsub token → no-op', (await actions.unsubscribePortalNotify('short')).success === false)
  check('valid-format but unknown unsub token → no-op', (await actions.unsubscribePortalNotify(mintToken() + mintToken())).success === false)
  const rUn = await actions.unsubscribePortalNotify(unsub)
  check('correct unsub token → success', rUn.success === true)
  const row4 = await prisma.clientShareLink.findUnique({ where: { id: F.LA.id }, select: { notifyEmail: true, notifyEmailUnsubToken: true } })
  check('unsubscribe cleared the email', row4.notifyEmail === null && row4.notifyEmailUnsubToken === null)

  section('7. rate-limit — request is capped (5/hr per link+ip)')
  let okCount = 0
  let limited = false
  for (let i = 0; i < 6; i++) {
    const r = await actions.requestPortalNotifyEmail(F.LRL.raw, `rl${i}@example.com`)
    if (r.success) okCount++
    else if (/too many/i.test(r.error || '')) limited = true
  }
  check('first 5 requests allowed', okCount === 5, `okCount=${okCount}`)
  check('6th request rate-limited', limited === true)

  section('8. name-path fan-out — reaches sub-brands + duplicate rows, never another client')
  // selectPortalNotifyLinks resolves recipients by the SAME name-path scope resolveShareToken
  // grants (fixes the High bug: exact-clientId match missed sub-brand + duplicate-row tasks).
  const clientsFix = [
    { id: 100, name: 'Jacob', parentId: null }, // parent brand — the link seed
    { id: 105, name: 'UnitA', parentId: 100 }, // sub-brand under Jacob
    { id: 137, name: 'Jacob', parentId: null }, // unmerged DUPLICATE root row (same name-path)
    { id: 200, name: 'Acme', parentId: null }, // an unrelated client
  ]
  const linksFix = [
    { clientId: 100, notifyEmail: 'jacob@x.com', notifyEmailUnsubToken: 't1', client: { status: 'ACTIVE', mergedIntoId: null } },
    { clientId: 200, notifyEmail: 'acme@x.com', notifyEmailUnsubToken: 't2', client: { status: 'ACTIVE', mergedIntoId: null } },
  ]
  const emailsFor = (assetClientId: number) => guestNotify.selectPortalNotifyLinks(assetClientId, clientsFix, linksFix).map((r) => r.notifyEmail).sort()
  check('parent task → parent verified email', JSON.stringify(emailsFor(100)) === JSON.stringify(['jacob@x.com']))
  check('SUB-BRAND task → still reaches the parent email (was the bug)', JSON.stringify(emailsFor(105)) === JSON.stringify(['jacob@x.com']), JSON.stringify(emailsFor(105)))
  check('DUPLICATE-row task → still reaches the parent email (was the bug)', JSON.stringify(emailsFor(137)) === JSON.stringify(['jacob@x.com']), JSON.stringify(emailsFor(137)))
  check('unrelated client task → only its own email', JSON.stringify(emailsFor(200)) === JSON.stringify(['acme@x.com']))
  check('Jacob email NEVER leaks to an Acme task (isolation held)', !emailsFor(200).includes('jacob@x.com'))
  const mergedLinks = [{ clientId: 999, notifyEmail: 'm@x.com', notifyEmailUnsubToken: 't3', client: { status: 'MERGED', mergedIntoId: 100 } }]
  check('MERGED link seed → follows mergedIntoId to the survivor subtree', JSON.stringify(guestNotify.selectPortalNotifyLinks(105, clientsFix, mergedLinks).map((r) => r.notifyEmail)) === JSON.stringify(['m@x.com']))

  section('9. clientId parse — stringified Int round-trips; non-numeric slug is skipped')
  const parsed = Number.parseInt(String(F.clientA), 10)
  check('String(Int) → parseInt round-trips + finite', parsed === F.clientA && Number.isFinite(parsed))
  check('non-numeric slug clientId → NOT finite (skipped, no cross-client leak)', !Number.isFinite(Number.parseInt('acme-brand-slug', 10)))

  section('10. OTP brute-force cap — verify is rate-limited per link+ip')
  ratelimit.__clearRateLimitStore() // reset the shared per-ip resolve limiter so the loop trips the VERIFY cap, not it
  await prisma.clientShareLink.update({ where: { id: F.LRL.id }, data: { notifyEmailPending: 'bf@example.com', notifyEmailCodeHash: otp.hashOtp('999999'), notifyEmailCodeExpiresAt: new Date(Date.now() + 10 * 60_000), notifyEmail: null, notifyEmailVerifiedAt: null } })
  let attempts = 0
  let capped = false
  for (let i = 0; i < 13; i++) {
    const r = await actions.verifyPortalNotifyEmail(F.LRL.raw, '000000')
    if (/too many/i.test(r.error || '')) { capped = true; break }
    attempts++
  }
  check('verify blocked after 10 attempts', capped && attempts === 10, `attempts=${attempts} capped=${capped}`)
}

/* ── main ──────────────────────────────────────────────────────────────────────────────── */

;(async () => {
  await init()
  console.log(`\n▶ portal-notify harness on ${DB.replace(/:[^:@/]+@/, ':***@').match(/@([^/]+)/)?.[1] || '?'}`)
  await cleanup()
  try {
    await seed()
    await run()
  } catch (e) {
    console.error('\n💥 harness threw:', e)
    failCount++
  } finally {
    await cleanup()
    await prisma.$disconnect().catch(() => {})
  }
  console.log(`\nRESULT: ${passCount} passed, ${failCount} failed`)
  process.exit(failCount > 0 ? 1 : 0)
})()
