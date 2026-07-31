// [Review module P4.5] Client-side image-attachment upload for comments (PRD 1.5,
// API-SPEC §4). Two steps that mirror the P4.1 server contract: (1) initiate presigns
// a PUT to R2 under the caller's own userId prefix; (2) PUT the bytes directly to R2.
// ⚠️ [AUDIT HT-020] Chú thích cũ ở đây nói "PUT PHẢI gửi đúng Content-Type mà presign đã ký, nếu
// không R2 trả SignatureDoesNotMatch" — ĐIỀU ĐÓ SAI, và chính niềm tin sai này đã sinh ra lỗ hổng.
// @aws-sdk/s3-request-presigner đánh dấu content-type là KHÔNG-KÝ-ĐƯỢC (dist-cjs/index.js:47), nên
// chuỗi ký chỉ gồm `host`: client PUT với Content-Type nào cũng hợp lệ, và R2 lưu đúng cái đó.
// Nghĩa là kiểu tệp lúc lưu hoàn toàn do client định đoạt — chốt chặn phải nằm ở lúc PHỤC VỤ
// (`responseContentType` trong presignGetObject), không phải lúc tải lên. The
// fileName passed to initiate and later to createComment must match — the server
// re-derives the same R2 key from (userId, attachmentId, fileName) to claim the object.

import { initiateAttachment } from './comment-client'

export const MAX_ATTACHMENTS = 6
export const MAX_ATTACH_BYTES = 10 * 1024 * 1024 // 10MB (PRD 1.5)

/** The metadata shape createComment expects for each claimed attachment. */
export interface UploadedAttachment {
    attachmentId: string
    fileName: string
    mimeType: string
    sizeBytes: number
    width?: number
    height?: number
}

/** null = valid; otherwise a human-readable reason to reject the file. */
export function validateImageFile(file: File): string | null {
    if (!file.type || !file.type.startsWith('image/')) return 'Chỉ đính kèm được ảnh.'
    if (file.size <= 0) return 'File rỗng.'
    if (file.size > MAX_ATTACH_BYTES) return 'Ảnh vượt quá 10MB.'
    return null
}

/** Best-effort natural dimensions (for lightbox sizing); resolves {} on failure. */
function readImageSize(file: File): Promise<{ width?: number; height?: number }> {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file)
        const img = new Image()
        img.onload = () => {
            resolve({ width: img.naturalWidth || undefined, height: img.naturalHeight || undefined })
            URL.revokeObjectURL(url)
        }
        img.onerror = () => {
            resolve({})
            URL.revokeObjectURL(url)
        }
        img.src = url
    })
}

/**
 * Presign → PUT the image to R2 → return the metadata to hand to createComment.
 * `signal` lets the composer abort an in-flight upload if the user removes the chip.
 * `initiate` (P5.3) swaps the presign endpoint — guests use /api/r/{slug}/… .
 */
export async function uploadCommentImage(
    file: File,
    signal?: AbortSignal,
    initiate: typeof initiateAttachment = initiateAttachment,
): Promise<UploadedAttachment> {
    const mimeType = file.type
    const { attachmentId, putUrl } = await initiate({
        fileName: file.name,
        sizeBytes: file.size,
        mimeType,
    })
    const dims = await readImageSize(file)
    const res = await fetch(putUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': mimeType }, // MUST match the signed content-type
        signal,
    })
    if (!res.ok) throw new Error(`Tải ảnh thất bại (${res.status}).`)
    return { attachmentId, fileName: file.name, mimeType, sizeBytes: file.size, ...dims }
}
