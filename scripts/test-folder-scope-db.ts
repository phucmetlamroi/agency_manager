/**
 * [review-fixes P1 / FR-03] Folder-scope DB harness — the leak-vs-lockout gate.
 *
 * The pure unit test (test-folder-scope.ts) proves isPathVisible/isPathMutable. This harness
 * proves the DB-BACKED half the unit test can't: getFolderScope()'s query — "editor's assigned
 * tasks → their folders" — actually captures the folder where a deliverable lives (LOCK-OUT
 * risk) and excludes other editors' folders (LEAK risk), across all three scope sources
 * (ReviewFolder.taskId, ReviewAsset.taskId→folder, ReviewFolder.createdById) + workspace
 * isolation + admin-unrestricted.
 *
 * WHY IT CAN RUN AS A SCRIPT: getFolderScope + assertAssetInScope + assertVersionInScope are
 * SESSION-FREE — they take {userId, isAdmin} + query the DB directly (unlike listChildren etc.
 * which call requireReviewAccess→getSession→cookies() and throw outside a request). isPathVisible/
 * isPathMutable are pure. So this harness exercises the EXACT scoping logic the guarded routes use.
 *
 * SAFETY: runs ONLY against the Neon `test` branch (.env.test host must contain "frosty-forest").
 * HARD-EXITS if DATABASE_URL looks like prod ("autumn-flower"). All fixtures carry the "__fs__"
 * prefix (or live in the __fs__ workspaces) and are deleted before + after the run.
 *
 * Usage:  npm run test:folder-scope-db   (or: npx tsx scripts/test-folder-scope-db.ts)
 */

import fs from 'fs'
import path from 'path'

/* ── 0) Load .env.test + HARD-GUARD the test branch (mirror test-invite-security) ───────── */

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
const TEST_HOST = 'frosty-forest'
const PROD_HOST = 'autumn-flower'
if (!DB.includes(TEST_HOST) || DB.includes(PROD_HOST)) {
  console.error('❌ SAFETY ABORT: DATABASE_URL is not the Neon test branch.')
  console.error(`   expected host to contain "${TEST_HOST}" and NOT "${PROD_HOST}".`)
  console.error(`   got: ${DB.replace(/:[^:@/]+@/, ':***@').slice(0, 90)}...`)
  process.exit(1)
}

/* ── dynamic imports AFTER env is set (so @/lib/db builds its client on the test branch) ── */

let prisma: any
let scope: typeof import('../src/lib/review/folder-scope')

async function init() {
  ;({ prisma } = await import('../src/lib/db'))
  scope = await import('../src/lib/review/folder-scope')
}

/* ── tiny test runner ──────────────────────────────────────────────────────────────────── */

let passCount = 0
let failCount = 0
function check(name: string, pass: boolean, detail = '') {
  if (pass) { passCount++; console.log(`  ✅ ${name}`) }
  else { failCount++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`) }
}
function section(t: string) { console.log(`\n━━ ${t} ━━`) }
async function threw(fn: () => Promise<unknown>): Promise<boolean> {
  try { await fn(); return false } catch { return true }
}

/* ── fixtures ──────────────────────────────────────────────────────────────────────────── */

const P = '__fs__'
const ids: Record<string, string> = {}
const paths = {
  root: '/root/',
  clientX: '/root/clientX/',
  videoA: '/root/clientX/videoA/', // editorA's assigned video folder (ReviewFolder.taskId=taskA)
  videoB: '/root/clientX/videoB/', // editorB's
  videoAssetLink: '/root/clientX/videoAssetLink/', // folder.taskId=null but holds an asset with taskId=taskA
  clientY: '/root/clientY/',
  videoOwn: '/root/clientY/videoOwn/', // editorA created it (createdById), taskId=null
  w2root: '/w2root/', // W2 folder for cross-workspace isolation
  w2videoA: '/w2root/videoA2/',
}

async function cleanup() {
  const wss = await prisma.workspace.findMany({ where: { profile: { name: { startsWith: P } } }, select: { id: true } })
  const wsIds = wss.map((w: { id: string }) => w.id)
  if (wsIds.length) {
    await prisma.reviewVersion.deleteMany({ where: { workspaceId: { in: wsIds } } })
    await prisma.reviewAsset.deleteMany({ where: { workspaceId: { in: wsIds } } })
    await prisma.reviewFolder.updateMany({ where: { workspaceId: { in: wsIds } }, data: { parentId: null } })
    await prisma.reviewFolder.deleteMany({ where: { workspaceId: { in: wsIds } } })
    await prisma.task.deleteMany({ where: { workspaceId: { in: wsIds } } })
    await prisma.workspaceMember.deleteMany({ where: { workspaceId: { in: wsIds } } })
  }
  await prisma.workspace.deleteMany({ where: { profile: { name: { startsWith: P } } } })
  await prisma.profileAccess.deleteMany({ where: { profile: { name: { startsWith: P } } } })
  await prisma.user.deleteMany({ where: { username: { startsWith: P } } })
  await prisma.profile.deleteMany({ where: { name: { startsWith: P } } })
}

async function seed() {
  const prof = await prisma.profile.create({ data: { name: `${P}P` }, select: { id: true } })
  ids.prof = prof.id

  async function mkUser(key: string) {
    const u = await prisma.user.create({
      data: { username: `${P}${key}`, email: `${P}${key}@test.local`, role: 'USER', password: 'x', displayName: `${P}${key}` },
      select: { id: true },
    })
    ids[key] = u.id
    return u.id
  }
  await mkUser('editorA')
  await mkUser('editorB')
  await mkUser('editorNoTask')
  await mkUser('adminU')

  const W = await prisma.workspace.create({ data: { name: `${P}W`, profileId: prof.id, status: 'ACTIVE' }, select: { id: true } })
  const W2 = await prisma.workspace.create({ data: { name: `${P}W2`, profileId: prof.id, status: 'ACTIVE' }, select: { id: true } })
  ids.W = W.id
  ids.W2 = W2.id

  async function mkTask(key: string, workspaceId: string, assigneeId: string) {
    const t = await prisma.task.create({ data: { title: `${P}${key}`, workspaceId, assigneeId }, select: { id: true } })
    ids[key] = t.id
    return t.id
  }
  await mkTask('taskA', W.id, ids.editorA)
  await mkTask('taskB', W.id, ids.editorB)
  await mkTask('taskA2', W2.id, ids.editorA) // editorA also assigned a task in W2 (isolation test)

  async function mkFolder(key: string, workspaceId: string, p: string, extra: Record<string, unknown> = {}) {
    const depth = p.split('/').filter(Boolean).length - 1
    const f = await prisma.reviewFolder.create({
      data: { workspaceId, name: `${P}${key}`, path: p, depth, createdById: ids.adminU, ...extra },
      select: { id: true },
    })
    ids[key] = f.id
    return f.id
  }
  // W tree (parentId omitted — scope logic is path-based, not tree-based)
  await mkFolder('fRoot', W.id, paths.root)
  await mkFolder('fClientX', W.id, paths.clientX)
  await mkFolder('fVideoA', W.id, paths.videoA, { taskId: ids.taskA })
  await mkFolder('fVideoB', W.id, paths.videoB, { taskId: ids.taskB })
  await mkFolder('fVideoAssetLink', W.id, paths.videoAssetLink) // folder NOT tied to a task
  await mkFolder('fClientY', W.id, paths.clientY)
  await mkFolder('fVideoOwn', W.id, paths.videoOwn, { createdById: ids.editorA }) // editorA created
  // W2 tree
  await mkFolder('fW2Root', W2.id, paths.w2root)
  await mkFolder('fW2VideoA', W2.id, paths.w2videoA, { taskId: ids.taskA2 })

  async function mkAsset(key: string, workspaceId: string, folderId: string, extra: Record<string, unknown> = {}) {
    const a = await prisma.reviewAsset.create({
      data: { workspaceId, folderId, name: `${P}${key}`, mediaKind: 'VIDEO', createdById: ids.adminU, ...extra },
      select: { id: true },
    })
    ids[key] = a.id
    return a.id
  }
  await mkAsset('aA', W.id, ids.fVideoA, { taskId: ids.taskA })
  await mkAsset('aB', W.id, ids.fVideoB, { taskId: ids.taskB })
  // asset tied to editorA's task but living in a folder whose taskId is null → tests the
  // ReviewAsset.taskId→folder scope branch (the folder is reachable ONLY through the asset).
  await mkAsset('aAssetLink', W.id, ids.fVideoAssetLink, { taskId: ids.taskA })

  async function mkVersion(key: string, workspaceId: string, assetId: string, uploaderId: string) {
    const v = await prisma.reviewVersion.create({
      data: {
        workspaceId, assetId, versionNumber: 1, mediaKind: 'VIDEO', mimeType: 'video/mp4',
        fileName: `${P}${key}.mp4`, sizeBytes: BigInt(1000), uploaderId, pipelineStatus: 'READY',
      },
      select: { id: true },
    })
    ids[key] = v.id
    return v.id
  }
  await mkVersion('vA', W.id, ids.aA, ids.editorA)
  await mkVersion('vB', W.id, ids.aB, ids.editorB)
}

/* ── tests ─────────────────────────────────────────────────────────────────────────────── */

async function run() {
  const editorScope = (userId: string, workspaceId = ids.W) => scope.getFolderScope({ userId, workspaceId, isAdmin: false })

  section('1. getFolderScope query — captures the editor\'s OWN assigned/created folders (LOCK-OUT)')
  const sa = await editorScope(ids.editorA)
  check('editorA scope is restricted (not admin)', sa.unrestricted === false)
  check('captures assigned folder via ReviewFolder.taskId (videoA)', sa.allowedPrefixes.includes(paths.videoA))
  check('captures folder via ReviewAsset.taskId (videoAssetLink)', sa.allowedPrefixes.includes(paths.videoAssetLink))
  check('captures self-created folder via createdById (videoOwn)', sa.allowedPrefixes.includes(paths.videoOwn))

  section('2. getFolderScope query — excludes OTHER editors\' folders (LEAK)')
  check('does NOT capture editorB\'s videoB', !sa.allowedPrefixes.includes(paths.videoB))
  check('does NOT capture bare ancestor clientX as an allowed prefix', !sa.allowedPrefixes.includes(paths.clientX))
  check('does NOT capture root as an allowed prefix', !sa.allowedPrefixes.includes(paths.root))

  section('3. Cross-WORKSPACE isolation — scope in W excludes W2 folders (and vice-versa)')
  check('W scope excludes W2 folder path', !sa.allowedPrefixes.includes(paths.w2videoA))
  const saW2 = await editorScope(ids.editorA, ids.W2)
  check('editorA HAS scope in W2 (assigned taskA2 there)', saW2.allowedPrefixes.includes(paths.w2videoA))
  check('W2 scope excludes W folder path', !saW2.allowedPrefixes.includes(paths.videoA))

  section('4. isPathVisible — ancestors navigable, self/descendants visible, siblings hidden')
  check('root ancestor visible', scope.isPathVisible(sa, paths.root))
  check('clientX ancestor visible', scope.isPathVisible(sa, paths.clientX))
  check('own videoA visible', scope.isPathVisible(sa, paths.videoA))
  check('clientY ancestor (of videoOwn) visible', scope.isPathVisible(sa, paths.clientY))
  check('sibling videoB NOT visible', !scope.isPathVisible(sa, paths.videoB))

  section('5. isPathMutable — only own folders + descendants; ancestors read-only')
  check('videoA mutable', scope.isPathMutable(sa, paths.videoA))
  check('videoAssetLink mutable', scope.isPathMutable(sa, paths.videoAssetLink))
  check('clientX ancestor NOT mutable', !scope.isPathMutable(sa, paths.clientX))
  check('root NOT mutable', !scope.isPathMutable(sa, paths.root))
  check('sibling videoB NOT mutable', !scope.isPathMutable(sa, paths.videoB))

  section('6. assertAssetInScope / assertVersionInScope — real DB resolution')
  check('editorA can READ own asset aA', !(await threw(() => scope.assertAssetInScope(sa, ids.aA, 'read'))))
  check('editorA can READ own asset via asset.taskId (aAssetLink)', !(await threw(() => scope.assertAssetInScope(sa, ids.aAssetLink, 'read'))))
  check('editorA BLOCKED reading editorB asset aB', await threw(() => scope.assertAssetInScope(sa, ids.aB, 'read')))
  check('editorA BLOCKED writing editorB asset aB', await threw(() => scope.assertAssetInScope(sa, ids.aB, 'write')))
  check('editorA can READ own version vA', !(await threw(() => scope.assertVersionInScope(sa, ids.vA, 'read'))))
  check('editorA BLOCKED reading editorB version vB', await threw(() => scope.assertVersionInScope(sa, ids.vB, 'read')))
  check('editorA BLOCKED writing editorB version vB', await threw(() => scope.assertVersionInScope(sa, ids.vB, 'write')))

  section('7. Admin / owner = unrestricted (no regression)')
  const adm = await scope.getFolderScope({ userId: ids.adminU, workspaceId: ids.W, isAdmin: true })
  check('admin scope unrestricted', adm.unrestricted === true)
  check('admin sees editorB folder', scope.isPathVisible(adm, paths.videoB))
  check('admin mutable anywhere', scope.isPathMutable(adm, paths.videoB))
  check('admin can READ editorB asset aB', !(await threw(() => scope.assertAssetInScope(adm, ids.aB, 'read'))))
  check('admin can WRITE editorB version vB', !(await threw(() => scope.assertVersionInScope(adm, ids.vB, 'write'))))

  section('8. Editor with NO assigned tasks / created folders = sees nothing')
  const none = await editorScope(ids.editorNoTask)
  check('empty allowedPrefixes', none.allowedPrefixes.length === 0)
  check('sees nothing (root not visible)', !scope.isPathVisible(none, paths.root))
  check('cannot read any asset', await threw(() => scope.assertAssetInScope(none, ids.aA, 'read')))
}

/* ── main ──────────────────────────────────────────────────────────────────────────────── */

async function main() {
  await init()
  console.log('\n[FR-03 folder-scope DB harness] Neon test branch:', DB.replace(/:[^:@/]+@/, ':***@').slice(0, 60), '…\n')
  try {
    await cleanup()
    await seed()
    await run()
  } finally {
    await cleanup()
    await prisma.$disconnect()
  }
  console.log(`\nRESULT: ${failCount === 0 ? 'PASS' : 'FAIL'} — ${passCount} passed, ${failCount} failed\n`)
  process.exit(failCount > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('\n💥 Harness crashed:', e)
  process.exit(1)
})
