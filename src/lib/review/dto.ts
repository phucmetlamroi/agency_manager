// [Review module P1] API DTO shapes (API-SPEC §0.6) + serializers. One place
// that turns Prisma rows into the exact JSON the client contract expects.
// sizeBytes is emitted as a string (apiJson already BigInt-safes it, but the
// DTO type is `string` so callers building plain objects stay honest).

import type { ReviewPipelineStatus, ReviewState, ReviewVersion } from '@prisma/client'
import { formatUserDisplay } from '@/lib/format-user'

export type UploadStatusDto = 'uploading' | 'uploaded' | 'processing' | 'ready' | 'failed'
export type ReviewStateDto = 'draft' | 'awaiting_review' | 'changes_requested' | 'approved'

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
