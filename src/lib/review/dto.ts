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
} from '@prisma/client'
import { formatUserDisplay } from '@/lib/format-user'

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
}

/** Serialize a ReviewFolder → FolderDto. `createdBy` resolved by caller (batched). */
export function serializeFolder(
    folder: ReviewFolder,
    opts: { createdBy?: UserRef | null } = {},
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
