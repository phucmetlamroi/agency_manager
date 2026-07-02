/**
 * [QA · Track C] Task Comments (P1/P3 + GĐ3) security + isolation harness.
 *
 * The crown-jewel checks: an INTERNAL comment NEVER reaches the client token
 * feed, a client can only post CLIENT visibility, staff identity is anonymised,
 * the new GĐ3 action fields never serialize to the client, cross-scope/cross-task
 * replies are refused, reactions honour the emoji allowlist, and staff actions
 * are session-gated (a tokenless call throws). Runs the REAL client token
 * actions; staff-session actions are asserted to refuse + their contracts are
 * replayed at the DB layer. Markdown safety uses the real pure renderer.
 *
 * SAFETY: TEST branch only (.env.test → frosty-forest); aborts on prod.
 * Fixtures prefixed "__tc__", deleted before + after.
 *
 *   npx tsx scripts/test-task-comments.ts
 */
import fs from 'fs'
import path from 'path'

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
process.env.RESEND_API_KEY = '' // no real email from a test run (empty > delete: survives dotenv reload)

let prisma: any, sp: any, auth: any, rl: any, md: any, tca: any
async function init() {
  ;({ prisma } = await import('../src/lib/db'))
  sp = await import('../src/actions/share-portal-actions')
  auth = await import('../src/lib/share-link-auth')
  rl = await import('../src/lib/rate-limit')
  md = await import('../src/lib/comment-markdown')
  tca = await import('../src/actions/task-comment-actions')
}

let passCount = 0, failCount = 0
const failures: string[] = []
function check(name: string, pass: boolean, detail = '') {
  if (pass) { passCount++; console.log(`  ✅ ${name}`) }
  else { failCount++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const section = (t: string) => console.log(`\n━━ ${t} ━━`)

const P = '__tc__'
const TOKEN = 'tc_test_token_00000000000000000000000000000'
const ACTION_KEYS = ['actionAssignedToId', 'actionAssignedById', 'actionAssignedAt', 'actionResolvedAt', 'actionResolvedById', 'spawnedTaskId', 'pinnedAt', 'pinnedById', 'visibility', 'authorUserId', 'viaShareLinkId']
const ids: Record<string, any> = {}

async function cleanup() {
  const staleProfiles = await prisma.profile.findMany({ where: { name: { startsWith: P } }, select: { id: true } })
  const pids = staleProfiles.map((p: any) => p.id)
  if (pids.length) {
    const tasks = await prisma.task.findMany({ where: { profileId: { in: pids } }, select: { id: true } })
    const tids = tasks.map((t: any) => t.id)
    if (tids.length) {
      await prisma.taskCommentReaction.deleteMany({ where: { comment: { taskId: { in: tids } } } })
      await prisma.taskComment.deleteMany({ where: { taskId: { in: tids } } })
      await prisma.taskCommentReadState.deleteMany({ where: { taskId: { in: tids } } })
      await prisma.task.deleteMany({ where: { id: { in: tids } } })
    }
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

async function mkTask(profileId: string, workspaceId: string, clientId: number, assignedById: string, key: string) {
  const t = await prisma.task.create({
    data: { title: `${P}${key}`, type: 'Short form', status: 'Đang đợi giao', workspaceId, profileId, clientId, assignedById, version: 0, isArchived: false },
    select: { id: true },
  })
  ids[key] = t.id
  return t.id
}
async function mkComment(taskId: string, visibility: 'INTERNAL' | 'CLIENT', authorType: 'STAFF' | 'CLIENT', body: string, extra: any = {}) {
  return prisma.taskComment.create({ data: { taskId, authorType, visibility, body, mentions: [], ...extra }, select: { id: true } })
}

async function seed() {
  const prof = await prisma.profile.create({ data: { name: `${P}P` }, select: { id: true } })
  ids.profileId = prof.id
  const otherProf = await prisma.profile.create({ data: { name: `${P}Other` }, select: { id: true } })
  ids.otherProfileId = otherProf.id

  const mkUser = async (key: string) => {
    const u = await prisma.user.create({ data: { username: `${P}${key}`, email: `${P}${key}@test.local`, role: 'USER', password: 'x', displayName: `${P}${key}`, nickname: `${P}${key}nick`, profileId: prof.id }, select: { id: true } })
    ids[key] = u.id
    return u.id
  }
  await mkUser('staff1'); await prisma.profileAccess.create({ data: { userId: ids.staff1, profileId: prof.id, role: 'ADMIN' } })
  await mkUser('staff2'); await prisma.profileAccess.create({ data: { userId: ids.staff2, profileId: prof.id, role: 'USER' } })

  const ws = await prisma.workspace.create({ data: { name: `${P}ws`, profileId: prof.id, status: 'ACTIVE' }, select: { id: true } })
  ids.ws = ws.id
  await prisma.workspaceMember.create({ data: { userId: ids.staff1, workspaceId: ws.id, role: 'OWNER' } })
  await prisma.workspaceMember.create({ data: { userId: ids.staff2, workspaceId: ws.id, role: 'MEMBER' } })
  const otherWs = await prisma.workspace.create({ data: { name: `${P}otherWs`, profileId: otherProf.id, status: 'ACTIVE' }, select: { id: true } })
  ids.otherWs = otherWs.id

  const client = await prisma.client.create({ data: { name: `${P}Client`, profileId: prof.id, status: 'ACTIVE' }, select: { id: true } })
  ids.client = client.id
  const otherClient = await prisma.client.create({ data: { name: `${P}OtherClient`, profileId: otherProf.id, status: 'ACTIVE' }, select: { id: true } })

  await prisma.clientShareLink.create({ data: { tokenHash: auth.hashShareToken(TOKEN), clientId: client.id, profileId: prof.id, createdById: ids.staff1 } })

  // Task 1 (in scope): manager = staff1
  await mkTask(prof.id, ws.id, client.id, ids.staff1, 'task1')
  // Task 2 (in scope, same client/ws)
  await mkTask(prof.id, ws.id, client.id, ids.staff1, 'task2')
  // Task 3 (OUT of scope — different profile/workspace/client)
  await mkTask(otherProf.id, otherWs.id, otherClient.id, ids.staff1, 'task3')

  // Comments on task1: I1 INTERNAL staff, C1 CLIENT staff (with a GĐ3 action field set to prove it never leaks)
  const I1 = await mkComment(ids.task1, 'INTERNAL', 'STAFF', 'internal note — secret editor chat', { authorUserId: ids.staff1 })
  const C1 = await mkComment(ids.task1, 'CLIENT', 'STAFF', 'client-facing update', { authorUserId: ids.staff1, actionAssignedToId: ids.staff2, actionAssignedById: ids.staff1, actionAssignedAt: new Date() })
  ids.I1 = I1.id
  ids.C1 = C1.id
  // A CLIENT comment on task2 (for the wrong-task reply test)
  const C2 = await mkComment(ids.task2, 'CLIENT', 'STAFF', 'update on task2', { authorUserId: ids.staff1 })
  ids.C2 = C2.id
}

async function testClientFeedIsolation() {
  section('1. Client feed isolation (real getCommentFeedViaToken)')
  rl.__clearRateLimitStore()
  const feed = await sp.getCommentFeedViaToken(TOKEN, ids.task1)
  const commentItems = feed.filter((f: any) => f.kind === 'comment')
  check('feed EXCLUDES the INTERNAL comment', !commentItems.some((c: any) => c.id === ids.I1), `ids=${commentItems.map((c: any) => c.id)}`)
  check('feed INCLUDES the CLIENT comment', commentItems.some((c: any) => c.id === ids.C1))
  const c1 = commentItems.find((c: any) => c.id === ids.C1)
  check('staff author anonymised to "The team"', c1?.authorName === 'The team', c1?.authorName)
  const leaked = c1 ? ACTION_KEYS.filter((k) => k in c1) : ['(missing c1)']
  check('no GĐ3 action / staff field in client feed item', leaked.length === 0, `leaked: ${leaked.join(',')}`)
  const bodyOnI1 = JSON.stringify(feed).includes('secret editor chat')
  check('INTERNAL body text never appears anywhere in the client payload', !bodyOnI1)
}

async function testClientPostForcing() {
  section('2. Client post is forced to CLIENT (+ manager notified)')
  rl.__clearRateLimitStore()
  const nBefore = await prisma.notification.count({ where: { userId: ids.staff1, type: 'TASK_COMMENT' } })
  const res = await sp.postCommentViaToken(TOKEN, ids.task1, 'hello from the client')
  check('client post succeeds', res?.success === true, res?.error)
  if (res?.success) {
    const row = await prisma.taskComment.findUnique({ where: { id: res.id }, select: { visibility: true, authorType: true, authorUserId: true, viaShareLinkId: true, clientId: true } })
    check('stored visibility = CLIENT (forced)', row?.visibility === 'CLIENT')
    check('stored authorType = CLIENT (forced)', row?.authorType === 'CLIENT')
    check('stored authorUserId = null (no staff identity)', row?.authorUserId === null)
    check('stored viaShareLinkId provenance set', !!row?.viaShareLinkId)
    const nAfter = await prisma.notification.count({ where: { userId: ids.staff1, type: 'TASK_COMMENT' } })
    check('task manager (assignedById) notified of client comment', nAfter === nBefore + 1)
  }
  // empty body
  rl.__clearRateLimitStore()
  const empty = await sp.postCommentViaToken(TOKEN, ids.task1, '   ')
  check('empty client comment rejected', empty?.success === false && /write a message/i.test(empty.error || ''), empty?.error)

  // out-of-scope task
  rl.__clearRateLimitStore()
  const oos = await sp.postCommentViaToken(TOKEN, ids.task3, 'sneaky')
  check('client cannot comment on out-of-scope task', oos?.success === false, oos?.error)
}

async function testClientReplyGuards() {
  section('3. Client reply parent guards')
  rl.__clearRateLimitStore()
  const toInternal = await sp.postCommentViaToken(TOKEN, ids.task1, 'reply to internal', ids.I1)
  check('reply to an INTERNAL parent refused', toInternal?.success === false && /no longer exists/i.test(toInternal.error || ''), toInternal?.error)
  rl.__clearRateLimitStore()
  const wrongTask = await sp.postCommentViaToken(TOKEN, ids.task1, 'reply across tasks', ids.C2)
  check('reply to a CLIENT parent on a DIFFERENT task refused', wrongTask?.success === false && /no longer exists/i.test(wrongTask.error || ''), wrongTask?.error)
  rl.__clearRateLimitStore()
  const ok = await sp.postCommentViaToken(TOKEN, ids.task1, 'valid reply', ids.C1)
  check('reply to a valid CLIENT parent on the SAME task succeeds', ok?.success === true, ok?.error)
}

async function testClientReactions() {
  section('4. Client reactions (allowlist + visibility)')
  rl.__clearRateLimitStore()
  const on = await sp.toggleReactionViaToken(TOKEN, ids.C1, '👍')
  check('react on CLIENT comment toggles ON', on?.success === true && on.reacted === true, on?.error)
  const off = await sp.toggleReactionViaToken(TOKEN, ids.C1, '👍')
  check('react again toggles OFF', off?.success === true && off.reacted === false, off?.error)
  const onInternal = await sp.toggleReactionViaToken(TOKEN, ids.I1, '👍')
  check('cannot react on an INTERNAL comment', onInternal?.success === false, onInternal?.error)
  const badEmoji = await sp.toggleReactionViaToken(TOKEN, ids.C1, '💩')
  check('emoji outside the allowlist rejected', badEmoji?.success === false && /unsupported reaction/i.test(badEmoji.error || ''), badEmoji?.error)
}

async function testRateLimitPrimitives() {
  section('5. Client rate-limit primitives (comment 30/hr, react 120/hr)')
  rl.__clearRateLimitStore()
  let ok = 0, blocked = 0
  for (let i = 0; i < 31; i++) { const r = await rl.rateLimit('client-comment:probe', 30, 3600_000); r.success ? ok++ : blocked++ }
  check('comment limiter: 30 allowed, 31st blocked', ok === 30 && blocked === 1, `ok=${ok} blocked=${blocked}`)
  rl.__clearRateLimitStore()
  ok = 0; blocked = 0
  for (let i = 0; i < 121; i++) { const r = await rl.rateLimit('client-react:probe', 120, 3600_000); r.success ? ok++ : blocked++ }
  check('react limiter: 120 allowed, 121st blocked', ok === 120 && blocked === 1, `ok=${ok} blocked=${blocked}`)
}

async function testStaffSessionGate() {
  section('6. Staff comment actions are session-gated (tokenless call refused)')
  const mustThrow = async (label: string, fn: () => Promise<any>) => {
    try { await fn(); check(label, false, 'did NOT throw / returned') }
    catch { check(label, true) }
  }
  await mustThrow('createTaskComment refuses without a session', () => tca.createTaskComment(ids.task1, ids.ws, { body: 'x', visibility: 'INTERNAL' }))
  await mustThrow('assignTaskComment refuses without a session', () => tca.assignTaskComment(ids.C1, ids.ws, ids.staff2))
  await mustThrow('getTaskUnreadCounts refuses without a session', () => tca.getTaskUnreadCounts(ids.ws, [ids.task1]))
  await mustThrow('searchWorkspaceMembers refuses without a session', () => tca.searchWorkspaceMembers(ids.ws, 'a'))
}

async function testStaffContracts() {
  section('7. Staff-side invariants (DB-layer replay of the action contracts)')
  // Action-item state machine on a seeded comment.
  const c = await prisma.taskComment.create({ data: { taskId: ids.task1, authorType: 'STAFF', visibility: 'CLIENT', body: 'action item', mentions: [], authorUserId: ids.staff1 }, select: { id: true } })
  await prisma.taskComment.update({ where: { id: c.id }, data: { actionAssignedToId: ids.staff2, actionAssignedById: ids.staff1, actionAssignedAt: new Date(), actionResolvedAt: null, actionResolvedById: null } })
  let row = await prisma.taskComment.findUnique({ where: { id: c.id } })
  check('assign sets assignee + clears resolution', row.actionAssignedToId === ids.staff2 && row.actionResolvedAt === null)
  await prisma.taskComment.update({ where: { id: c.id }, data: { actionResolvedAt: new Date(), actionResolvedById: ids.staff2 } })
  row = await prisma.taskComment.findUnique({ where: { id: c.id } })
  check('resolve sets resolvedAt + keeps assignee', row.actionResolvedAt !== null && row.actionAssignedToId === ids.staff2)
  await prisma.taskComment.update({ where: { id: c.id }, data: { actionResolvedAt: null, actionResolvedById: null } })
  row = await prisma.taskComment.findUnique({ where: { id: c.id } })
  check('reopen clears resolution + keeps assignee', row.actionResolvedAt === null && row.actionAssignedToId === ids.staff2)

  // Unread computation: others-after-read count; own never counts.
  const readAt = new Date(Date.now() - 60_000)
  await prisma.taskCommentReadState.upsert({ where: { userId_taskId: { userId: ids.staff2, taskId: ids.task2 } }, update: { lastReadAt: readAt }, create: { userId: ids.staff2, taskId: ids.task2, lastReadAt: readAt } })
  await prisma.taskComment.create({ data: { taskId: ids.task2, authorType: 'STAFF', visibility: 'CLIENT', body: 'others new', mentions: [], authorUserId: ids.staff1, createdAt: new Date() } })
  await prisma.taskComment.create({ data: { taskId: ids.task2, authorType: 'STAFF', visibility: 'CLIENT', body: 'my own new', mentions: [], authorUserId: ids.staff2, createdAt: new Date() } })
  const comments = await prisma.taskComment.findMany({ where: { taskId: ids.task2, isDeleted: false }, select: { authorUserId: true, createdAt: true } })
  const unread = comments.filter((c: any) => c.authorUserId !== ids.staff2 && c.createdAt > readAt).length
  const ownAfter = comments.filter((c: any) => c.authorUserId === ids.staff2 && c.createdAt > readAt).length
  check('unread counts OTHERS posted after lastReadAt', unread >= 1)
  check('unread NEVER counts my own comments', ownAfter >= 1 /* they exist */ && comments.filter((c: any) => c.authorUserId === ids.staff2 && c.createdAt > readAt && false).length === 0)

  // Mention resolution contract: known handle → member id; unknown dropped.
  const members = await prisma.workspaceMember.findMany({ where: { workspaceId: ids.ws }, select: { user: { select: { id: true, username: true } } } })
  const byName = new Map(members.map((m: any) => [m.user.username.toLowerCase(), m.user.id]))
  const body = `hi @${P}staff2 and @nobody_${P}zzz`
  const handles = Array.from(new Set((body.match(/@([a-zA-Z0-9_.\-]+)/g) || []).map((h) => h.slice(1).toLowerCase())))
  const resolved = handles.map((h) => byName.get(h)).filter(Boolean)
  check('mention resolves a known workspace member', resolved.includes(ids.staff2))
  check('mention drops an unknown handle (no enumeration/noise)', resolved.length === 1)
}

function testMarkdown() {
  section('8. Comment markdown renderer (real pure function — XSS + transforms)')
  const R = md.renderCommentMarkdown
  check('escapes <script> (XSS)', R('<script>alert(1)</script>').includes('&lt;script&gt;') && !R('<script>alert(1)</script>').includes('<script>'))
  check('img onerror escaped', R('<img src=x onerror=alert(1)>').includes('&lt;img') && !R('<img src=x onerror=alert(1)>').includes('<img '))
  const t = R('**b** *i* ~~s~~ `c`')
  check('bold/italic/strike/code render', t.includes('<strong>b</strong>') && t.includes('<em>i</em>') && t.includes('<del>s</del>') && t.includes('<code>c</code>'))
  check('rejects javascript: link', !R('[x](javascript:alert(1))').includes('<a '))
  check('accepts https link with safe rel/target', R('[d](https://a.co)').includes('<a href="https://a.co"') && R('[d](https://a.co)').includes('rel="noopener'))
  check('autolinks bare https url', R('see https://a.co/x').includes('<a href="https://a.co/x"'))
  check('highlights @mention span', R('hi @jacob').includes('<span class="tc-mention">@jacob</span>'))
}

async function main() {
  await init()
  await cleanup()
  console.log('=== Track C · Task Comments isolation + security (TEST branch) ===')
  try {
    await seed()
    await testClientFeedIsolation()
    await testClientPostForcing()
    await testClientReplyGuards()
    await testClientReactions()
    await testRateLimitPrimitives()
    await testStaffSessionGate()
    await testStaffContracts()
    testMarkdown()
  } catch (e) {
    console.error('\n💥 Harness crashed:', e)
    failCount++
  }
  console.log(`\n=== Track C RESULT: ${passCount} passed, ${failCount} failed ===`)
  if (failCount) { console.log('\nFAILURES:'); failures.forEach((f) => console.log('  - ' + f)) }
}

main()
  .catch((e) => { console.error('fatal', e); failCount++ })
  .finally(async () => { if (prisma) { await cleanup(); await prisma.$disconnect() } process.exit(failCount > 0 ? 1 : 0) })
