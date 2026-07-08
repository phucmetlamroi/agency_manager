/**
 * [Download feature — client path proof] Proves getOrCreateClientReviewSlug (the portal-derived
 * client /r/ review share) enables downloads, so the client's board shows a working Download
 * button. Both paths: CREATE (fresh share) and REUSE (an existing download-OFF share is turned on).
 * Includes security hardening tests to verify that multi-item, password-protected, or other-user
 * shares are NOT upgraded/reused.
 *
 * SAFETY: Neon `test` branch only (.env.test host must contain "frosty-forest"); HARD-EXITS on
 * prod ("autumn-flower"). Fixtures carry "__dl__" and are deleted before + after.
 *
 * Usage:  npx tsx scripts/probe-client-download-enable.ts
 */

import fs from 'fs'
import path from 'path'

function loadEnvTest() {
    const p = path.join(process.cwd(), '.env.test')
    if (!fs.existsSync(p)) { console.error('❌ .env.test not found'); process.exit(1) }
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
}
loadEnvTest()
const DB = process.env.DATABASE_URL || ''
if (!DB.includes('frosty-forest') || DB.includes('autumn-flower')) {
    console.error('❌ SAFETY ABORT: not the Neon test branch (need frosty-forest, not autumn-flower).')
    process.exit(1)
}

let prisma: any
let shares: typeof import('../src/lib/review/shares')

let pass = 0, fail = 0
const ok = (n: string, cond: boolean, d = '') => { if (cond) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.error(`  ❌ ${n}${d ? ` — ${d}` : ''}`) } }

const P = '__dl__'
const F: any = {}

async function cleanup() {
    const wss = await prisma.workspace.findMany({ where: { profile: { name: { startsWith: P } } }, select: { id: true } })
    const wsIds = wss.map((w: { id: string }) => w.id)
    if (wsIds.length) {
        const links = await prisma.shareLink.findMany({ where: { workspaceId: { in: wsIds } }, select: { id: true } })
        const linkIds = links.map((l: { id: string }) => l.id)
        if (linkIds.length) await prisma.shareLinkItem.deleteMany({ where: { shareLinkId: { in: linkIds } } })
        await prisma.shareLink.deleteMany({ where: { workspaceId: { in: wsIds } } })
        await prisma.reviewAsset.deleteMany({ where: { workspaceId: { in: wsIds } } })
        await prisma.reviewFolder.updateMany({ where: { workspaceId: { in: wsIds } }, data: { parentId: null } })
        await prisma.reviewFolder.deleteMany({ where: { workspaceId: { in: wsIds } } })
    }
    await prisma.workspace.deleteMany({ where: { profile: { name: { startsWith: P } } } })
    await prisma.user.deleteMany({ where: { username: { startsWith: P } } })
    await prisma.profile.deleteMany({ where: { name: { startsWith: P } } })
}

async function mkAsset(key: string): Promise<string> {
    const folder = await prisma.reviewFolder.create({
        data: { workspaceId: F.ws, name: `${P}f_${key}`, path: `/${P}${key}/`, depth: 0, createdById: F.user },
        select: { id: true },
    })
    const asset = await prisma.reviewAsset.create({
        data: { workspaceId: F.ws, folderId: folder.id, name: `${P}a_${key}`, mediaKind: 'VIDEO', createdById: F.user },
        select: { id: true },
    })
    return asset.id
}

async function main() {
    ;({ prisma } = await import('../src/lib/db'))
    shares = await import('../src/lib/review/shares')
    console.log('\n▶ client-download-enable probe on frosty-forest (TEST)')
    await cleanup()
    try {
        const prof = await prisma.profile.create({ data: { name: `${P}P` }, select: { id: true } })
        const user = await prisma.user.create({ data: { username: `${P}u`, email: `${P}u@t.local`, role: 'USER', password: 'x', displayName: `${P}u` }, select: { id: true } })
        const ws = await prisma.workspace.create({ data: { name: `${P}W`, profileId: prof.id, status: 'ACTIVE' }, select: { id: true } })
        F.user = user.id; F.ws = ws.id

        // ── CREATE path: fresh client share is download-enabled, not approval-gated ──────────
        const assetA = await mkAsset('A')
        const slug1 = await shares.getOrCreateClientReviewSlug({ id: assetA, workspaceId: F.ws, taskId: null, createdById: F.user })
        const share1 = await prisma.shareLink.findUnique({ where: { slug: slug1 }, select: { allowDownload: true, downloadOnlyWhenApproved: true } })
        ok('CREATE: client share has allowDownload = true', share1?.allowDownload === true)
        ok('CREATE: not gated behind approval (downloadOnlyWhenApproved = false)', share1?.downloadOnlyWhenApproved === false)

        // ── REUSE (idempotent): second call returns the same share, still enabled ───────────
        const slug1b = await shares.getOrCreateClientReviewSlug({ id: assetA, workspaceId: F.ws, taskId: null, createdById: F.user })
        ok('REUSE: same slug returned (no duplicate share)', slug1b === slug1)

        // ── REUSE-UPDATE: an existing download-OFF share on the asset gets turned ON ─────────
        const assetB = await mkAsset('B')
        const off = await prisma.shareLink.create({
            data: { slug: `${P}off1`, workspaceId: F.ws, allowDownload: false, downloadOnlyWhenApproved: true, createdById: F.user, items: { create: [{ assetId: assetB, sortIndex: 0 }] } },
            select: { id: true, slug: true },
        })
        const slug2 = await shares.getOrCreateClientReviewSlug({ id: assetB, workspaceId: F.ws, taskId: null, createdById: F.user })
        ok('REUSE-UPDATE: reused the existing share (same slug)', slug2 === off.slug)
        const share2 = await prisma.shareLink.findUnique({ where: { id: off.id }, select: { allowDownload: true, downloadOnlyWhenApproved: true } })
        ok('REUSE-UPDATE: download turned ON for the existing share', share2?.allowDownload === true)
        ok('REUSE-UPDATE: approval gate turned OFF', share2?.downloadOnlyWhenApproved === false)

        // ── SECURITY: do NOT reuse a multi-item share link (items > 1) ──────────────────────
        const assetC = await mkAsset('C')
        const assetC2 = await mkAsset('C2')
        const multiShare = await prisma.shareLink.create({
            data: {
                slug: `${P}multi`,
                workspaceId: F.ws,
                allowDownload: false,
                downloadOnlyWhenApproved: true,
                createdById: F.user,
                items: {
                    create: [
                        { assetId: assetC, sortIndex: 0 },
                        { assetId: assetC2, sortIndex: 1 }
                    ]
                }
            },
            select: { id: true, slug: true }
        })
        const slug3 = await shares.getOrCreateClientReviewSlug({ id: assetC, workspaceId: F.ws, taskId: null, createdById: F.user })
        ok('SECURITY: did not reuse multi-item share link', slug3 !== multiShare.slug)
        const shareMultiAfter = await prisma.shareLink.findUnique({ where: { id: multiShare.id }, select: { allowDownload: true } })
        ok('SECURITY: multi-item share allowDownload remained false', shareMultiAfter?.allowDownload === false)

        // ── SECURITY: do NOT reuse a passcode-protected share link ─────────────────────────
        const assetD = await mkAsset('D')
        const passcodeShare = await prisma.shareLink.create({
            data: {
                slug: `${P}passcode`,
                workspaceId: F.ws,
                allowDownload: false,
                downloadOnlyWhenApproved: true,
                createdById: F.user,
                passwordHash: 'somehash',
                items: { create: [{ assetId: assetD, sortIndex: 0 }] }
            },
            select: { id: true, slug: true }
        })
        const slug4 = await shares.getOrCreateClientReviewSlug({ id: assetD, workspaceId: F.ws, taskId: null, createdById: F.user })
        ok('SECURITY: did not reuse passcode share link', slug4 !== passcodeShare.slug)
        const sharePasscodeAfter = await prisma.shareLink.findUnique({ where: { id: passcodeShare.id }, select: { allowDownload: true } })
        ok('SECURITY: passcode share allowDownload remained false', sharePasscodeAfter?.allowDownload === false)

        // ── SECURITY: do NOT reuse a share link created by a different user ─────────────────
        const assetE = await mkAsset('E')
        const differentUser = await prisma.user.create({
            data: { username: `${P}other`, email: `${P}other@t.local`, role: 'USER', password: 'x', displayName: `${P}other` },
            select: { id: true }
        })
        const diffUserShare = await prisma.shareLink.create({
            data: {
                slug: `${P}diffuser`,
                workspaceId: F.ws,
                allowDownload: false,
                downloadOnlyWhenApproved: true,
                createdById: differentUser.id,
                items: { create: [{ assetId: assetE, sortIndex: 0 }] }
            },
            select: { id: true, slug: true }
        })
        const slug5 = await shares.getOrCreateClientReviewSlug({ id: assetE, workspaceId: F.ws, taskId: null, createdById: F.user })
        ok('SECURITY: did not reuse share link of different user', slug5 !== diffUserShare.slug)
        const shareDiffUserAfter = await prisma.shareLink.findUnique({ where: { id: diffUserShare.id }, select: { allowDownload: true } })
        ok('SECURITY: different user share allowDownload remained false', shareDiffUserAfter?.allowDownload === false)

    } catch (e) {
        console.error('💥 threw:', e); fail++
    } finally {
        await cleanup()
        await prisma.$disconnect().catch(() => {})
    }
    console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
    process.exit(fail > 0 ? 1 : 0)
}
main()
