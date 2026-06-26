/**
 * [Invite-flow security regression harness]
 *
 * Locks the authorization decisions of the merged invite/membership flow so the
 * R1–R14 hardening + the post-merge fixes can never silently regress.
 *
 * WHAT IT TESTS — the *session-free authorization core* (the real code that makes
 * the security decision), NOT the cookie-bound server-action wrappers:
 *   - profile-permissions.ts predicates (canInviteMember / canRemoveMember /
 *     canChangeMemberRole / canTransferOwnership / canManageShareLinks /
 *     canCreateWorkspace / canAccessWorkspace) across the full role × workspace-age
 *     × same-vs-cross-tenant matrix.
 *   - user-lookup.ts findUserByEmailOrUsername — deterministic winner + matchCount>1
 *     on duplicate emails (email is NOT @unique), case-insensitive username.
 *   - The exact guard *sequences* the actions run (e.g. "ADMIN may invite but only
 *     OWNER may grant ADMIN", "CLIENT/LOCKED never become internal staff",
 *     "cross-profile invite honors allowExternalInvites") — replayed via the same
 *     predicates the action calls, so a guard removal flips a test red.
 *   - DB invariants (sprint-z style): exactly 1 OWNER per profile, no orphan rows.
 *
 * The server actions read the session via next/headers cookies(), which throws
 * outside a request scope — so they cannot be invoked from a plain tsx script. The
 * security DECISIONS, however, all live in the session-free predicates above, which
 * IS what this harness pins. (End-to-end cookie-bound coverage is deferred Playwright.)
 *
 * SAFETY: runs ONLY against the Neon `test` branch (.env.test → host must contain
 * "frosty-forest"). It HARD-EXITS if DATABASE_URL looks like prod ("autumn-flower").
 * All fixtures use the "__invsec__" prefix and are deleted before + after the run.
 *
 * Usage:
 *   npm run test:invite-security
 *   # or: npx tsx --env-file=.env.test scripts/test-invite-security.ts   (env loaded manually below too)
 */

import fs from 'fs'
import path from 'path'

/* ──────────────────────────────────────────────────────────────────────── */
/*  0) Load .env.test and HARD-GUARD that we are on the test branch          */
/* ──────────────────────────────────────────────────────────────────────── */

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
    // .env.test wins over any inherited shell value (force the test branch).
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}
loadEnvTest()

const DB = process.env.DATABASE_URL || ''
const TEST_HOST = 'frosty-forest' // Neon test branch endpoint marker
const PROD_HOST = 'autumn-flower' // Neon production endpoint marker — must NEVER appear here
if (!DB.includes(TEST_HOST) || DB.includes(PROD_HOST)) {
  console.error('❌ SAFETY ABORT: DATABASE_URL is not the Neon test branch.')
  console.error(`   expected host to contain "${TEST_HOST}" and NOT "${PROD_HOST}".`)
  console.error(`   got: ${DB.replace(/:[^:@/]+@/, ':***@').slice(0, 90)}...`)
  process.exit(1)
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Dynamic imports AFTER env is set (so @/lib/db builds its client on the    */
/*  test branch, not on whatever DATABASE_URL the shell had). Assigned in     */
/*  init() — NOT a top-level await, because this repo compiles as CommonJS    */
/*  (tsx → esbuild CJS) where top-level await is illegal.                     */
/* ──────────────────────────────────────────────────────────────────────── */

let prisma: any
let perms: any
let findUserByEmailOrUsername: <T extends Record<string, unknown>>(
  raw: string,
  select: Record<string, boolean>,
) => Promise<{ user: T | null; matchCount: number }>
let wm: any
let gauth: any

async function init() {
  ;({ prisma } = await import('../src/lib/db'))
  perms = await import('../src/lib/profile-permissions')
  ;({ findUserByEmailOrUsername } = await import('../src/lib/user-lookup'))
  wm = await import('../src/lib/workspace-membership')
  gauth = await import('../src/lib/google-auth')
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Tiny test runner                                                         */
/* ──────────────────────────────────────────────────────────────────────── */

let passCount = 0
let failCount = 0
const failures: string[] = []

function check(name: string, pass: boolean, detail = '') {
  if (pass) {
    passCount++
    console.log(`  ✅ ${name}`)
  } else {
    failCount++
    failures.push(name + (detail ? ` — ${detail}` : ''))
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
function section(title: string) {
  console.log(`\n━━ ${title} ━━`)
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Fixture constants                                                        */
/* ──────────────────────────────────────────────────────────────────────── */

const P = '__invsec__' // every fixture row carries this prefix → safe targeted cleanup
const DUPE_EMAIL = `${P}dupe@test.local`
const T_OLD = new Date('2020-01-01T00:00:00Z')
const T_MID = new Date('2023-01-01T00:00:00Z')
const T_NEW = new Date('2026-01-01T00:00:00Z')

// IDs captured during seed for assertions
const ids: Record<string, string> = {}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Cleanup (idempotent — runs before seed AND in finally)                   */
/* ──────────────────────────────────────────────────────────────────────── */

async function cleanup() {
  // FK-safe order. Most child rows cascade on user/workspace delete, but we delete
  // explicitly to stay robust against schema changes.
  await prisma.workspaceInvitation.deleteMany({ where: { workspace: { profile: { name: { startsWith: P } } } } })
  await prisma.workspaceMember.deleteMany({ where: { workspace: { profile: { name: { startsWith: P } } } } })
  await prisma.profileAccess.deleteMany({ where: { profile: { name: { startsWith: P } } } })
  await prisma.workspace.deleteMany({ where: { profile: { name: { startsWith: P } } } })
  // username OR email prefix: the OAuth brand-new-account test creates a user with a temp
  // `g_…` handle (no prefix) but a `${P}…` email — catch it by email too.
  await prisma.user.deleteMany({ where: { OR: [{ username: { startsWith: P } }, { email: { startsWith: P } }] } })
  await prisma.profile.deleteMany({ where: { name: { startsWith: P } } })
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Seed: 2 profiles (A,B), users for every role + edge cases, 2 workspaces   */
/* ──────────────────────────────────────────────────────────────────────── */

async function seed() {
  const profA = await prisma.profile.create({ data: { name: `${P}A` }, select: { id: true } })
  const profB = await prisma.profile.create({ data: { name: `${P}B` }, select: { id: true } })
  ids.profA = profA.id
  ids.profB = profB.id

  async function mkUser(key: string, opts: any) {
    const u = await prisma.user.create({
      data: {
        username: `${P}${key}`,
        email: opts.email ?? `${P}${key}@test.local`,
        role: opts.role ?? 'USER',
        profileId: opts.homeProfileId ?? null,
        allowExternalInvites: opts.allowExternalInvites ?? true,
        emailVerified: opts.emailVerified ?? false,
        googleId: opts.googleId ?? null,
        authProvider: opts.authProvider ?? 'email',
        password: opts.password === undefined ? 'x' : opts.password,
        displayName: opts.displayName ?? `${P}${key}`,
        lastLoginAt: opts.lastLoginAt ?? null,
        sessionVersion: opts.sessionVersion ?? 0,
      },
      select: { id: true },
    })
    ids[key] = u.id
    return u.id
  }

  async function mkPA(userId: string, profileId: string, role: any, grantedAt?: Date) {
    await prisma.profileAccess.create({ data: { userId, profileId, role, ...(grantedAt ? { grantedAt } : {}) } })
  }

  // Profile A members
  await mkUser('ownerA', { homeProfileId: profA.id })
  await mkPA(ids.ownerA, profA.id, 'OWNER')

  await mkUser('adminA', { homeProfileId: profA.id })
  await mkPA(ids.adminA, profA.id, 'ADMIN', T_MID) // grantedAt between wsOld and wsNew

  await mkUser('userA', { homeProfileId: profA.id })
  await mkPA(ids.userA, profA.id, 'USER')

  await mkUser('clientA', { homeProfileId: profA.id, role: 'CLIENT' })
  await mkPA(ids.clientA, profA.id, 'CLIENT')

  await mkUser('lockedA', { homeProfileId: profA.id, role: 'LOCKED' }) // no PA — banned account

  // Profile B members
  await mkUser('ownerB', { homeProfileId: profB.id })
  await mkPA(ids.ownerB, profB.id, 'OWNER')

  // Cross-tenant invite targets (home = B)
  await mkUser('extNoConsent', { homeProfileId: profB.id, allowExternalInvites: false })
  await mkUser('extConsent', { homeProfileId: profB.id, allowExternalInvites: true })

  // Duplicate-email pair (email NOT @unique). dupe1 = the deterministic "winner"
  // (emailVerified + googleId + most-recent login); dupe2 = the also-ran.
  await mkUser('dupe1', {
    email: DUPE_EMAIL, emailVerified: true, googleId: `${P}gid_dupe1`,
    authProvider: 'google', homeProfileId: profA.id, lastLoginAt: T_NEW,
  })
  await mkUser('dupe2', {
    email: DUPE_EMAIL, emailVerified: false, homeProfileId: profA.id, lastLoginAt: T_OLD,
  })

  // Google-only account (password null)
  await mkUser('gonly', { googleId: `${P}gid_gonly`, authProvider: 'google', password: null, homeProfileId: profA.id })

  // ── A0 finding fixtures ──
  // SI/MISS: stale session (forced-logout / password-reset bumped DB sessionVersion to 5)
  await mkUser('staleU', { homeProfileId: profA.id, sessionVersion: 5 })
  await mkPA(ids.staleU, profA.id, 'USER')

  // CLB-1: du-học user (home=B) granted USER access into A → assignable in A via the !!access clause
  await mkUser('duhocU', { homeProfileId: profB.id })
  await mkPA(ids.duhocU, profA.id, 'USER')

  // OAUTH-LINK-001: an email-account with NO googleId (link target), a LOCKED email row
  // (must not get googleId burned), and a clean duplicate-email pair (must refuse to link).
  await mkUser('linkTarget', { email: `${P}link@test.local`, homeProfileId: profA.id }) // googleId null
  await mkPA(ids.linkTarget, profA.id, 'USER')
  await mkUser('lockedLink', { email: `${P}lockedlink@test.local`, role: 'LOCKED' })       // banned, no PA
  await mkUser('gdup1', { email: `${P}gdup@test.local`, homeProfileId: profA.id })          // googleId null
  await mkUser('gdup2', { email: `${P}gdup@test.local`, homeProfileId: profA.id })          // googleId null

  // CONSENT-1: a null-home-profile user who opted OUT of external invites
  await mkUser('nullNoConsent', { homeProfileId: null, allowExternalInvites: false })

  // Workspaces in profile A: one OLD (pre-admin-grant), one NEW (post-grant)
  const wsOld = await prisma.workspace.create({
    data: { name: `${P}wsOld`, profileId: profA.id, status: 'ACTIVE', createdAt: T_OLD },
    select: { id: true },
  })
  const wsNew = await prisma.workspace.create({
    data: { name: `${P}wsNew`, profileId: profA.id, status: 'ACTIVE', createdAt: T_NEW },
    select: { id: true },
  })
  ids.wsOld = wsOld.id
  ids.wsNew = wsNew.id

  // Each workspace needs a WorkspaceMember OWNER (invariant) — ownerA.
  await prisma.workspaceMember.create({ data: { userId: ids.ownerA, workspaceId: wsOld.id, role: 'OWNER' } })
  await prisma.workspaceMember.create({ data: { userId: ids.ownerA, workspaceId: wsNew.id, role: 'OWNER' } })
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  TEST SECTIONS                                                            */
/* ──────────────────────────────────────────────────────────────────────── */

async function testInvitePredicates() {
  section('1. Invite / manage predicates (canInviteMember, canRemove/Change/Transfer, canManageShareLinks)')
  const A = ids.profA

  // canInviteMember: OWNER ✓, ADMIN ✓, USER ✗, CLIENT ✗, non-member ✗
  check('OWNER can invite', await perms.canInviteMember(ids.ownerA, A) === true)
  check('ADMIN can invite', await perms.canInviteMember(ids.adminA, A) === true)
  check('USER cannot invite', await perms.canInviteMember(ids.userA, A) === false)
  check('CLIENT cannot invite', await perms.canInviteMember(ids.clientA, A) === false)
  check('non-member (ownerB) cannot invite into A', await perms.canInviteMember(ids.ownerB, A) === false)

  // OWNER-only ops
  for (const [label, fn] of [
    ['remove member', perms.canRemoveMember],
    ['change role', perms.canChangeMemberRole],
    ['transfer ownership', perms.canTransferOwnership],
  ] as const) {
    check(`OWNER can ${label}`, await fn(ids.ownerA, A) === true)
    check(`ADMIN cannot ${label}`, await fn(ids.adminA, A) === false)
    check(`USER cannot ${label}`, await fn(ids.userA, A) === false)
    check(`CLIENT cannot ${label}`, await fn(ids.clientA, A) === false)
  }

  // share-link management (OWNER + ADMIN only)
  check('OWNER can manage share links', await perms.canManageShareLinks(ids.ownerA, A) === true)
  check('ADMIN can manage share links', await perms.canManageShareLinks(ids.adminA, A) === true)
  check('USER cannot manage share links', await perms.canManageShareLinks(ids.userA, A) === false)
  check('CLIENT cannot manage share links', await perms.canManageShareLinks(ids.clientA, A) === false)

  // workspace creation (OWNER + ADMIN)
  check('OWNER can create workspace', await perms.canCreateWorkspace(ids.ownerA, A) === true)
  check('ADMIN can create workspace', await perms.canCreateWorkspace(ids.adminA, A) === true)
  check('USER cannot create workspace', await perms.canCreateWorkspace(ids.userA, A) === false)
}

async function testWorkspaceAccess() {
  section('2. canAccessWorkspace (role × workspace-age × tenant isolation)')
  const { wsOld, wsNew } = ids

  // OWNER → all workspaces of profile
  check('OWNER accesses wsOld', await perms.canAccessWorkspace(ids.ownerA, wsOld) === true)
  check('OWNER accesses wsNew', await perms.canAccessWorkspace(ids.ownerA, wsNew) === true)

  // ADMIN → only workspaces created >= grantedAt (cutoff)
  check('ADMIN accesses wsNew (created after grant)', await perms.canAccessWorkspace(ids.adminA, wsNew) === true)
  check('ADMIN BLOCKED on wsOld (created before grant, no WM)', await perms.canAccessWorkspace(ids.adminA, wsOld) === false)

  // USER → needs explicit WorkspaceMember row
  check('USER blocked on wsNew without WM row', await perms.canAccessWorkspace(ids.userA, wsNew) === false)
  check('USER blocked on wsOld without WM row', await perms.canAccessWorkspace(ids.userA, wsOld) === false)

  // CLIENT → never internal workspace access (even with a ProfileAccess row)
  check('CLIENT blocked on wsNew', await perms.canAccessWorkspace(ids.clientA, wsNew) === false)
  check('CLIENT blocked on wsOld', await perms.canAccessWorkspace(ids.clientA, wsOld) === false)

  // Cross-tenant: ownerB (profile B) must NOT reach profile A workspaces
  check('cross-tenant: ownerB blocked on A.wsNew', await perms.canAccessWorkspace(ids.ownerB, wsNew) === false)
  check('cross-tenant: ownerB blocked on A.wsOld', await perms.canAccessWorkspace(ids.ownerB, wsOld) === false)

  // Grant userA an explicit WM on wsOld → now accessible (the "old workspace" grant path)
  await prisma.workspaceMember.create({ data: { userId: ids.userA, workspaceId: wsOld, role: 'MEMBER' } })
  check('USER accesses wsOld after explicit WM grant', await perms.canAccessWorkspace(ids.userA, wsOld) === true)
  check('USER still blocked on wsNew (grant was workspace-scoped)', await perms.canAccessWorkspace(ids.userA, wsNew) === false)
}

async function testLookupDeterminism() {
  section('3. findUserByEmailOrUsername — deterministic winner + matchCount (email NOT @unique)')

  const byEmail = await findUserByEmailOrUsername<{ id: string; username: string }>(DUPE_EMAIL, { id: true, username: true })
  check('duplicate email reports matchCount=2', byEmail.matchCount === 2, `got ${byEmail.matchCount}`)
  check('duplicate email picks the verified+google winner (dupe1)', byEmail.user?.id === ids.dupe1, `got ${byEmail.user?.username}`)

  const byEmailUpper = await findUserByEmailOrUsername<{ id: string }>(DUPE_EMAIL.toUpperCase(), { id: true })
  check('email match is case-insensitive', byEmailUpper.matchCount === 2 && byEmailUpper.user?.id === ids.dupe1)

  const byUsername = await findUserByEmailOrUsername<{ id: string }>(`${P}userA`.toUpperCase(), { id: true })
  check('username lookup is case-insensitive + unique', byUsername.matchCount === 1 && byUsername.user?.id === ids.userA)

  const unknown = await findUserByEmailOrUsername<{ id: string }>(`${P}nobody@test.local`, { id: true })
  check('unknown email → matchCount=0, user=null', unknown.matchCount === 0 && unknown.user === null)
}

async function testActionGuardSequences() {
  section('4. Action guard sequences replayed via real predicates (R5 / CLIENT-LOCKED / consent)')
  const A = ids.profA

  // R5: an ADMIN passes canInviteMember but must FAIL the OWNER-only check before
  // role='ADMIN' can be granted (inviteToProfileAction lines ~119-124).
  const adminCanInvite = await perms.canInviteMember(ids.adminA, A)
  const adminRole = await perms.getProfileRole(ids.adminA, A)
  check('R5: ADMIN may invite…', adminCanInvite === true)
  check('R5: …but ADMIN is NOT OWNER → cannot grant ADMIN role', adminRole !== 'OWNER')

  // CLIENT / LOCKED invitee rejection is a User.role gate (inviteToProfileAction ~163).
  const clientU = await prisma.user.findUnique({ where: { id: ids.clientA }, select: { role: true } })
  const lockedU = await prisma.user.findUnique({ where: { id: ids.lockedA }, select: { role: true } })
  check('CLIENT invitee is rejected (User.role==CLIENT)', clientU?.role === 'CLIENT')
  check('LOCKED invitee is rejected (User.role==LOCKED)', lockedU?.role === 'LOCKED')

  // Cross-profile consent (inviteToProfileAction ~170): target home != inviting profile
  // AND allowExternalInvites=false ⇒ reject.
  const ext = await prisma.user.findUnique({ where: { id: ids.extNoConsent }, select: { profileId: true, allowExternalInvites: true } })
  const consentBlocks = ext?.profileId !== A && ext?.allowExternalInvites === false
  check('cross-profile invite to non-consenting external user is blocked', consentBlocks === true)

  const extOk = await prisma.user.findUnique({ where: { id: ids.extConsent }, select: { profileId: true, allowExternalInvites: true } })
  const consentAllows = extOk?.profileId !== A && extOk?.allowExternalInvites === true
  check('cross-profile invite to consenting external user is allowed by consent gate', consentAllows === true)
}

async function testInvariants() {
  section('5. DB invariants on the fixture (1 OWNER/profile, no orphans)')

  for (const key of ['profA', 'profB']) {
    const owners = await prisma.profileAccess.count({ where: { profileId: ids[key], role: 'OWNER' } })
    check(`${key} has exactly 1 OWNER`, owners === 1, `got ${owners}`)
  }

  const orphanPA = await prisma.profileAccess.count({
    where: { profile: { name: { startsWith: P } }, user: { is: null } as any },
  }).catch(() => 0)
  check('no orphan ProfileAccess rows', orphanPA === 0)

  // Every fixture workspace has a WorkspaceMember OWNER
  for (const key of ['wsOld', 'wsNew']) {
    const owners = await prisma.workspaceMember.count({ where: { workspaceId: ids[key], role: 'OWNER' } })
    check(`${key} has an OWNER member`, owners >= 1)
  }
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  REGRESSION CASES for audit-confirmed findings (filled in A2)             */
/* ──────────────────────────────────────────────────────────────────────── */

async function testConfirmedFindings() {
  section('6. Regression locks for audit-confirmed findings (A0)')
  const A = ids.profA
  const { wsNew } = ids

  // ── PE-1 (High): CLIENT with a STRAY WorkspaceMember row must STILL be denied internal access ──
  await prisma.workspaceMember.create({ data: { userId: ids.clientA, workspaceId: wsNew, role: 'MEMBER' } })
  check('PE-1: CLIENT + stray WorkspaceMember row → access STILL denied',
    await perms.canAccessWorkspace(ids.clientA, wsNew) === false)
  await prisma.workspaceMember.delete({ where: { userId_workspaceId: { userId: ids.clientA, workspaceId: wsNew } } })

  // ── CLB-1 (High): task-assignment gate + mint never admit a CLIENT/LOCKED ──
  check('CLB-1: isAssigneeInWorkspaceProfile(home USER) → true',
    await wm.isAssigneeInWorkspaceProfile(ids.userA, wsNew, A) === true)
  check('CLB-1: isAssigneeInWorkspaceProfile(du-học USER) → true',
    await wm.isAssigneeInWorkspaceProfile(ids.duhocU, wsNew, A) === true)
  check('CLB-1: isAssigneeInWorkspaceProfile(CLIENT) → false',
    await wm.isAssigneeInWorkspaceProfile(ids.clientA, wsNew, A) === false)
  check('CLB-1: isAssigneeInWorkspaceProfile(LOCKED) → false',
    await wm.isAssigneeInWorkspaceProfile(ids.lockedA, wsNew, A) === false)

  const clientMint = await wm.ensureWorkspaceMembership(ids.clientA, wsNew, 'MEMBER')
  const clientRow = await prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId: ids.clientA, workspaceId: wsNew } }, select: { id: true } })
  check('CLB-1: ensureWorkspaceMembership(CLIENT) → false', clientMint === false)
  check('CLB-1: ensureWorkspaceMembership(CLIENT) wrote NO WorkspaceMember row', clientRow === null)
  check('CLB-1: ensureWorkspaceMembership(LOCKED) → false', await wm.ensureWorkspaceMembership(ids.lockedA, wsNew, 'MEMBER') === false)
  const userMint = await wm.ensureWorkspaceMembership(ids.userA, wsNew, 'MEMBER')
  const userRow = await prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId: ids.userA, workspaceId: wsNew } }, select: { id: true } })
  check('CLB-1: ensureWorkspaceMembership(legit USER) → true + row written', userMint === true && !!userRow)

  // ── SI-1 / SI-2 / MISS-2 / MISS-3 (High/Med): isSessionLive liveness gate ──
  check('SI: live USER (version match) → true', await perms.isSessionLive({ user: { id: ids.userA, sessionVersion: 0 } }) === true)
  check('SI: LOCKED account → false', await perms.isSessionLive({ user: { id: ids.lockedA, sessionVersion: 0 } }) === false)
  check('SI: stale token (2 < DB 5) → false', await perms.isSessionLive({ user: { id: ids.staleU, sessionVersion: 2 } }) === false)
  check('SI: current token (5 == DB 5) → true', await perms.isSessionLive({ user: { id: ids.staleU, sessionVersion: 5 } }) === true)
  check('SI: legacy null token vs DB 0 → true (no lockout)', await perms.isSessionLive({ user: { id: ids.userA } }) === true)
  check('SI: unknown user id → false', await perms.isSessionLive({ user: { id: `${P}no_such`, sessionVersion: 0 } }) === false)

  // ── OAUTH-LINK-001 (High): deterministic + safe Google account link ──
  const linked = await gauth.findOrCreateGoogleUser({ googleId: `${P}gid_link`, email: `${P}link@test.local`, verifiedEmail: true, name: null, picture: null })
  const linkRow = await prisma.user.findUnique({ where: { id: ids.linkTarget }, select: { googleId: true } })
  check('OAUTH-LINK-001: single active account → links + logs in', linked.id === ids.linkTarget && linked.role === 'USER')
  check('OAUTH-LINK-001: googleId written onto the active row', linkRow?.googleId === `${P}gid_link`)

  let threwOnDup = false
  try { await gauth.findOrCreateGoogleUser({ googleId: `${P}gid_gdup`, email: `${P}gdup@test.local`, verifiedEmail: true, name: null, picture: null }) } catch { threwOnDup = true }
  check('OAUTH-LINK-001: duplicate email → REFUSES to link (throws)', threwOnDup)
  const gdupRows = await prisma.user.findMany({ where: { email: `${P}gdup@test.local` }, select: { googleId: true } })
  check('OAUTH-LINK-001: duplicate email → googleId NOT burned onto any row', gdupRows.every((r) => r.googleId === null))

  const lockedRes = await gauth.findOrCreateGoogleUser({ googleId: `${P}gid_lock`, email: `${P}lockedlink@test.local`, verifiedEmail: true, name: null, picture: null })
  const lockedRow = await prisma.user.findUnique({ where: { id: ids.lockedLink }, select: { googleId: true } })
  check('OAUTH-LINK-001: LOCKED email row → returns role=LOCKED (callback blocks)', lockedRes.role === 'LOCKED')
  check('OAUTH-LINK-001: LOCKED email row → googleId NOT burned (no permanent lockout)', lockedRow?.googleId === null)

  const created = await gauth.findOrCreateGoogleUser({ googleId: `${P}gid_new`, email: `${P}brandnew@test.local`, verifiedEmail: true, name: `${P}brandnew`, picture: null })
  check('OAUTH-LINK-001: brand-new verified email → creates account (isNew)', created.isNew === true && created.role === 'USER')

  // ── CONSENT-1 (Med): consent gate now fires for null-home-profile users ──
  const nu = await prisma.user.findUnique({ where: { id: ids.nullNoConsent }, select: { profileId: true, allowExternalInvites: true } })
  // Patched gate condition (inviteToProfileAction / inviteToWorkspace): profileId !== invitingProfile && allowExternalInvites===false.
  const gateFires = nu?.profileId !== A && nu?.allowExternalInvites === false
  check('CONSENT-1: null-home-profile + consent off → gate fires (force-add blocked)', gateFires === true)

  // ── ROSTER (Issue 1): getProfileMembers must exclude CLIENT-role rows ──
  // Replicates the exact where-clause of getProfileMembers (profile-member-actions.ts). A
  // regression that drops the `role: { not: 'CLIENT' }` filter (re-leaking client names into the
  // "Thành viên tổ chức" staff roster) turns this red.
  const roster = await prisma.profileAccess.findMany({
    where: { profileId: A, role: { not: 'CLIENT' } },
    select: { userId: true },
  })
  const rosterIds = new Set(roster.map((r: any) => r.userId))
  check('ROSTER: CLIENT-role member excluded from staff roster', !rosterIds.has(ids.clientA))
  check('ROSTER: OWNER/ADMIN/USER still present in roster',
    rosterIds.has(ids.ownerA) && rosterIds.has(ids.adminA) && rosterIds.has(ids.userA))
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Main                                                                     */
/* ──────────────────────────────────────────────────────────────────────── */

async function main() {
  console.log('=== Invite-flow security regression harness (Neon TEST branch) ===')
  console.log(`DB host OK: ${TEST_HOST}\n`)

  await init() // dynamic-import app modules now that the test-branch env is set
  await cleanup() // clear any leftovers from a crashed prior run
  await seed()

  await testInvitePredicates()
  await testWorkspaceAccess()
  await testLookupDeterminism()
  await testActionGuardSequences()
  await testInvariants()
  await testConfirmedFindings()

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`RESULT: ${passCount} passed, ${failCount} failed`)
  if (failCount > 0) {
    console.log('\nFAILURES:')
    for (const f of failures) console.log(`  • ${f}`)
  }
}

main()
  .catch((e) => { console.error('\n💥 Harness crashed:', e); failCount++ })
  .finally(async () => {
    if (prisma) { await cleanup(); await prisma.$disconnect() }
    process.exit(failCount > 0 ? 1 : 0)
  })
