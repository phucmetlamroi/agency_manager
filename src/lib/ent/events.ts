// [Giải trí] Tên sự kiện Inngest của kho phim.
//
// File riêng, KHÔNG nằm trong ent/inngest.ts, vì upload-service import tên sự
// kiện còn inngest.ts import upload-service (janitor gọi expireEntInflightUpload)
// — để chung một file là vòng lặp import.

export const ENT_EVENTS = {
    /** Byte đã nằm trên R2, tới lượt tạo asset Mux. */
    UPLOAD_COMPLETED: 'ent/upload.completed',
    /** Webhook Mux có passthrough tiền tố `ent:` được chuyển hướng sang đây. */
    MUX_EVENT_RECEIVED: 'ent/mux.event.received',
} as const

/** Tiền tố passthrough phân biệt asset kho phim với asset module Tệp.
 *  Webhook Mux dùng nó để chọn đúng consumer — nhầm nhánh là video treo mãi. */
export const ENT_PASSTHROUGH_PREFIX = 'ent:'

export function entPassthrough(videoId: string): string {
    return `${ENT_PASSTHROUGH_PREFIX}${videoId}`
}

/** Trả videoId nếu passthrough thuộc kho phim, null nếu không. */
export function parseEntPassthrough(passthrough: unknown): string | null {
    if (typeof passthrough !== 'string') return null
    if (!passthrough.startsWith(ENT_PASSTHROUGH_PREFIX)) return null
    const id = passthrough.slice(ENT_PASSTHROUGH_PREFIX.length).trim()
    return id.length > 0 ? id : null
}
