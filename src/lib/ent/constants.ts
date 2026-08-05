// [Giải trí] Hằng số kho phim.

import { sanitizeFileName } from '@/lib/review/upload-helpers'

/**
 * Trần cho một tệp phim. Cao hơn hẳn trần 5 GiB của module Tệp vì đây là phim
 * đầy đủ (remux 4K hai tiếng dễ vượt 20 GB), và kho này không bán cho ai —
 * người duy nhất trả tiền lưu trữ là chủ hệ thống.
 * Ở mức part 50 MB (computePartSize cho tệp > 2 GB) thì 32 GiB ≈ 656 part,
 * còn xa trần 10.000 part của S3/R2.
 */
export const ENT_VIDEO_MAX_BYTES = BigInt(32) * BigInt(1024) ** BigInt(3)

/** Trần cho một tệp phụ đề .srt. Sub 3 tiếng thoại liên tục hiếm khi quá 200 KB. */
export const ENT_SUBTITLE_MAX_BYTES = 2 * 1024 * 1024

/** Phiên tải lên + URL ký sống 24h, giống module Tệp. */
export const ENT_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000

export const ENT_TITLE_MAX = 200

export function entSourceKey(videoId: string, fileName: string): string {
    return `ent/${videoId}/source/${sanitizeFileName(fileName)}`
}

export function entSubtitleKey(videoId: string, subtitleId: string): string {
    return `ent/${videoId}/subs/${subtitleId}.vtt`
}

/** Tên mặc định khi up: tên tệp bỏ đuôi, gọn lại cho vừa cột title. */
export function titleFromFileName(fileName: string): string {
    const dot = fileName.lastIndexOf('.')
    const base = (dot > 0 ? fileName.slice(0, dot) : fileName).trim()
    return (base || fileName.trim() || 'Chưa đặt tên').slice(0, ENT_TITLE_MAX)
}
