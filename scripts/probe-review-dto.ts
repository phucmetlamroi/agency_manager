/**
 * [Review module P1.2] Unit-assert the DTO layer (no DB / no session needed).
 * serializeVersion + pipelineStatusToDto + reviewStateToDto + toUserRef.
 * Run: npx tsx scripts/probe-review-dto.ts
 */
import {
    serializeVersion, pipelineStatusToDto, reviewStateToDto, toUserRef,
} from '../src/lib/review/dto'

let ok = 0, fail = 0
const check = (name: string, cond: boolean, extra = '') => {
    (cond ? ok++ : fail++); console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`)
}

// pipeline + state maps (lowercase per API-SPEC §0.6)
check('pipeline UPLOADING→uploading', pipelineStatusToDto('UPLOADING' as never) === 'uploading')
check('pipeline PROCESSING→processing', pipelineStatusToDto('PROCESSING' as never) === 'processing')
check('pipeline READY→ready', pipelineStatusToDto('READY' as never) === 'ready')
check('pipeline FAILED→failed', pipelineStatusToDto('FAILED' as never) === 'failed')
check('state AWAITING_REVIEW→awaiting_review', reviewStateToDto('AWAITING_REVIEW' as never) === 'awaiting_review')
check('state CHANGES_REQUESTED→changes_requested', reviewStateToDto('CHANGES_REQUESTED' as never) === 'changes_requested')

// toUserRef uses app display rules (displayName → username)
const ref = toUserRef({ id: 'u1', displayName: 'Bảo Phúc', username: 'bao_phuc', avatarUrl: 'a.png' })
check('toUserRef name=displayName', ref?.name === 'Bảo Phúc', ref?.name)
check('toUserRef avatar passes through', ref?.avatarUrl === 'a.png')
check('toUserRef null → null', toUserRef(null) === null)
const ref2 = toUserRef({ id: 'u2', username: 'handle_only' })
check('toUserRef falls back to username', ref2?.name === 'handle_only' && ref2?.avatarUrl === null)

// serializeVersion — VIDEO still processing (media null, fps rational, sizeBytes string)
const now = new Date('2026-07-04T09:00:00.000Z')
const videoVersion = {
    id: 'v1', assetId: 'a1', versionNumber: 3, workspaceId: 'ws1',
    fileName: 'Bản Dựng v3.mp4', mediaKind: 'VIDEO', mimeType: 'video/mp4', sizeBytes: BigInt('1378519040'),
    pipelineStatus: 'PROCESSING', errorMessage: null, uploadedAt: now, readyAt: null,
    durationMs: 23857, fpsNumerator: 30000, fpsDenominator: 1001, width: 1920, height: 1080,
    videoCodec: 'h264', audioCodec: 'aac', r2Key: 'review/ws1/a1/v3/Ban_Dung_v3.mp4',
    muxAssetId: null, muxPlaybackId: null, thumbTime: null, thumbnailKey: null,
    reviewState: 'DRAFT', commentCount: 0, uploaderId: 'u1',
    deletedAt: null, deletedById: null, deleteBatchId: null, createdAt: now, updatedAt: now,
} as never

const dto = serializeVersion(videoVersion, { uploader: ref, media: null })
check('version originalName = fileName', dto.originalName === 'Bản Dựng v3.mp4', dto.originalName)
check('version sizeBytes is string', dto.sizeBytes === '1378519040' && typeof dto.sizeBytes === 'string')
check('version uploadStatus processing', dto.uploadStatus === 'processing')
check('version reviewState draft', dto.reviewState === 'draft')
check('version fps rational', JSON.stringify(dto.fps) === JSON.stringify({ num: 30000, den: 1001 }))
check('version dims', dto.width === 1920 && dto.height === 1080)
check('version media null while processing', dto.media === null)
check('version uploadedBy = ref', dto.uploadedBy?.id === 'u1')
check('version createdAt ISO', dto.createdAt === '2026-07-04T09:00:00.000Z')

// serializeVersion — IMAGE ready with no fps (null rational)
const imageVersion = { ...(videoVersion as object), mediaKind: 'IMAGE', pipelineStatus: 'READY', reviewState: 'AWAITING_REVIEW', fpsNumerator: null, fpsDenominator: null, durationMs: null } as never
const idto = serializeVersion(imageVersion, {})
check('image fps null', idto.fps === null)
check('image uploadStatus ready', idto.uploadStatus === 'ready')
check('image reviewState awaiting_review', idto.reviewState === 'awaiting_review')
check('image uploadedBy null when not passed', idto.uploadedBy === null)

// BigInt JSON-safety (apiJson replacer parity)
const json = JSON.stringify(dto, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
check('dto round-trips through JSON', JSON.parse(json).sizeBytes === '1378519040')

console.log(`\nRESULT: ${ok} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
