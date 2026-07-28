/**
 * Tests for the deliverable-name sync rules (owner request 2026-07-27).
 *
 * The repo has no jest — the convention here is runnable tsx scripts. These build their OWN
 * fixtures (workspace / task / folder / asset) inside a transaction that ALWAYS throws, so they
 * assert on real Postgres behaviour (including the partial unique indexes) while writing nothing.
 * Fixtures are namespaced with a fixed marker so a leak, if one ever happened, is greppable.
 *
 *   npx tsx scripts/test-name-sync.ts
 *
 * Cases, in the owner's words:
 *   1. Upload vào Task 1 video khi Task đã đổi tên  → video cũ lên v2, KHÔNG tạo record mới
 *   2. Sửa tên tay → upload file mới                → tên KHÔNG bị ghi đè
 *   3. Bấm Reset tên → upload file mới              → tên tiếp tục tự đồng bộ
 */
import { randomUUID } from 'crypto'
import { prisma } from '../src/lib/db'
import { REVIEW_ACTIVITY } from '../src/lib/review/activity'
import { assetNameIsAutoManaged } from '../src/lib/review/task-folder'
import { parseVideoTitle } from '../src/lib/review/parse-task-context'

const MARK = 'ZZTEST-name-sync'
let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = '') => {
    if (cond) { pass++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`) }
    else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}
class Rollback extends Error {}
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/** The exact resolution initiateTaskUpload performs for a SINGLE-file task upload. */
async function resolveSingleUpload(tx: Tx, taskId: string, workspaceId: string, folderId: string, title: string, creatorId: string) {
    const wanted = parseVideoTitle(title, '').video
    const byName = await tx.reviewAsset.findFirst({
        where: { taskId, workspaceId, deletedAt: null, name: { equals: wanted, mode: 'insensitive' } },
        select: { id: true },
    })
    if (byName) return { assetId: byName.id, createdNewAsset: false, renamed: false }

    const solo = await tx.reviewAsset.findMany({
        where: { taskId, workspaceId, deletedAt: null },
        select: { id: true, name: true },
        take: 2,
    })
    if (solo.length === 1) {
        let renamed = false
        if (solo[0].name !== wanted && (await assetNameIsAutoManaged(tx, solo[0].id))) {
            await tx.reviewAsset.update({ where: { id: solo[0].id }, data: { name: wanted } })
            renamed = true
        }
        return { assetId: solo[0].id, createdNewAsset: false, renamed }
    }
    const created = await tx.reviewAsset.create({
        data: { folderId, workspaceId, taskId, name: wanted, mediaKind: 'VIDEO', createdById: creatorId },
        select: { id: true },
    })
    return { assetId: created.id, createdNewAsset: true, renamed: false }
}

/** Build workspace → root folder → task → one deliverable, all inside `tx`. */
async function seed(tx: Tx, title: string) {
    const profile = await tx.profile.findFirst({ select: { id: true } })
    if (!profile) throw new Error('DB không có Profile nào để gắn workspace thử nghiệm.')
    // ReviewAsset.createdById is required; reuse any existing user rather than inventing one.
    const user = await tx.user.findFirst({ select: { id: true } })
    if (!user) throw new Error('DB không có User nào để gán createdById.')
    const ws = await tx.workspace.create({ data: { name: `${MARK}-ws`, profileId: profile.id }, select: { id: true } })
    const fid = randomUUID()
    await tx.reviewFolder.create({
        data: { id: fid, workspaceId: ws.id, parentId: null, name: `${MARK}-root`, path: `/${fid}/`, depth: 0 },
    })
    const task = await tx.task.create({
        data: { title, workspaceId: ws.id, profileId: profile.id },
        select: { id: true },
    })
    const asset = await tx.reviewAsset.create({
        data: {
            folderId: fid,
            workspaceId: ws.id,
            taskId: task.id,
            name: parseVideoTitle(title, '').video,
            mediaKind: 'VIDEO',
            createdById: user.id,
        },
        select: { id: true, name: true },
    })
    return { workspaceId: ws.id, folderId: fid, taskId: task.id, asset, creatorId: user.id }
}

async function run(label: string, body: (tx: Tx) => Promise<void>) {
    console.log(`\n${label}`)
    await prisma
        .$transaction(async (tx) => {
            await body(tx)
            throw new Rollback()
        }, { timeout: 30_000 })
        .catch((e) => {
            if (!(e instanceof Rollback)) throw e
        })
}

async function main() {
    console.log('Kiểm thử đồng bộ tên video ↔ tên task (fixture tự tạo, luôn rollback)')

    await run('[1] Đổi tên task rồi upload tiếp → v2 của video cũ, không tạo video mới', async (tx) => {
        const f = await seed(tx, 'Video 1 - Do the hell')
        await tx.task.update({ where: { id: f.taskId }, data: { title: 'Video 1 - Fixed' } })
        const r = await resolveSingleUpload(tx, f.taskId, f.workspaceId, f.folderId, 'Video 1 - Fixed', f.creatorId)
        ok('dùng lại video cũ', r.assetId === f.asset.id)
        ok('KHÔNG tạo record video mới', r.createdNewAsset === false)
        const count = await tx.reviewAsset.count({ where: { taskId: f.taskId, deletedAt: null } })
        ok('task vẫn chỉ có 1 video', count === 1, `đếm được ${count}`)
        const after = await tx.reviewAsset.findUnique({ where: { id: f.asset.id }, select: { name: true } })
        ok('tên đã đồng bộ theo task mới', after?.name === 'Video 1 - Fixed', `hiện là "${after?.name}"`)
    })

    await run('[2] Sửa tên tay → upload tiếp → tên KHÔNG bị ghi đè', async (tx) => {
        const f = await seed(tx, 'Video 1 - Do the hell')
        await tx.reviewAsset.update({ where: { id: f.asset.id }, data: { name: 'Tên tôi tự đặt' } })
        await tx.reviewActivity.create({
            data: { type: REVIEW_ACTIVITY.ASSET_RENAMED, workspaceId: f.workspaceId, assetId: f.asset.id, meta: {} },
        })
        await tx.task.update({ where: { id: f.taskId }, data: { title: 'Video 1 - Fixed' } })
        const r = await resolveSingleUpload(tx, f.taskId, f.workspaceId, f.folderId, 'Video 1 - Fixed', f.creatorId)
        ok('vẫn dùng lại video cũ', r.assetId === f.asset.id && !r.createdNewAsset)
        ok('không thực hiện đổi tên', r.renamed === false)
        const after = await tx.reviewAsset.findUnique({ where: { id: f.asset.id }, select: { name: true } })
        ok('tên do người dùng đặt còn nguyên', after?.name === 'Tên tôi tự đặt', `hiện là "${after?.name}"`)
    })

    await run('[3] Reset tên → upload tiếp → tự đồng bộ hoạt động trở lại', async (tx) => {
        const f = await seed(tx, 'Video 1 - Do the hell')
        await tx.reviewAsset.update({ where: { id: f.asset.id }, data: { name: 'Tên tôi tự đặt' } })
        await tx.reviewActivity.create({
            data: { type: REVIEW_ACTIVITY.ASSET_RENAMED, workspaceId: f.workspaceId, assetId: f.asset.id, meta: {} },
        })
        ok('trước khi reset: đang ở chế độ tên thủ công', (await assetNameIsAutoManaged(tx, f.asset.id)) === false)
        // The reset action's effect: rename back + a NEWER name_reset row.
        await tx.reviewAsset.update({ where: { id: f.asset.id }, data: { name: 'Video 1 - Do the hell' } })
        await tx.reviewActivity.create({
            data: { type: REVIEW_ACTIVITY.ASSET_NAME_RESET, workspaceId: f.workspaceId, assetId: f.asset.id, meta: {} },
        })
        ok('sau khi reset: quay lại chế độ tự đồng bộ', (await assetNameIsAutoManaged(tx, f.asset.id)) === true)
        await tx.task.update({ where: { id: f.taskId }, data: { title: 'Video 1 - Fixed' } })
        const r = await resolveSingleUpload(tx, f.taskId, f.workspaceId, f.folderId, 'Video 1 - Fixed', f.creatorId)
        ok('lần upload sau tự đổi tên trở lại', r.renamed === true)
        const after = await tx.reviewAsset.findUnique({ where: { id: f.asset.id }, select: { name: true } })
        ok('tên đã bám theo task mới', after?.name === 'Video 1 - Fixed', `hiện là "${after?.name}"`)
    })

    // Rollback proof: none of the fixtures may survive.
    const leaked = await prisma.workspace.count({ where: { name: { startsWith: MARK } } })
    console.log('')
    ok('mọi fixture đã rollback, DB không còn dấu vết', leaked === 0, `${leaked} workspace sót lại`)

    console.log(`\nKẾT QUẢ: ${pass} đạt, ${fail} hỏng`)
    if (fail) process.exitCode = 1
}

main()
    .catch((e) => {
        console.error(e)
        process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
