// [Review module P5.2] GUEST comment service (API-SPEC §5.5.4–5.5.5, FR-E07/E08).
// A deliberate parallel of comments.ts with the guest trust model baked in:
//   - every read carries `isInternal: false` IN THE SQL WHERE — internal comments
//     (and their deleted ids!) can never leave a /api/r/* response (invariant I8);
//   - every write FORCES isInternal=false + authorId=null + guestSessionId +
//     guestName snapshot + shareLinkId, whatever the client sent;
//   - a reply to an internal parent is the same 404 as a nonexistent parent —
//     the API never confirms internal comments exist;
//   - member authors serialize WITHOUT their user id (UserRef.id = '') — guests
//     get a display name + avatar, not an internal identifier.
// English messages throughout (guest-facing).

import { randomUUID } from 'crypto'
import { z } from 'zod'
import { Prisma, ReviewPipelineStatus, type GuestSession, type ReviewVersion } from '@prisma/client'
import { prisma } from '@/lib/db'
import { apiError } from './errors'
import { headObject, presignGetObject, presignPutObject } from './r2'
import { recordActivity, REVIEW_ACTIVITY } from './activity'
import { annotationSchema, toAnnotationEnvelope, readAnnotationShapes } from './annotation'
import { serializeComment, toUserRef, type CommentAttachmentDto, type CommentDto, type CommentReactionDto } from './dto'
import { assertVersionInShare } from './share-guest'
import type { ShareWithItems } from './share-auth'
import { notifyReview, resolveTaskRecipients, reviewPlayerUrl } from './notify'

const MAX_BODY = 5000
const MAX_ATTACHMENTS = 6
const MAX_ATTACH_BYTES = 10 * 1024 * 1024

// ─────────────────────────── zod schemas (guest requests) ───────────────────────────

const attachmentInputSchema = z.object({
    attachmentId: z.string().uuid(),
    fileName: z.string().min(1).max(255),
    mimeType: z.string().regex(/^image\//, 'image_only'),
    sizeBytes: z.number().int().positive().max(MAX_ATTACH_BYTES),
    width: z.number().int().positive().max(20000).optional(),
    height: z.number().int().positive().max(20000).optional(),
})

export const guestCreateCommentSchema = z
    .object({
        versionId: z.string().min(1),
        body: z.string().max(MAX_BODY).optional(),
        parentId: z.string().uuid().optional().nullable(),
        startFrame: z.number().int().min(0).optional().nullable(),
        endFrame: z.number().int().min(0).optional().nullable(),
        annotation: annotationSchema.optional(),
        attachments: z.array(attachmentInputSchema).max(MAX_ATTACHMENTS).optional(),
        // isInternal / mentions are NOT accepted — .strict() rejects injection attempts.
    })
    .strict()
export type GuestCreateCommentInput = z.infer<typeof guestCreateCommentSchema>

export const guestEditCommentSchema = z.object({ body: z.string().min(1).max(MAX_BODY) }).strict()

// ─────────────────────────── frame ↔ ms (rational fps) ───────────────────────────

interface Fps {
    num: number
    den: number
}
const versionFps = (v: Pick<ReviewVersion, 'fpsNumerator' | 'fpsDenominator'>): Fps | null =>
    v.fpsNumerator != null && v.fpsDenominator != null ? { num: v.fpsNumerator, den: v.fpsDenominator } : null
const totalFrames = (v: Pick<ReviewVersion, 'durationMs' | 'fpsNumerator' | 'fpsDenominator'>): number | null => {
    const fps = versionFps(v)
    return fps && v.durationMs != null ? Math.round((v.durationMs * fps.num) / (1000 * fps.den)) : null
}
const frameToMs = (frame: number, fps: Fps): number => Math.round((frame * 1000 * fps.den) / fps.num)
const msToFrame = (ms: number, fps: Fps): number => Math.round((ms * fps.num) / (1000 * fps.den))

// ─────────────────────────── serialization (guest view) ───────────────────────────

type CommentRow = Prisma.ReviewCommentGetPayload<Record<string, never>>

async function serializeGuestComments(
    slug: string,
    rows: CommentRow[],
    version: ReviewVersion,
    guest: GuestSession | null,
): Promise<CommentDto[]> {
    if (rows.length === 0) return []
    const fps = versionFps(version)
    const ids = rows.map((r) => r.id)

    const authorIds = Array.from(new Set(rows.flatMap((r) => [r.authorId, r.resolvedById]).filter((x): x is string => !!x)))
    const [users, attachRows, reactionRows] = await Promise.all([
        authorIds.length
            ? prisma.user.findMany({
                  where: { id: { in: authorIds } },
                  select: { id: true, displayName: true, username: true, nickname: true, avatarUrl: true },
              })
            : [],
        prisma.commentAttachment.findMany({ where: { commentId: { in: ids } } }),
        prisma.commentReaction.findMany({ where: { commentId: { in: ids } } }),
    ])
    // Strip the internal user id — guests get name + avatar only (§5.5.4).
    const refs = new Map(
        users.map((u) => {
            const ref = toUserRef(u)!
            return [u.id, { ...ref, id: '' }]
        }),
    )

    const attachByComment = new Map<string, CommentAttachmentDto[]>()
    for (const a of attachRows) {
        const list = attachByComment.get(a.commentId) ?? []
        // Guest-scoped stable URL (302 → signed R2); the internal /api/review/... raw
        // route is member-authed and would 401 for guests.
        list.push({
            id: a.id,
            url: `/api/r/${slug}/comment-attachments/${a.id}/raw`,
            width: a.width ?? null,
            height: a.height ?? null,
        })
        attachByComment.set(a.commentId, list)
    }

    const myKey = guest ? `g:${guest.id}` : null
    const reactByComment = new Map<string, Map<string, { count: number; mine: boolean }>>()
    for (const r of reactionRows) {
        const byEmoji = reactByComment.get(r.commentId) ?? new Map()
        const cur = byEmoji.get(r.emoji) ?? { count: 0, mine: false }
        cur.count += 1
        if (myKey && r.reactorKey === myKey) cur.mine = true
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

// ─────────────────────────── list (share panel + 5s polling) ───────────────────────────

export interface GuestListCommentsResult {
    items: CommentDto[]
    deletedIds?: string[]
    /** ids of comments the CURRENT guest may edit/delete (own, same session). */
    mineIds: string[]
    nextCursor: null
    total: number
}

export async function listGuestComments(
    share: ShareWithItems,
    versionId: string,
    opts: { since?: string } = {},
    guest: GuestSession | null,
): Promise<GuestListCommentsResult> {
    const { version } = await assertVersionInShare(share, versionId)

    // THE filter (I8): isInternal=false lives in SQL, on the live list AND the
    // deleted-ids delta — a deleted internal comment id is still internal.
    const where: Prisma.ReviewCommentWhereInput = { versionId, isInternal: false }
    let deletedIds: string[] | undefined
    if (opts.since) {
        const since = new Date(opts.since)
        if (Number.isNaN(since.getTime())) throw apiError(400, 'VALIDATION_ERROR', 'Invalid since timestamp.')
        where.updatedAt = { gt: since }
        where.deletedAt = null
        const gone = await prisma.reviewComment.findMany({
            where: { versionId, isInternal: false, deletedAt: { gt: since } },
            select: { id: true },
        })
        deletedIds = gone.map((g) => g.id)
    } else {
        where.deletedAt = null
    }

    const rows = await prisma.reviewComment.findMany({
        where,
        orderBy: [{ timecodeMs: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
        take: 1000,
    })
    const items = await serializeGuestComments(share.slug, rows, version, guest)
    const total = await prisma.reviewComment.count({ where: { versionId, isInternal: false, deletedAt: null } })

    return {
        items,
        ...(deletedIds ? { deletedIds } : {}),
        mineIds: guest ? rows.filter((r) => r.guestSessionId === guest.id).map((r) => r.id) : [],
        nextCursor: null,
        total,
    }
}

// ─────────────────────────── create (comment / reply) ───────────────────────────

export async function createGuestComment(
    share: ShareWithItems,
    guest: GuestSession,
    input: GuestCreateCommentInput,
): Promise<{ comment: CommentDto }> {
    if (!share.allowComments) {
        throw apiError(403, 'FORBIDDEN', 'Comments are turned off for this link.')
    }
    const { version, asset } = await assertVersionInShare(share, input.versionId)
    if (version.pipelineStatus !== ReviewPipelineStatus.READY) {
        throw apiError(409, 'STATE_INVALID', 'This version is not ready for comments yet.')
    }
    const isImage = asset.mediaKind === 'IMAGE'

    const body = (input.body ?? '').trim()
    const hasAnnotation = !!input.annotation && input.annotation.length > 0
    const hasAttachments = !!input.attachments && input.attachments.length > 0
    if (!body && !hasAnnotation && !hasAttachments) {
        throw apiError(400, 'VALIDATION_ERROR', 'A comment needs text, a drawing, or an image.')
    }

    // Reply: parent must be a PUBLIC, live, top-level comment on the same version.
    // An internal parent is indistinguishable from a missing one (anti-confirmation).
    if (input.parentId) {
        const parent = await prisma.reviewComment.findFirst({
            where: { id: input.parentId, deletedAt: null, isInternal: false, versionId: version.id, parentId: null },
            select: { id: true },
        })
        if (!parent) throw apiError(404, 'NOT_FOUND', 'This comment no longer exists.')
    }

    // Timecode / range → ms (video only) — same frame math as the member path.
    let timecodeMs: number | null = null
    let durationMs: number | null = null
    if (!isImage && input.startFrame != null) {
        const fps = versionFps(version)
        if (!fps) throw apiError(409, 'STATE_INVALID', 'This version is missing timing metadata.')
        const tf = totalFrames(version)
        if (input.startFrame < 0 || (tf != null && input.startFrame >= tf)) {
            throw apiError(400, 'VALIDATION_ERROR', 'The timestamp is outside the video.')
        }
        timecodeMs = frameToMs(input.startFrame, fps)
        if (input.endFrame != null) {
            if (input.endFrame <= input.startFrame || (tf != null && input.endFrame >= tf)) {
                throw apiError(400, 'VALIDATION_ERROR', 'The range end must be after its start and inside the video.')
            }
            durationMs = frameToMs(input.endFrame, fps) - timecodeMs
        }
    }
    if (hasAnnotation && !isImage && timecodeMs == null) {
        throw apiError(400, 'VALIDATION_ERROR', 'A drawing must be attached to a timestamp.')
    }

    // Claim attachments — key embeds THIS guest session (ownership by prefix).
    const attachmentsToCreate: { r2Key: string; fileName: string; mimeType: string; sizeBytes: bigint; width: number | null; height: number | null }[] = []
    if (hasAttachments) {
        for (const a of input.attachments!) {
            const key = guestAttachmentKey(guest.id, a.attachmentId, a.fileName)
            const head = await headObject(key)
            if (!head) throw apiError(400, 'VALIDATION_ERROR', 'An attached image has not finished uploading.')
            if (head.size > MAX_ATTACH_BYTES) {
                throw apiError(413, 'FILE_TOO_LARGE', 'An attached image is larger than 10MB.')
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
                versionId: version.id,
                parentId: input.parentId ?? null,
                body,
                timecodeMs,
                durationMs,
                annotation: hasAnnotation
                    ? (toAnnotationEnvelope(input.annotation!) as unknown as Prisma.InputJsonValue)
                    : Prisma.DbNull,
                isInternal: false, // FORCED — guests can never write internal (I8)
                authorId: null,
                guestSessionId: guest.id,
                guestName: guest.name,
                shareLinkId: share.id,
            },
        })
        if (attachmentsToCreate.length) {
            await tx.commentAttachment.createMany({ data: attachmentsToCreate.map((a) => ({ ...a, commentId })) })
        }
        await tx.reviewVersion.update({ where: { id: version.id }, data: { commentCount: { increment: 1 } } })
        await recordActivity(tx, {
            type: REVIEW_ACTIVITY.COMMENT_CREATED,
            workspaceId: asset.workspaceId,
            taskId: asset.taskId,
            assetId: asset.id,
            versionId: version.id,
            commentId,
            shareLinkId: share.id,
            guestSessionId: guest.id,
            guestName: guest.name,
            meta: {
                timecodeMs,
                isInternal: false,
                isReply: !!input.parentId,
                versionNumber: version.versionNumber,
                excerpt: body.slice(0, 120),
            },
        })
        return c
    })

    // FR-G02: a guest public comment notifies the task assignee + profile admins
    // (deep-link to the exact comment). Fire-and-forget — never block the guest.
    void (async () => {
        const rcpt = await resolveTaskRecipients(asset.taskId)
        await notifyReview({
            recipientIds: [rcpt.assigneeId, ...rcpt.adminUserIds],
            type: 'VIDEO_COMMENT_NEW',
            title: `${guest.name} đã bình luận trên bản v${version.versionNumber}`,
            body: body ? body.slice(0, 140) : 'Đã gửi hình vẽ / ảnh đính kèm.',
            taskId: asset.taskId,
            deepLinkUrl: reviewPlayerUrl({
                workspaceId: asset.workspaceId,
                assetId: asset.id,
                versionId: version.id,
                commentId,
            }),
        })
    })()

    const [dto] = await serializeGuestComments(share.slug, [created], version, guest)
    return { comment: dto }
}

// ─────────────────────────── edit / delete (own comment, live session) ───────────────────────────

async function resolveOwnGuestComment(share: ShareWithItems, guest: GuestSession, commentId: string) {
    const comment = await prisma.reviewComment.findFirst({
        where: { id: commentId, deletedAt: null, isInternal: false },
    })
    if (!comment) throw apiError(404, 'NOT_FOUND', 'This comment no longer exists.')
    // Scope: the comment's version must still be visible through THIS share.
    const { version } = await assertVersionInShare(share, comment.versionId)
    if (comment.guestSessionId !== guest.id) {
        throw apiError(403, 'FORBIDDEN', 'You can only edit your own comments.')
    }
    return { comment, version }
}

export async function editGuestComment(
    share: ShareWithItems,
    guest: GuestSession,
    commentId: string,
    body: string,
): Promise<{ comment: CommentDto }> {
    const { comment, version } = await resolveOwnGuestComment(share, guest, commentId)
    const trimmed = body.trim()
    if (!trimmed) throw apiError(400, 'VALIDATION_ERROR', 'The comment cannot be empty.')
    const updated = await prisma.reviewComment.update({
        where: { id: comment.id },
        data: { body: trimmed, editedAt: new Date() },
    })
    const [dto] = await serializeGuestComments(share.slug, [updated], version, guest)
    return { comment: dto }
}

export async function deleteGuestComment(
    share: ShareWithItems,
    guest: GuestSession,
    commentId: string,
): Promise<{ deleted: true }> {
    const { comment } = await resolveOwnGuestComment(share, guest, commentId)
    const now = new Date()
    await prisma.$transaction(async (tx) => {
        const replyIds = comment.parentId
            ? []
            : (
                  await tx.reviewComment.findMany({
                      where: { parentId: comment.id, deletedAt: null },
                      select: { id: true },
                  })
              ).map((r) => r.id)
        const allIds = [comment.id, ...replyIds]
        await tx.reviewComment.updateMany({ where: { id: { in: allIds } }, data: { deletedAt: now } })
        await tx.reviewVersion.update({
            where: { id: comment.versionId },
            data: { commentCount: { decrement: allIds.length } },
        })
    })
    return { deleted: true }
}

// ─────────────────────────── reactions (guest, public comments only) ───────────────────────────

export async function toggleGuestReaction(
    share: ShareWithItems,
    guest: GuestSession,
    commentId: string,
    emoji: string,
    add: boolean,
): Promise<{ reactions: CommentReactionDto[] }> {
    const comment = await prisma.reviewComment.findFirst({
        where: { id: commentId, deletedAt: null, isInternal: false },
    })
    if (!comment) throw apiError(404, 'NOT_FOUND', 'This comment no longer exists.')
    const { version } = await assertVersionInShare(share, comment.versionId)

    const reactorKey = `g:${guest.id}`
    if (add) {
        try {
            await prisma.commentReaction.create({
                data: { commentId, emoji, guestSessionId: guest.id, reactorKey },
            })
        } catch (e) {
            if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e
        }
    } else {
        await prisma.commentReaction.deleteMany({ where: { commentId, reactorKey, emoji } })
    }
    const [dto] = await serializeGuestComments(share.slug, [comment], version, guest)
    return { reactions: dto.reactions }
}

// ─────────────────────────── attachments (guest) ───────────────────────────

function guestAttachmentKey(guestSessionId: string, attachmentId: string, fileName: string): string {
    const safe = fileName.replace(/[^\w.\-]+/g, '_').slice(0, 120)
    return `review-attach/guest/${guestSessionId}/${attachmentId}/${safe}`
}

export async function initiateGuestAttachment(
    share: ShareWithItems,
    guest: GuestSession,
    input: { fileName: string; sizeBytes: number | string; mimeType: string },
): Promise<{ attachmentId: string; putUrl: string; expiresAt: string }> {
    if (!share.allowComments) throw apiError(403, 'FORBIDDEN', 'Comments are turned off for this link.')
    if (!/^image\//.test(input.mimeType)) {
        throw apiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only images can be attached.')
    }
    const size = Number(input.sizeBytes)
    if (!Number.isFinite(size) || size <= 0 || size > MAX_ATTACH_BYTES) {
        throw apiError(413, 'FILE_TOO_LARGE', 'Images must be 10MB or smaller.')
    }
    const attachmentId = randomUUID()
    const key = guestAttachmentKey(guest.id, attachmentId, input.fileName)
    const ttl = 60 * 60
    const putUrl = await presignPutObject(key, input.mimeType, ttl)
    return { attachmentId, putUrl, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() }
}

/** 302 target for a guest viewing an attachment — re-checks share scope + public visibility. */
export async function getGuestAttachmentRawUrl(share: ShareWithItems, attachmentId: string): Promise<string> {
    const attach = await prisma.commentAttachment.findUnique({
        where: { id: attachmentId },
        include: { comment: { select: { versionId: true, isInternal: true, deletedAt: true } } },
    })
    if (!attach || attach.comment.isInternal || attach.comment.deletedAt) {
        throw apiError(404, 'NOT_FOUND', 'Not found.')
    }
    await assertVersionInShare(share, attach.comment.versionId) // 404 if outside this share
    return presignGetObject(attach.r2Key, { expiresIn: 15 * 60 })
}
