'use server'

/**
 * [Velox v4] Server actions for the Task → TaskRawFootage 1:1 relation.
 *
 * Three actions:
 *   - `getRawFootageMap(taskId)`         — fetch current row (or null)
 *   - `setRawFootageDisplayType(taskId, displayType)`
 *                                        — switch between PER_LINK / BATCH /
 *                                          MULTI_HOOK_MAP
 *   - `saveRawFootageMap(taskId, args)`  — persist the user-confirmed
 *                                          VeloxScanResult into `veloxMap`
 *
 * Auth model
 *   - ĐỌC (`getRawFootageMap`, `getHookGraph`): workspace MEMBER là đủ.
 *   - GHI (`setRawFootageDisplayType`, `saveRawFootageMap`, `saveHookGraph`): ADMIN/OWNER workspace
 *     HOẶC người được giao chính task đó — xem `assertCanWriteRawFootage`.
 *
 * ⚠️ [AUDIT SWEEP-2026-07-30 · ĐÍNH CHÍNH] Chú thích cũ ở đây viết: "We don't tighten further at this
 * layer because the editor is already inside Add Task, which has its own role gate (ADMIN/OWNER) at
 * the route level." ĐIỀU ĐÓ SAI, và chính nó là lý do lỗ hổng tồn tại: cổng ở tầng ROUTE chỉ bảo vệ
 * việc RENDER trang. Server action là POST endpoint độc lập — gọi được trực tiếp bằng header
 * `Next-Action`, không đi qua trang nào. Nên "đã có gate ở route" KHÔNG BAO GIỜ là lý do để bỏ chốt
 * trong action. Đừng dùng lập luận đó ở bất cứ đâu khác trong repo.
 *
 * Validation
 *   - The JSON map is validated against a Zod schema before write so a
 *     malformed payload can't reach the DB. The schema mirrors
 *     `VeloxScanResult` from `src/lib/velox/v4-types.ts` — we keep it loose
 *     on string content (provider/url/path are validated client-side) and
 *     tight on shape so the UI can rely on optional vs required.
 */

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { verifyWorkspaceAccess } from '@/lib/security'
import { audit } from '@/lib/audit-log'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { normalizeGraph, type HookGraph } from '@/lib/velox/hook-graph-types'

// ────────────────────────────────────────────────────────────────────────────
//  Zod schema mirroring VeloxScanResult — see src/lib/velox/v4-types.ts
// ────────────────────────────────────────────────────────────────────────────

const veloxFileSchema = z.object({
    name: z.string(),
    path: z.string(),
    url: z.string(),
    ext: z.string(),
    sizeBytes: z.number().int().nonnegative(),
    part: z.number().int().positive().optional(),
    rawReason: z.string().optional(),
    rawTokens: z.array(z.string()).optional(),
})

const veloxModifiersSchema = z.object({
    durationSec: z.number().optional(),
    aspect: z.string().optional(),
    audience: z.string().optional(),
    version: z.string().optional(),
}).optional()

const veloxNodeSchema: z.ZodType<any> = z.object({
    id: z.string(),
    role: z.enum(['HOOK', 'BODY', 'CTA', 'CALLOUT', 'SCRIPT', 'CAPTION', 'FINAL']),
    subRole: z.string().optional(),
    index: z.number().int().optional(),
    label: z.string(),
    scope: z.enum(['CONCEPT', 'SHARED']),
    status: z.enum(['ACTIVE', 'EXCLUDED', 'SUPERSEDED', 'PENDING']),
    confidence: z.number().min(0).max(1),
    band: z.enum(['HIGH', 'REVIEW']),
    isCompilation: z.boolean().optional(),
    note: z.string().optional(),
    files: z.array(veloxFileSchema).min(1),
    modifiers: veloxModifiersSchema,
})

const veloxConceptSchema = z.object({
    id: z.string(),
    label: z.string(),
    source: z.enum(['subfolder', 'filename', 'brand_prefix', 'default']),
    nodes: z.array(veloxNodeSchema),
    finals: z.array(veloxNodeSchema),
    edges: z.array(z.object({ from: z.string(), to: z.string() })),
})

// [Review BLOCKER 1] Strict ID format — fail fast before the DB roundtrip.
const taskIdSchema = z.string().uuid({ message: 'taskId không phải UUID hợp lệ.' })

const veloxScanResultSchema = z.object({
    schemaVersion: z.literal('velox-4.0'),
    rootFolder: z.object({
        provider: z.enum(['dropbox', 'gdrive']),
        name: z.string(),
        // [Review HIGH 2] Validate as a real URL so DB can't accept
        // `javascript:` or relative-path payloads via `sourceFolderUrl`.
        url: z.string().url({ message: 'rootFolder.url phải là URL hợp lệ.' }),
    }),
    scannedAt: z.string(),
    stats: z.object({
        totalFiles: z.number().int().nonnegative(),
        mappedFiles: z.number().int().nonnegative(),
        rawFiles: z.number().int().nonnegative(),
        unsortedFiles: z.number().int().nonnegative(),
        conceptsDetected: z.number().int().nonnegative(),
        hooksDetected: z.number().int().nonnegative(),
    }),
    concepts: z.array(veloxConceptSchema),
    sharedAssets: z.array(veloxNodeSchema),
    trays: z.object({
        raw: z.array(veloxFileSchema),
        unsorted: z.array(veloxFileSchema),
    }),
    warnings: z.array(z.string()),
})

// ────────────────────────────────────────────────────────────────────────────
//  Shared helper — load the task + verify workspace + return row stub
// ────────────────────────────────────────────────────────────────────────────

async function loadTaskOrFail(taskId: string) {
    // [Review BLOCKER 1] Session BEFORE Prisma + UUID format validation
    // BEFORE any DB roundtrip. Earlier ordering let a deleted-user session
    // hit the DB and then failed silently at workspace-access.
    const session = await getSession()
    if (!session?.user?.id) return { error: 'Unauthorized' as const }
    const idCheck = taskIdSchema.safeParse(taskId)
    if (!idCheck.success) return { error: 'taskId không hợp lệ.' as const }
    const task = await prisma.task.findUnique({
        where: { id: idCheck.data },
        // [AUDIT SWEEP-2026-07-30 fix · P1-021] `assigneeId` thêm vào để dựng được chốt ghi bên dưới.
        select: { id: true, workspaceId: true, profileId: true, title: true, assigneeId: true },
    })
    if (!task) return { error: 'Task không tồn tại.' as const }
    if (!task.workspaceId) return { error: 'Task chưa thuộc workspace nào.' as const }
    let workspaceRole: string | null = null
    try {
        // [AUDIT SWEEP fix · P1-021] Giá trị trả về TRƯỚC ĐÂY BỊ BỎ. Cần `workspaceRole` để phân biệt
        // đường đọc (MEMBER là đủ) với đường ghi (phải là admin HOẶC người được giao task).
        const access = await verifyWorkspaceAccess(task.workspaceId, 'MEMBER')
        workspaceRole = access.workspaceRole ?? null
    } catch (err: any) {
        if (err?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: 'Bạn không có quyền truy cập task này.' as const }
        }
        throw err
    }
    return { ok: true as const, session, task, workspaceRole }
}

/**
 * [AUDIT SWEEP-2026-07-30 fix · P1-021] CHỐT CHO CÁC ĐƯỜNG GHI.
 *
 * Trước đây cả 3 đường ghi (`setRawFootageDisplayType`, `saveRawFootageMap`, `saveHookGraph`) chỉ đòi
 * MEMBER. Nghĩa là bất kỳ nhân sự nội bộ nào của tenant — không cần được giao task, không cần admin —
 * lấy `taskId` từ URL/board rồi POST là XOÁ SẠCH được sơ đồ dựng (Multi-Hook Map) và `veloxMap` của
 * task người khác: `upsert` ghi `manualGraph` rỗng và ép `displayType`. Có `audit()` nên truy được ai
 * làm, nhưng nội dung đã mất.
 *
 * Quyết định của chủ dự án: ADMIN/OWNER **hoặc** người được giao task đó. Đây KHÔNG phải luật mới —
 * đúng bằng luật repo đã chốt cho `updateTask` (task-management-actions.ts) và `update-task-details.ts`,
 * nên không sinh thêm một mô hình quyền thứ hai. Editor được giao vẫn tự cập nhật sơ đồ khi dựng.
 */
function assertCanWriteRawFootage(r: {
    session: { user?: { id?: string } } | null
    task: { assigneeId: string | null }
    workspaceRole: string | null
}): { error: string } | null {
    const isWorkspaceAdmin = r.workspaceRole === 'OWNER' || r.workspaceRole === 'ADMIN'
    if (isWorkspaceAdmin) return null
    if (r.task.assigneeId && r.task.assigneeId === r.session?.user?.id) return null
    return { error: 'Chỉ quản lý hoặc người được giao task này mới sửa được sơ đồ dựng.' }
}

// ────────────────────────────────────────────────────────────────────────────
//  Read
// ────────────────────────────────────────────────────────────────────────────

export async function getRawFootageMap(taskId: string) {
    const r = await loadTaskOrFail(taskId)
    if ('error' in r) return r
    const row = await prisma.taskRawFootage.findUnique({
        where: { taskId },
    })
    return { ok: true as const, row }
}

// ────────────────────────────────────────────────────────────────────────────
//  Toggle display mode (PER_LINK / BATCH / MULTI_HOOK_MAP)
// ────────────────────────────────────────────────────────────────────────────

export async function setRawFootageDisplayType(
    taskId: string,
    displayType: 'PER_LINK' | 'BATCH' | 'MULTI_HOOK_MAP',
) {
    if (
        displayType !== 'PER_LINK' &&
        displayType !== 'BATCH' &&
        displayType !== 'MULTI_HOOK_MAP'
    ) {
        return { error: 'displayType không hợp lệ.' as const }
    }

    const r = await loadTaskOrFail(taskId)
    if ('error' in r) return r
    const { session, task } = r
    // [AUDIT SWEEP-2026-07-30 fix · P1-021] Đường GHI: admin HOẶC người được giao. Hai đường ĐỌC
    // (getRawFootageMap, getHookGraph) cố ý GIỮ ở mức MEMBER — cả tenant vẫn xem được sơ đồ.
    const denied = assertCanWriteRawFootage(r)
    if (denied) return denied

    const existing = await prisma.taskRawFootage.findUnique({ where: { taskId } })
    const before = existing?.displayType ?? 'PER_LINK'
    const row = await prisma.taskRawFootage.upsert({
        where: { taskId },
        create: { taskId, displayType },
        update: { displayType },
    })

    if (before !== displayType) {
        await audit({
            workspaceId: task.workspaceId,
            actorUserId: session.user.id,
            action: 'task.raw_footage_mode_changed',
            targetType: 'Task',
            targetId: task.id,
            before: { displayType: before },
            after: { displayType, taskTitle: task.title },
        }).catch((e) => console.warn('[setRawFootageDisplayType] audit failed:', e))
    }

    try {
        revalidatePath(`/${task.workspaceId}/dashboard`)
    } catch { /* best-effort */ }

    return { ok: true as const, row }
}

// ────────────────────────────────────────────────────────────────────────────
//  Save the confirmed map
// ────────────────────────────────────────────────────────────────────────────

export interface SaveRawFootageMapArgs {
    /** The full VeloxScanResult after the user's edits. */
    veloxMap: unknown
    /** The cloud-storage URL the editor pasted to trigger the scan. */
    sourceFolderUrl?: string
    /** ISO timestamp from the engine — falls back to NOW if missing. */
    scannedAt?: string
}

export async function saveRawFootageMap(
    taskId: string,
    args: SaveRawFootageMapArgs,
) {
    const r = await loadTaskOrFail(taskId)
    if ('error' in r) return r
    const { session, task } = r
    // [AUDIT SWEEP-2026-07-30 fix · P1-021] Đường GHI: admin HOẶC người được giao. Hai đường ĐỌC
    // (getRawFootageMap, getHookGraph) cố ý GIỮ ở mức MEMBER — cả tenant vẫn xem được sơ đồ.
    const denied = assertCanWriteRawFootage(r)
    if (denied) return denied

    const parsed = veloxScanResultSchema.safeParse(args.veloxMap)
    if (!parsed.success) {
        return {
            error: 'veloxMap không hợp lệ — JSON sai schema.' as const,
            details: parsed.error.flatten(),
        }
    }
    const veloxMap = parsed.data

    const scannedAt = args.scannedAt ? new Date(args.scannedAt) : new Date()
    if (Number.isNaN(scannedAt.getTime())) {
        return { error: 'scannedAt không hợp lệ.' as const }
    }

    const row = await prisma.taskRawFootage.upsert({
        where: { taskId },
        create: {
            taskId,
            displayType: 'MULTI_HOOK_MAP',
            veloxMap: veloxMap as any,
            sourceFolderUrl: args.sourceFolderUrl ?? null,
            scannedAt,
        },
        update: {
            displayType: 'MULTI_HOOK_MAP',
            veloxMap: veloxMap as any,
            sourceFolderUrl: args.sourceFolderUrl ?? undefined,
            scannedAt,
        },
    })

    await audit({
        workspaceId: task.workspaceId,
        actorUserId: session.user.id,
        action: 'task.raw_footage_map_saved',
        targetType: 'Task',
        targetId: task.id,
        after: {
            taskTitle: task.title,
            conceptsDetected: veloxMap.stats.conceptsDetected,
            hooksDetected: veloxMap.stats.hooksDetected,
            mappedFiles: veloxMap.stats.mappedFiles,
            rawFiles: veloxMap.stats.rawFiles,
            unsortedFiles: veloxMap.stats.unsortedFiles,
            sourceFolderUrl: args.sourceFolderUrl ?? null,
        },
    }).catch((e) => console.warn('[saveRawFootageMap] audit failed:', e))

    try {
        revalidatePath(`/${task.workspaceId}/dashboard`)
    } catch { /* best-effort */ }

    return { ok: true as const, row }
}

// ════════════════════════════════════════════════════════════════════════════
//  [HOOK GRAPH] Manual whiteboard node-graph — stored in `manualGraph`
//
//  Distinct from `veloxMap` (the auto-scan / seed). Shape is HookGraph from
//  src/lib/velox/hook-graph-types.ts. We reuse the same audit action
//  (`task.raw_footage_map_saved`) since it's the same conceptual event.
// ════════════════════════════════════════════════════════════════════════════

const hookTimecodeSchema = z.object({
    inSec: z.number().nonnegative(),
    outSec: z.number().nonnegative(),
    fileUrl: z.string().max(4000).optional(),
    fileName: z.string().max(400).optional(),
})

const hookBlockSchema = z.object({
    id: z.string().min(1).max(120),
    name: z.string().max(200),
    position: z.object({ x: z.number(), y: z.number() }),
    url: z.string().max(4000).optional(),
    timecode: hookTimecodeSchema.optional(),
    // Back-compat: older graphs stored a `source` discriminated union — accepted
    // here and normalised to url/timecode on read (see normalizeGraph).
    source: z.any().optional(),
    tag: z.string().max(40).optional(),
    status: z.enum(['DRAFT', 'EDITING', 'REVIEW', 'APPROVED', 'REJECTED']).optional(),
    note: z.string().max(2000).optional(),
    assigneeId: z.string().nullable().optional(),
    durationSec: z.number().nonnegative().optional(),
    thumbnailUrl: z.string().max(4000).optional(),
})

const hookEdgeSchema = z.object({
    id: z.string().min(1).max(120),
    from: z.string().min(1).max(120),
    to: z.string().min(1).max(120),
})

// Caps keep a malicious/runaway payload from bloating the row.
const hookGraphSchema = z.object({
    schemaVersion: z.literal('hookgraph-1'),
    blocks: z.array(hookBlockSchema).max(500),
    edges: z.array(hookEdgeSchema).max(2000),
    viewport: z
        .object({ x: z.number(), y: z.number(), zoom: z.number() })
        .optional(),
})

export async function getHookGraph(taskId: string): Promise<
    | { error: string }
    | {
          ok: true
          graph: HookGraph | null
          /** The last Velox auto-scan — offered as a "seed" in the editor. */
          veloxMap: unknown | null
          sourceFolderUrl: string | null
      }
> {
    const r = await loadTaskOrFail(taskId)
    if ('error' in r) return { error: r.error ?? 'Không thể tải dữ liệu.' }
    const row = await prisma.taskRawFootage.findUnique({ where: { taskId } })
    if (!row) {
        return { ok: true as const, graph: null, veloxMap: null, sourceFolderUrl: null }
    }
    const parsed = row.manualGraph ? hookGraphSchema.safeParse(row.manualGraph) : null
    return {
        ok: true as const,
        graph: parsed?.success ? normalizeGraph(parsed.data as unknown as HookGraph) : null,
        veloxMap: row.veloxMap ?? null,
        sourceFolderUrl: row.sourceFolderUrl ?? null,
    }
}

export async function saveHookGraph(taskId: string, graph: unknown) {
    const r = await loadTaskOrFail(taskId)
    if ('error' in r) return r
    const { session, task } = r
    // [AUDIT SWEEP-2026-07-30 fix · P1-021] Đường GHI: admin HOẶC người được giao. Hai đường ĐỌC
    // (getRawFootageMap, getHookGraph) cố ý GIỮ ở mức MEMBER — cả tenant vẫn xem được sơ đồ.
    const denied = assertCanWriteRawFootage(r)
    if (denied) return denied

    const parsed = hookGraphSchema.safeParse(graph)
    if (!parsed.success) {
        return {
            error: 'manualGraph không hợp lệ — JSON sai schema.' as const,
            details: parsed.error.flatten(),
        }
    }
    const manualGraph = parsed.data

    const row = await prisma.taskRawFootage.upsert({
        where: { taskId },
        create: {
            taskId,
            displayType: 'MULTI_HOOK_MAP',
            manualGraph: manualGraph as object,
        },
        update: {
            displayType: 'MULTI_HOOK_MAP',
            manualGraph: manualGraph as object,
        },
    })

    await audit({
        workspaceId: task.workspaceId,
        actorUserId: session.user.id,
        action: 'task.raw_footage_map_saved',
        targetType: 'Task',
        targetId: task.id,
        after: {
            taskTitle: task.title,
            mode: 'hook_graph',
            blocks: manualGraph.blocks.length,
            edges: manualGraph.edges.length,
        },
    }).catch((e) => console.warn('[saveHookGraph] audit failed:', e))

    try {
        revalidatePath(`/${task.workspaceId}/dashboard`)
    } catch { /* best-effort */ }

    return { ok: true as const, row }
}
