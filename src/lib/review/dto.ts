// [Review module P1] API DTO shapes (API-SPEC §0.6) + serializers. One place
// that turns Prisma rows into the exact JSON the client contract expects.
// sizeBytes is emitted as a string (apiJson already BigInt-safes it, but the
// DTO type is `string` so callers building plain objects stay honest).

import type {
    ReviewPipelineStatus,
    ReviewState,
    ReviewVersion,
    ReviewFolder,
    ReviewAsset,
    ReviewMediaKind,
    ReviewComment,
} from '@prisma/client'
import { formatUserDisplay } from '@/lib/format-user'
import type { AnnotationShape } from './annotation'

export type { AnnotationShape } from './annotation'

export type UploadStatusDto = 'uploading' | 'uploaded' | 'processing' | 'ready' | 'failed'
export type ReviewStateDto = 'draft' | 'awaiting_review' | 'changes_requested' | 'approved'
export type ItemType = 'folder' | 'asset'
export type MediaKindDto = 'video' | 'image'

export interface UserRef {
    id: string
    name: string
    avatarUrl: string | null
}

export interface MediaLinks {
    posterUrl: string
    storyboardVttUrl: string
    playbackId: string
}

export interface VersionDto {
    id: string
    assetId: string
    versionNumber: number
    uploadStatus: UploadStatusDto
    reviewState: ReviewStateDto
    originalName: string
    sizeBytes: string
    durationMs: number | null
    fps: { num: number; den: number } | null
    width: number | null
    height: number | null
    commentCount: number
    uploadedBy: UserRef | null
    createdAt: string
    media: MediaLinks | null
}

const PIPELINE_TO_DTO: Record<ReviewPipelineStatus, UploadStatusDto> = {
    UPLOADING: 'uploading',
    UPLOADED: 'uploaded',
    PROCESSING: 'processing',
    READY: 'ready',
    FAILED: 'failed',
}

const STATE_TO_DTO: Record<ReviewState, ReviewStateDto> = {
    DRAFT: 'draft',
    AWAITING_REVIEW: 'awaiting_review',
    CHANGES_REQUESTED: 'changes_requested',
    APPROVED: 'approved',
}

export function pipelineStatusToDto(s: ReviewPipelineStatus): UploadStatusDto {
    return PIPELINE_TO_DTO[s]
}

export function reviewStateToDto(s: ReviewState): ReviewStateDto {
    return STATE_TO_DTO[s]
}

interface UserRefRow {
    id: string
    displayName?: string | null
    username?: string | null
    nickname?: string | null
    avatarUrl?: string | null
}

/** Build a UserRef from a user row (uses the app-wide display-name rules). */
export function toUserRef(user: UserRefRow | null | undefined): UserRef | null {
    if (!user) return null
    return { id: user.id, name: formatUserDisplay(user), avatarUrl: user.avatarUrl ?? null }
}

/**
 * Serialize a ReviewVersion → VersionDto. `uploader` is resolved by the caller
 * (versions carry only `uploaderId`, no relation). `media` is null until the
 * version is READY and a signed playback link is minted (P1.7).
 */
export function serializeVersion(
    version: ReviewVersion,
    opts: { uploader?: UserRef | null; commentCount?: number; media?: MediaLinks | null } = {},
): VersionDto {
    const fps =
        version.fpsNumerator != null && version.fpsDenominator != null
            ? { num: version.fpsNumerator, den: version.fpsDenominator }
            : null
    return {
        id: version.id,
        assetId: version.assetId,
        versionNumber: version.versionNumber,
        uploadStatus: pipelineStatusToDto(version.pipelineStatus),
        reviewState: reviewStateToDto(version.reviewState),
        originalName: version.fileName,
        sizeBytes: version.sizeBytes.toString(),
        durationMs: version.durationMs ?? null,
        fps,
        width: version.width ?? null,
        height: version.height ?? null,
        commentCount: opts.commentCount ?? version.commentCount,
        uploadedBy: opts.uploader ?? null,
        createdAt: version.createdAt.toISOString(),
        media: opts.media ?? null,
    }
}

const MEDIA_KIND_TO_DTO: Record<ReviewMediaKind, MediaKindDto> = {
    VIDEO: 'video',
    IMAGE: 'image',
}

/** One tile in a folder card's content mosaic (owner review 2026-07-22 — "folder mù").
 *  `poster` null → the UI shows a `kind` glyph (an image asset, a not-yet-Mux-ready video, or a
 *  sub-folder tile). */
export interface FolderPreviewTile {
    poster: string | null
    kind: 'video' | 'image' | 'folder'
}

export interface FolderDto {
    id: string
    workspaceId: string
    parentId: string | null
    name: string
    /** auto = created by task-upload (systemKey set); manual = user-created in the browser. */
    origin: 'manual' | 'auto'
    itemCount: number
    /** recursive subtree bytes, denormalized — emitted as string (BigInt-safe). */
    totalBytes: string
    /** null for auto-folders (createdById is null / system). */
    createdBy: UserRef | null
    createdAt: string
    rowVersion: number
    deletedAt: string | null
    /** Up to 2 content tiles + an overflow count, for the card mosaic. Absent = show the plain
     *  folder icon (e.g. an empty folder, or a folder-scoped editor for whom previews are gated). */
    preview?: { tiles: FolderPreviewTile[]; more: number } | null
}

/** Serialize a ReviewFolder → FolderDto. `createdBy` resolved by caller (batched). */
export function serializeFolder(
    folder: ReviewFolder,
    opts: { createdBy?: UserRef | null; preview?: FolderDto['preview'] } = {},
): FolderDto {
    return {
        id: folder.id,
        workspaceId: folder.workspaceId,
        parentId: folder.parentId,
        name: folder.name,
        origin: folder.systemKey ? 'auto' : 'manual',
        itemCount: folder.itemCount,
        totalBytes: folder.totalSizeBytes.toString(),
        createdBy: opts.createdBy ?? null,
        createdAt: folder.createdAt.toISOString(),
        rowVersion: folder.rowVersion,
        deletedAt: folder.deletedAt ? folder.deletedAt.toISOString() : null,
        preview: opts.preview ?? null,
    }
}

export interface AssetDto {
    id: string
    workspaceId: string
    folderId: string | null
    taskId: string | null
    clientId: string | null
    mediaKind: MediaKindDto
    /** display name — rename changes THIS, never a version's originalName. */
    title: string
    /** HustlyTasker task-status string on the card (read dynamically); null = unset. */
    statusKey: string | null
    currentVersionId: string | null
    versionCount: number
    /** comments across all live versions (internal + public) — UI-only counter. */
    commentCountTotal: number
    currentVersion: VersionDto | null
    createdBy: UserRef | null
    createdAt: string
    rowVersion: number
    deletedAt: string | null
}

/**
 * Serialize a ReviewAsset → AssetDto. The head `currentVersion` (serialized with
 * its media links), `createdBy`, `versionCount`, and `commentCountTotal` are all
 * resolved by the caller (batched) so one listing = a handful of round-trips.
 */
export function serializeAsset(
    asset: ReviewAsset,
    opts: {
        currentVersion?: VersionDto | null
        createdBy?: UserRef | null
        versionCount?: number
        commentCountTotal?: number
    } = {},
): AssetDto {
    return {
        id: asset.id,
        workspaceId: asset.workspaceId,
        folderId: asset.folderId,
        taskId: asset.taskId,
        clientId: asset.clientId,
        mediaKind: MEDIA_KIND_TO_DTO[asset.mediaKind],
        title: asset.name,
        statusKey: asset.statusId,
        currentVersionId: asset.currentVersionId,
        versionCount: opts.versionCount ?? 0,
        commentCountTotal: opts.commentCountTotal ?? 0,
        currentVersion: opts.currentVersion ?? null,
        createdBy: opts.createdBy ?? null,
        createdAt: asset.createdAt.toISOString(),
        rowVersion: asset.rowVersion,
        deletedAt: asset.deletedAt ? asset.deletedAt.toISOString() : null,
    }
}

// ─────────────────────────── comments (API-SPEC §4 / §0.6) ───────────────────────────

export interface CommentAttachmentDto {
    id: string
    url: string
    width: number | null
    height: number | null
}

export interface CommentReactionDto {
    emoji: string
    count: number
    reactedByMe: boolean
}

export interface CommentDto {
    id: string
    versionId: string
    parentId: string | null
    author: UserRef | null // null = guest
    guest: { name: string } | null // email is NEVER emitted (GDPR — ADMIN sees it only in ShareActivity)
    body: string
    startFrame: number | null // null = general comment (no timestamp) or an image asset
    endFrame: number | null // != null = range comment
    annotation: AnnotationShape[] | null
    isInternal: boolean
    attachments: CommentAttachmentDto[]
    reactions: CommentReactionDto[]
    completedAt: string | null
    completedBy: UserRef | null
    editedAt: string | null
    createdAt: string
}

/**
 * Serialize a ReviewComment → CommentDto. Frame numbers, resolved user refs,
 * signed attachment URLs, and grouped reactions are all computed by the caller
 * (comments.ts) — this stays a pure shape mapper (no crypto / no db here).
 * `startFrame`/`endFrame` are derived from the stored millisecond offsets against
 * the version fps by the caller; images pass both as null.
 */
export function serializeComment(
    comment: Pick<
        ReviewComment,
        'id' | 'versionId' | 'parentId' | 'body' | 'isInternal' | 'resolvedAt' | 'editedAt' | 'createdAt'
    >,
    opts: {
        author: UserRef | null
        guestName: string | null
        startFrame: number | null
        endFrame: number | null
        annotation: AnnotationShape[] | null
        attachments: CommentAttachmentDto[]
        reactions: CommentReactionDto[]
        completedBy: UserRef | null
    },
): CommentDto {
    return {
        id: comment.id,
        versionId: comment.versionId,
        parentId: comment.parentId,
        author: opts.author,
        guest: opts.guestName ? { name: opts.guestName } : null,
        body: comment.body,
        startFrame: opts.startFrame,
        endFrame: opts.endFrame,
        annotation: opts.annotation,
        isInternal: comment.isInternal,
        attachments: opts.attachments,
        reactions: opts.reactions,
        completedAt: comment.resolvedAt ? comment.resolvedAt.toISOString() : null,
        completedBy: opts.completedBy,
        editedAt: comment.editedAt ? comment.editedAt.toISOString() : null,
        createdAt: comment.createdAt.toISOString(),
    }
}
