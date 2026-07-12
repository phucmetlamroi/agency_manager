// [Review module P4.1] Comment service (API-SPEC §4, PRD nhóm E). A comment belongs
// to a VERSION (never carried across versions — frame.io rule). Timecodes are stored
// as millisecond offsets + the version's rational fps; the API speaks in FRAME integers
// (SMPTE), converted here. isInternal defaults true; guests (P5) only ever see false.
// Every entry point re-derives the workspace from version→asset→workspace and calls
// requireReviewAccess (defense in depth). No finance fields exist on these models.

import { prisma } from '@/lib/db'
import { Prisma, ReviewPipelineStatus, type ReviewVersion, type ReviewAsset } from '@prisma/client'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { requireReviewAccess } from './access'
import { getFolderScope, assertVersionInScope } from './folder-scope'
import { apiError } from './errors'
import { presignPutObject, presignGetObject, headObject } from './r2'
import { recordActivity, REVIEW_ACTIVITY } from './activity'
import { annotationSchema, toAnnotationEnvelope, readAnnotationShapes } from './annotation'
import {
    serializeComment,
    toUserRef,
    type CommentDto,
    type CommentAttachmentDto,
    type CommentReactionDto,
    type UserRef,
} from './dto'
import { notifyReview, reviewPlayerUrl } from './notify'
import { notifyGuestsOfAsset } from './guest-notify'

const MAX_BODY = 5000
const MAX_ATTACHMENTS = 6
const MAX_ATTACH_BYTES = 10 * 1024 * 1024 // 10MB (PRD 1.5)
const ATTACH_URL_PREFIX = '/api/review/comment-attachments'

// ─────────────────────────── frame ↔ ms (rational fps) ───────────────────────────

interface Fps {
    num: number
    den: number
}
function versionFps(v: Pick<ReviewVersion, 'fpsNumerator' | 'fpsDenominator'>): Fps | null {
    return v.fpsNumerator != null && v.fpsDenominator != null ? { num: v.fpsNumerator, den: v.fpsDenominator } : null
}
function totalFrames(v: Pick<ReviewVersion, 'durationMs' | 'fpsNumerator' | 'fpsDenominator'>): number | null {
    const fps = versionFps(v)
    if (fps == null || v.durationMs == null) return null
    return Math.round((v.durationMs * fps.num) / (1000 * fps.den))
}
function frameToMs(frame: number, fps: Fps): number {
    return Math.round((frame * 1000 * fps.den) / fps.num)
}
function msToFrame(ms: number, fps: Fps): number {
    return Math.round((ms * fps.num) / (1000 * fps.den))
}

// ─────────────────────────── zod request schemas ───────────────────────────

const attachmentInputSchema = z.object({
    attachmentId: z.string().uuid(),
    fileName: z.string().min(1).max(255),
    mimeType: z.string().regex(/^image\//, 'image_only'),
    sizeBytes: z.number().int().positive().max(MAX_ATTACH_BYTES),
    width: z.number().int().positive().max(20000).optional(),
    height: z.number().int().positive().max(20000).optional(),
})

export const createCommentSchema = z
    .object({
        body: z.string().max(MAX_BODY).optional(),
        parentId: z.string().uuid().optional().nullable(),
        startFrame: z.number().int().min(0).optional().nullable(),
        endFrame: z.number().int().min(0).optional().nullable(),
        annotation: annotationSchema.optional(),
        isInternal: z.boolean().optional(),
        attachments: z.array(attachmentInputSchema).max(MAX_ATTACHMENTS).optional(),
        mentions: z.array(z.string().uuid()).max(50).optional(),
    })
    .strict()
export type CreateCommentInput = z.infer<typeof createCommentSchema>

export const editCommentSchema = z.object({ body: z.string().min(1).max(MAX_BODY) }).strict()

export const initiateAttachmentSchema = z
    .object({
        fileName: z.string().min(1).max(255),
        sizeBytes: z.union([z.number(), z.string()]), // BigInt serialized as string over the wire
        mimeType: z.string(),
    })
    .strict()

// One or more pictographic clusters with optional VS16 (️) / ZWJ (‍) /
// skin-tone modifiers. Explicit escapes only (no invisible chars in source).
const EMOJI_RE = /^(?:\p{Extended_Pictographic}(?:️|‍|[\u{1F3FB}-\u{1F3FF}])*)+$/u
export const reactionSchema = z
    .object({ emoji: z.string().min(1).max(24).refine((e) => EMOJI_RE.test(e), 'bad_emoji') })
    .strict()

// ─────────────────────────── access resolution ───────────────────────────

interface VersionCtx {
    version: ReviewVersion
    asset: ReviewAsset
    access: { userId: string; isAdmin: boolean }
    isImage: boolean
}

async function resolveVersionCtx(versionId: string): Promise<VersionCtx> {
    const version = await prisma.reviewVersion.findFirst({ where: { id: versionId, deletedAt: null } })
    if (!version) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy phiên bản.')
    const asset = await prisma.reviewAsset.findFirst({ where: { id: version.assetId, deletedAt: null } })
    if (!asset) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy asset.')
    const access = await requireReviewAccess({ workspaceId: asset.workspaceId })
    // [FR-03] editor chỉ đọc/ghi comment trên version trong phạm vi được giao — funnel này
    // gác MỌI entry point (list/create/edit/delete/resolve/reaction/attachment-raw). Out-of-scope
    // = không xem được → chặn cả đọc lẫn ghi + rò ảnh đính kèm R2.
    await assertVersionInScope(
        await getFolderScope({ userId: access.userId, workspaceId: asset.workspaceId, isAdmin: access.isAdmin }),
        version.id,
        'read',
    )
    return { version, asset, access, isImage: asset.mediaKind === 'IMAGE' }
}

async function resolveCommentCtx(commentId: string): Promise<{ comment: import('@prisma/client').ReviewComment } & VersionCtx> {
    const comment = await prisma.reviewComment.findFirst({ where: { id: commentId, deletedAt: null } })
    if (!comment) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy bình luận.')
    const ctx = await resolveVersionCtx(comment.versionId)
    return { comment, ...ctx }
}

// ─────────────────────────── batched serialization ───────────────────────────

async function loadUserRefs(userIds: (string | null | undefined)[]): Promise<Map<string, UserRef>> {
    const ids = Array.from(new Set(userIds.filter((x): x is string => !!x)))
    if (ids.length === 0) return new Map()
    const users = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, displayName: true, username: true, nickname: true, avatarUrl: true },
    })
    const map = new Map<string, UserRef>()
    for (const u of users) {
        const ref = toUserRef(u)
        if (ref) map.set(u.id, ref)
    }
    return map
}

type CommentRow = import('@prisma/client').ReviewComment

/** Serialize a batch of comment rows against one version's fps + the requesting user. */
async function serializeComments(rows: CommentRow[], version: ReviewVersion, meUserId: string): Promise<CommentDto[]> {
    if (rows.length === 0) return []
    const fps = versionFps(version)
    const ids = rows.map((r) => r.id)

    const [refs, attachRows, reactionRows] = await Promise.all([
        loadUserRefs(rows.flatMap((r) => [r.authorId, r.resolvedById])),
        prisma.commentAttachment.findMany({ where: { commentId: { in: ids } } }),
        prisma.commentReaction.findMany({ where: { commentId: { in: ids } } }),
    ])

    // attachments → stable app URLs (302→signed R2 on fetch, no per-poll signature churn).
    const attachByComment = new Map<string, CommentAttachmentDto[]>()
    for (const a of attachRows) {
        const list = attachByComment.get(a.commentId) ?? []
        list.push({ id: a.id, url: `${ATTACH_URL_PREFIX}/${a.id}/raw`, width: a.width ?? null, height: a.height ?? null })
        attachByComment.set(a.commentId, list)
    }

    // reactions → grouped by emoji with count + reactedByMe.
    const myKey = `u:${meUserId}`
    const reactByComment = new Map<string, Map<string, { count: number; mine: boolean }>>()
    for (const r of reactionRows) {
        const byEmoji = reactByComment.get(r.commentId) ?? new Map()
        const cur = byEmoji.get(r.emoji) ?? { count: 0, mine: false }
        cur.count += 1
        if (r.reactorKey === myKey) cur.mine = true
        byEmoji.set(r.emoji, cur)
        reactByComment.set(r.commentId, byEmoji)
    }
    const reactionsFor = (id: string): CommentReactionDto[] => {
        const byEmoji = reactByComment.get(id)
        if (!byEmoji) return []
        return Array.from(byEmoji.entries()).map(([emoji, v]) => ({ emoji, count: v.count, reactedByMe: v.mine }))
    }

    return rows.map((r) => {
        let startFrame: number | null = null
        let endFrame: number | null = null
        if (fps && r.timecodeMs != null) {
            startFrame = msToFrame(r.timecodeMs, fps)
            endFrame = r.durationMs != null ? msToFrame(r.timecodeMs + r.durationMs, fps) : null
        }
        return serializeComment(r, {
            author: r.authorId ? refs.get(r.authorId) ?? null : null,
            guestName: r.guestName ?? null,
            startFrame,
            endFrame,
            annotation: readAnnotationShapes(r.annotation),
            attachments: attachByComment.get(r.id) ?? [],
            reactions: reactionsFor(r.id),
            completedBy: r.resolvedById ? refs.get(r.resolvedById) ?? null : null,
        })
    })
}

// ─────────────────────────── list (panel + polling) ───────────────────────────

export interface ListCommentsResult {
    items: CommentDto[]
    deletedIds?: string[]
    otherVersions: { versionId: string; versionNumber: number; commentCount: number }[]
    nextCursor: string | null
    total: number
}

export interface ListCommentsOpts {
    since?: string
    sort?: 'timecode' | 'newest'
    filter?: 'unresolved' | 'internal' | 'public' | 'mine'
    authorId?: string
    q?: string
}

export async function listComments(versionId: string, opts: ListCommentsOpts = {}): Promise<ListCommentsResult> {
    const { version, asset, access } = await resolveVersionCtx(versionId)

    const filterWhere: Prisma.ReviewCommentWhereInput = { versionId }
    if (opts.filter === 'unresolved') filterWhere.resolvedAt = null
    if (opts.filter === 'internal') filterWhere.isInternal = true
    if (opts.filter === 'public') filterWhere.isInternal = false
    if (opts.filter === 'mine') filterWhere.authorId = access.userId
    if (opts.authorId) filterWhere.authorId = opts.authorId
    if (opts.q) filterWhere.body = { contains: opts.q, mode: 'insensitive' }

    let deletedIds: string[] | undefined
    if (opts.since) {
        const since = new Date(opts.since)
        // [CC4] Reject an unparseable ?since with 400 (mirror listGuestComments) — otherwise Invalid
        // Date flows into the Prisma DateTime filter and throws a 500 that masks the real client bug.
        if (Number.isNaN(since.getTime())) throw apiError(400, 'VALIDATION_ERROR', 'Invalid since timestamp.')
        // delta poll: rows created/updated after the mark that are still live…
        filterWhere.updatedAt = { gt: since }
        filterWhere.deletedAt = null
        // …plus ids deleted after the mark, so the client can drop them from cache.
        const gone = await prisma.reviewComment.findMany({
            where: { versionId, deletedAt: { gt: since } },
            select: { id: true },
        })
        deletedIds = gone.map((g) => g.id)
    } else {
        filterWhere.deletedAt = null
    }

    const orderBy: Prisma.ReviewCommentOrderByWithRelationInput[] =
        opts.sort === 'newest'
            ? [{ createdAt: 'desc' }]
            : [{ timecodeMs: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }]

    const rows = await prisma.reviewComment.findMany({ where: filterWhere, orderBy, take: 1000 })
    const items = await serializeComments(rows, version, access.userId)

    // Count of live comments on THIS version (excludes deleted; independent of filters).
    const total = await prisma.reviewComment.count({ where: { versionId, deletedAt: null } })

    const others = await prisma.reviewVersion.findMany({
        where: { assetId: asset.id, deletedAt: null, id: { not: versionId } },
        select: { id: true, versionNumber: true, commentCount: true },
        orderBy: { versionNumber: 'desc' },
    })

    return {
        items,
        ...(deletedIds ? { deletedIds } : {}),
        otherVersions: others.map((o) => ({ versionId: o.id, versionNumber: o.versionNumber, commentCount: o.commentCount })),
        nextCursor: null,
        total,
    }
}

// ─────────────────────────── create (+ reply) ───────────────────────────

export async function createComment(versionId: string, input: CreateCommentInput): Promise<{ comment: CommentDto }> {
    const { version, asset, access, isImage } = await resolveVersionCtx(versionId)
    if (version.pipelineStatus !== ReviewPipelineStatus.READY) {
        throw apiError(409, 'STATE_INVALID', 'Phiên bản chưa sẵn sàng để bình luận.', { reason: 'not_ready' })
    }

    const body = (input.body ?? '').trim()
    const hasAnnotation = !!input.annotation && input.annotation.length > 0
    const hasAttachments = !!input.attachments && input.attachments.length > 0
    if (!body && !hasAnnotation && !hasAttachments) {
        throw apiError(400, 'VALIDATION_ERROR', 'Bình luận phải có nội dung, hình vẽ hoặc ảnh đính kèm.')
    }

    // Reply: parent must be same version, live, and itself a top-level comment. Visibility inherited.
    let isInternal = input.isInternal ?? true
    if (input.parentId) {
        const parent = await prisma.reviewComment.findFirst({ where: { id: input.parentId, deletedAt: null } })
        if (!parent || parent.versionId !== versionId || parent.parentId) {
            throw apiError(400, 'VALIDATION_ERROR', 'Bình luận gốc không hợp lệ.', { field: 'parentId' })
        }
        isInternal = parent.isInternal // server FORCES inheritance (ignores client value)
    }

    // Timecode / range → ms. Only for video (images have no frames).
    let timecodeMs: number | null = null
    let durationMs: number | null = null
    if (!isImage && input.startFrame != null) {
        const fps = versionFps(version)
        if (!fps) throw apiError(409, 'STATE_INVALID', 'Phiên bản thiếu thông tin fps.', { reason: 'no_fps' })
        const tf = totalFrames(version)
        // Frames are 0-indexed → valid range is [0, tf-1]; frame tf does not exist.
        if (input.startFrame < 0 || (tf != null && input.startFrame >= tf)) {
            throw apiError(400, 'VALIDATION_ERROR', 'startFrame ngoài phạm vi video.', { field: 'startFrame' })
        }
        timecodeMs = frameToMs(input.startFrame, fps)
        if (input.endFrame != null) {
            if (input.endFrame <= input.startFrame || (tf != null && input.endFrame >= tf)) {
                throw apiError(400, 'VALIDATION_ERROR', 'endFrame phải lớn hơn startFrame và trong phạm vi.', { field: 'endFrame' })
            }
            durationMs = frameToMs(input.endFrame, fps) - timecodeMs
        }
    }

    // Annotation must attach to a frame (video) — or an image (single static frame).
    if (hasAnnotation && !isImage && timecodeMs == null) {
        throw apiError(400, 'VALIDATION_ERROR', 'Hình vẽ phải gắn với một mốc thời gian.', { field: 'annotation' })
    }

    // NOTE: `mentions` are accepted but NOT acted on in P4 — there is no mentions
    // column and no notification fan-out yet. Membership validation + notification
    // delivery land in P6 (§7). Accepting the array now keeps the client contract stable.

    // Claim attachments: object must exist in R2 under THIS user's prefix (ownership by key).
    const attachmentsToCreate: { r2Key: string; fileName: string; mimeType: string; sizeBytes: bigint; width: number | null; height: number | null }[] = []
    if (hasAttachments) {
        for (const a of input.attachments!) {
            const key = attachmentKey(access.userId, a.attachmentId, a.fileName)
            const head = await headObject(key)
            if (!head) throw apiError(400, 'VALIDATION_ERROR', 'Ảnh đính kèm chưa được tải lên.', { field: 'attachments', attachmentId: a.attachmentId })
            // Enforce the 10MB cap against the REAL object size (presign carries no
            // length constraint, so the client-claimed size is not trustworthy).
            if (head.size > MAX_ATTACH_BYTES) {
                throw apiError(413, 'FILE_TOO_LARGE', 'Ảnh đính kèm vượt quá 10MB.', { field: 'attachments', attachmentId: a.attachmentId })
            }
            attachmentsToCreate.push({
                r2Key: key,
                fileName: a.fileName,
                mimeType: a.mimeType,
                sizeBytes: BigInt(head.size || a.sizeBytes),
                width: a.width ?? null,
                height: a.height ?? null,
            })
        }
    }

    const commentId = randomUUID()
    const created = await prisma.$transaction(async (tx) => {
        const c = await tx.reviewComment.create({
            data: {
                id: commentId,
                versionId,
                parentId: input.parentId ?? null,
                body,
                timecodeMs,
                durationMs,
                annotation: hasAnnotation ? (toAnnotationEnvelope(input.annotation!) as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
                isInternal,
                authorId: access.userId,
            },
        })
        if (attachmentsToCreate.length) {
            await tx.commentAttachment.createMany({ data: attachmentsToCreate.map((a) => ({ ...a, commentId })) })
        }
        await tx.reviewVersion.update({ where: { id: versionId }, data: { commentCount: { increment: 1 } } })
        await recordActivity(tx, {
            type: REVIEW_ACTIVITY.COMMENT_CREATED,
            workspaceId: asset.workspaceId,
            taskId: asset.taskId,
            assetId: asset.id,
            versionId,
            commentId,
            actorUserId: access.userId,
            meta: { timecodeMs, isInternal, isReply: !!input.parentId },
        })
        return c
    })

    // FR-G02: @mention fan-out (P6 — the P4 TODO). The client sends resolved userIds;
    // validate each is REAL staff on the task's profile before notifying (defense in
    // depth — never notify an arbitrary uuid), exclude the author, and works for
    // INTERNAL comments too (a guest never sees internal comments, so mentioning an
    // internal teammate there is safe — AC2). Fire-and-forget.
    if (input.mentions?.length && asset.taskId) {
        const mentionIds = [...new Set(input.mentions)].filter((id) => id !== access.userId)
        if (mentionIds.length) {
            void (async () => {
                const task = await prisma.task.findUnique({ where: { id: asset.taskId! }, select: { profileId: true } })
                if (!task?.profileId) return
                const staff = await prisma.profileAccess.findMany({
                    where: { profileId: task.profileId, userId: { in: mentionIds }, role: { in: ['OWNER', 'ADMIN', 'USER'] } },
                    select: { userId: true },
                })
                await notifyReview({
                    recipientIds: staff.map((s) => s.userId),
                    excludeUserId: access.userId,
                    type: 'VIDEO_COMMENT_NEW',
                    title: 'Bạn được nhắc trong một bình luận review',
                    body: body ? body.slice(0, 140) : 'Xem hình vẽ / mốc thời gian trong bình luận.',
                    taskId: asset.taskId,
                    actorId: access.userId,
                    deepLinkUrl: reviewPlayerUrl({ workspaceId: asset.workspaceId, assetId: asset.id, versionId, commentId }),
                })
            })()
        }
    }

    // [Q2] comment_reply email (T3) — wired end-to-end but NO producer ever fired it. When STAFF post
    // a PUBLIC reply to a comment a GUEST authored, notify the /r/ subscribers so the guest learns the
    // team replied without re-opening the link. Only public replies to guest-authored public comments.
    if (input.parentId && !isInternal) {
        void (async () => {
            const parent = await prisma.reviewComment.findUnique({
                where: { id: input.parentId! },
                select: { guestSessionId: true, isInternal: true },
            })
            if (parent && parent.guestSessionId && !parent.isInternal) {
                await notifyGuestsOfAsset({ assetId: asset.id, event: 'comment_reply' }).catch(() => {})
            }
        })()
    }

    const [dto] = await serializeComments([created], version, access.userId)
    return { comment: dto }
}

// ─────────────────────────── edit (author only) ───────────────────────────

export async function editComment(commentId: string, body: string): Promise<{ comment: CommentDto }> {
    const { comment, version, access } = await resolveCommentCtx(commentId)
    if (comment.authorId !== access.userId) {
        throw apiError(403, 'FORBIDDEN', 'Chỉ tác giả được sửa bình luận này.')
    }
    const trimmed = body.trim()
    if (!trimmed) throw apiError(400, 'VALIDATION_ERROR', 'Nội dung không được để trống.')
    const updated = await prisma.reviewComment.update({
        where: { id: commentId },
        data: { body: trimmed, editedAt: new Date() },
    })
    const [dto] = await serializeComments([updated], version, access.userId)
    return { comment: dto }
}

// ─────────────────────────── delete (author OR admin) ───────────────────────────

export async function deleteComment(commentId: string): Promise<{ deleted: true }> {
    const { comment, asset, access } = await resolveCommentCtx(commentId)
    if (comment.authorId !== access.userId && !access.isAdmin) {
        throw apiError(403, 'FORBIDDEN', 'Không có quyền xóa bình luận này.')
    }
    const now = new Date()
    await prisma.$transaction(async (tx) => {
        // Deleting a top-level comment hides + soft-deletes its live replies too.
        const replyIds = comment.parentId
            ? []
            : (await tx.reviewComment.findMany({ where: { parentId: commentId, deletedAt: null }, select: { id: true } })).map((r) => r.id)
        const allIds = [commentId, ...replyIds]
        // [CC1] Guard on deletedAt:null and decrement by the rows we ACTUALLY changed — a concurrent
        // double-delete of the same comment would otherwise re-match the id-only WHERE and decrement
        // commentCount a second time (drifting the badge below the true live count, possibly negative).
        const { count } = await tx.reviewComment.updateMany({ where: { id: { in: allIds }, deletedAt: null }, data: { deletedAt: now } })
        if (count > 0) {
            await tx.reviewVersion.update({
                where: { id: comment.versionId },
                data: { commentCount: { decrement: count } },
            })
        }
        await recordActivity(tx, {
            type: 'comment.deleted',
            workspaceId: asset.workspaceId,
            assetId: asset.id,
            versionId: comment.versionId,
            commentId,
            actorUserId: access.userId,
            meta: { removed: count },
        })
    })
    return { deleted: true }
}

// ─────────────────────────── resolve / un-resolve ───────────────────────────

export async function setResolved(commentId: string, resolved: boolean): Promise<{ comment: CommentDto }> {
    const { comment, asset, version, access } = await resolveCommentCtx(commentId)
    if (comment.parentId) throw apiError(404, 'NOT_FOUND', 'Reply không thể resolve riêng.')
    const updated = await prisma.reviewComment.update({
        where: { id: commentId },
        data: resolved
            ? { resolvedAt: new Date(), resolvedById: access.userId }
            : { resolvedAt: null, resolvedById: null },
    })
    await prisma.reviewActivity.create({
        data: {
            type: resolved ? REVIEW_ACTIVITY.COMMENT_RESOLVED : REVIEW_ACTIVITY.COMMENT_REOPENED,
            workspaceId: asset.workspaceId,
            assetId: asset.id,
            versionId: comment.versionId,
            commentId,
            actorUserId: access.userId,
        },
    })
    const [dto] = await serializeComments([updated], version, access.userId)
    return { comment: dto }
}

// ─────────────────────────── reactions ───────────────────────────

export async function addReaction(commentId: string, emoji: string): Promise<{ reactions: CommentReactionDto[] }> {
    const { comment, version, access } = await resolveCommentCtx(commentId)
    const reactorKey = `u:${access.userId}`
    try {
        await prisma.commentReaction.create({
            data: { commentId, emoji, userId: access.userId, reactorKey },
        })
    } catch (e) {
        // Unique (commentId, reactorKey, emoji) → duplicate is a no-op (idempotent POST).
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e
    }
    // [CC3] Bump the comment's updatedAt so a delta poll (?since) re-fetches it with the new reaction.
    await prisma.$executeRaw`UPDATE "ReviewComment" SET "updatedAt" = now() WHERE "id" = ${commentId}`
    const [dto] = await serializeComments([comment], version, access.userId)
    return { reactions: dto.reactions }
}

export async function removeReaction(commentId: string, emoji: string): Promise<{ reactions: CommentReactionDto[] }> {
    const { comment, version, access } = await resolveCommentCtx(commentId)
    await prisma.commentReaction.deleteMany({ where: { commentId, reactorKey: `u:${access.userId}`, emoji } })
    // [CC3] Bump updatedAt so a delta poll (?since) re-fetches the comment with the reaction removed.
    await prisma.$executeRaw`UPDATE "ReviewComment" SET "updatedAt" = now() WHERE "id" = ${commentId}`
    const [dto] = await serializeComments([comment], version, access.userId)
    return { reactions: dto.reactions }
}

// ─────────────────────────── attachments ───────────────────────────

/** R2 key for a comment image. Ownership is embedded via userId → only the initiating
 *  user can re-derive (and thus claim) the same key at comment-create time. */
function attachmentKey(userId: string, attachmentId: string, fileName: string): string {
    const safe = fileName.replace(/[^\w.\-]+/g, '_').slice(0, 120)
    return `review-attach/${userId}/${attachmentId}/${safe}`
}

export async function initiateAttachment(input: {
    fileName: string
    sizeBytes: number | string
    mimeType: string
}): Promise<{ attachmentId: string; putUrl: string; expiresAt: string }> {
    const access = await requireReviewAccess()
    if (!/^image\//.test(input.mimeType)) {
        throw apiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Chỉ đính kèm được ảnh.')
    }
    const size = Number(input.sizeBytes)
    if (!Number.isFinite(size) || size <= 0 || size > MAX_ATTACH_BYTES) {
        throw apiError(413, 'FILE_TOO_LARGE', 'Ảnh vượt quá 10MB.')
    }
    const attachmentId = randomUUID()
    const key = attachmentKey(access.userId, attachmentId, input.fileName)
    const ttl = 60 * 60 // 1h to PUT
    const putUrl = await presignPutObject(key, input.mimeType, ttl)
    return { attachmentId, putUrl, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() }
}

/** Resolve a stored attachment → a fresh short-lived signed R2 GET (member-auth re-checked). */
export async function getAttachmentRawUrl(attachmentId: string): Promise<string> {
    const attach = await prisma.commentAttachment.findUnique({ where: { id: attachmentId } })
    if (!attach) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy ảnh.')
    // Re-check access through comment → version → asset → workspace.
    await resolveCommentCtx(attach.commentId)
    return presignGetObject(attach.r2Key, { expiresIn: 15 * 60 })
}
