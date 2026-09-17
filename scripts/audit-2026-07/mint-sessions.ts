/**
 * Audit session harness — TEST BRANCH ONLY.
 *
 * Creates dedicated `__audit__` staff accounts (one per role tier) on the isolated audit branch
 * and mints a session JWT for each, so the permission matrix can be exercised as every role.
 *
 * Why not reuse the real accounts the branch already contains: impersonating a real person, even
 * on a sandbox copy, is avoidable here — so it is avoided. Every row this writes carries the
 * `__audit__` marker and `--clean` removes all of them.
 *
 *   npx tsx scripts/audit-2026-07/mint-sessions.ts          # create + mint
 *   npx tsx scripts/audit-2026-07/mint-sessions.ts --clean  # remove every __audit__ row
 *
 * NOTE: no password is ever set on these accounts — they cannot be logged into through the form.
 * The only way in is the minted cookie, which exists solely on this machine.
 */
import { PrismaClient } from '@prisma/client'
import { SignJWT } from 'jose'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// Usernames MUST satisfy src/lib/username-validation.ts USERNAME_REGEX — a letter, a DIGIT and one
// of `_ . -`, 3..30 chars. A non-conforming username triggers the blocking "Đặt Username mới" modal,
// which covers every page and makes the whole sweep measure the modal instead of the product.
// (Found the hard way: `__audit__owner` has no digit.)
const MARK = 'audit_'
const PROFILE_ID = '61f25775-eb95-4ece-96e8-99ae97542af1' // Hustly Team — richest dataset
const WORKSPACE_ID = '54917a49-a989-4fcb-9108-e44322016f7f' // July/2026 — 81 tasks, 170 videos

function envValue(file: string, key: string): string {
    const raw = readFileSync(join(process.cwd(), file), 'utf8')
    const m = raw.match(new RegExp(`^${key}\\s*=\\s*(.*)$`, 'm'))
    if (!m) throw new Error(`${key} không có trong ${file}`)
    return m[1].trim().replace(/^["']|["']$/g, '')
}

const url = envValue('.env.local', 'DATABASE_URL')
if (!url.includes('round-lab') || url.includes('autumn-flower')) {
    console.error('DỪNG: chỉ được chạy trên nhánh thử nghiệm "round-lab".')
    process.exit(1)
}
const JWT_SECRET = envValue('.env', 'JWT_SECRET')
const db = new PrismaClient({ datasources: { db: { url } }, log: ['error'] })

/** Mirrors src/lib/jwt.ts encrypt() + src/lib/auth.ts loginWithProfile(). */
async function mint(user: Record<string, unknown>, profileId: string) {
    const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000)
    return new SignJWT({ user: { ...user, sessionProfileId: profileId }, expires })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30 days')
        .sign(new TextEncoder().encode(JWT_SECRET))
}

const ROLES = [
    { key: 'owner', username: `${MARK}owner.1`, userRole: 'ADMIN', profileRole: 'OWNER', wsRole: 'OWNER', label: 'Chủ tổ chức' },
    { key: 'admin', username: `${MARK}admin.2`, userRole: 'ADMIN', profileRole: 'ADMIN', wsRole: 'ADMIN', label: 'Quản trị' },
    { key: 'staff', username: `${MARK}staff.3`, userRole: 'USER', profileRole: 'USER', wsRole: 'MEMBER', label: 'Nhân sự / Editor' },
    { key: 'guest', username: `${MARK}guest.4`, userRole: 'USER', profileRole: 'USER', wsRole: 'GUEST', label: 'Khách trong workspace' },
] as const

async function clean() {
    const users = await db.user.findMany({ where: { username: { startsWith: MARK } }, select: { id: true } })
    const ids = users.map((u) => u.id)
    if (!ids.length) { console.log('Không còn dòng __audit__ nào.'); return }
    await db.workspaceMember.deleteMany({ where: { userId: { in: ids } } })
    await db.profileAccess.deleteMany({ where: { userId: { in: ids } } })
    await db.user.deleteMany({ where: { id: { in: ids } } })
    console.log(`Đã xoá ${ids.length} tài khoản __audit__ cùng toàn bộ quyền kèm theo.`)
}

async function main() {
    if (process.argv.includes('--clean')) return clean()

    const profile = await db.profile.findUnique({ where: { id: PROFILE_ID }, select: { name: true } })
    const ws = await db.workspace.findUnique({ where: { id: WORKSPACE_ID }, select: { name: true } })
    if (!profile || !ws) throw new Error('Không tìm thấy tổ chức hoặc workspace mục tiêu.')
    console.log(`Tổ chức : ${profile.name}\nWorkspace: ${ws.name}\n`)

    await clean() // idempotent — always start from a clean slate

    const out: Record<string, { cookie: string; label: string; username: string; userId: string }> = {}

    for (const r of ROLES) {
        const user = await db.user.create({
            data: {
                username: r.username,
                email: `${r.username}@audit.local`,
                displayName: `KIỂM TOÁN · ${r.label}`,
                role: r.userRole as never,
                profileId: PROFILE_ID,
                emailVerified: true,          // skip the verify gate
                hasCompletedEmailMigration: true, // skip the blocking migration modal
                // password intentionally left null → this account cannot use the login form
            },
            select: { id: true, username: true, role: true, profileId: true, sessionVersion: true, email: true, displayName: true },
        })

        await db.profileAccess.create({ data: { userId: user.id, profileId: PROFILE_ID, role: r.profileRole as never } })
        await db.workspaceMember.create({ data: { userId: user.id, workspaceId: WORKSPACE_ID, role: r.wsRole } })

        const cookie = await mint({
            id: user.id,
            username: user.username,
            role: user.role,
            profileId: user.profileId,
            sessionVersion: user.sessionVersion ?? 0,
            email: user.email,
            displayName: user.displayName,
            restricted: false,
            requiresEmailMigration: false,
        }, PROFILE_ID)

        out[r.key] = { cookie, label: r.label, username: user.username, userId: user.id }
        console.log(`  ✓ ${r.label.padEnd(24)} tài khoản=${r.userRole.padEnd(5)} tổ chức=${r.profileRole.padEnd(5)} workspace=${r.wsRole}`)
    }

    // Session tokens NEVER land inside the repo — .gitignore's `.env*` would not cover this name,
    // and a committed token is a committed credential. Written outside the working tree instead.
    const dir = process.env.AUDIT_OUT_DIR
    if (!dir) throw new Error('Thiếu AUDIT_OUT_DIR — nơi ghi token phải nằm NGOÀI kho mã nguồn.')
    const path = join(dir, 'audit-sessions.json')
    writeFileSync(path, JSON.stringify({ workspaceId: WORKSPACE_ID, profileId: PROFILE_ID, roles: out }, null, 2))
    console.log(`\nĐã ghi phiên đăng nhập -> ${path}`)
    console.log('Dọn sạch khi xong:  npx tsx scripts/audit-2026-07/mint-sessions.ts --clean')
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
