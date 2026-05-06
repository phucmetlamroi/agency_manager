/**
 * Chat file upload validation rules — shared between client (UI) and server (action).
 * Hard cap: 100 MB per file across all categories.
 *
 * Allowed formats (per product spec):
 *   Video    : mp4, mov, avi
 *   Image    : webp, png, jpg, heic
 *   Audio    : mp3, wav, aac, ogg, wma
 *   Document : pdf, docx, xlsx, md, zip, pptx
 */

export const MAX_BYTES = 100 * 1024 * 1024 // 100 MB

export type FileCategory = 'video' | 'image' | 'audio' | 'doc'

export const VIDEO_TYPES: Record<string, string[]> = {
    'video/mp4': ['.mp4'],
    'video/quicktime': ['.mov'],
    'video/x-msvideo': ['.avi'],
    'video/avi': ['.avi'],
}

export const IMAGE_TYPES: Record<string, string[]> = {
    'image/webp': ['.webp'],
    'image/png': ['.png'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/heic': ['.heic'],
    'image/heif': ['.heic'],
}

export const AUDIO_TYPES: Record<string, string[]> = {
    'audio/mpeg': ['.mp3'],
    'audio/mp3': ['.mp3'],
    'audio/wav': ['.wav'],
    'audio/x-wav': ['.wav'],
    'audio/aac': ['.aac'],
    'audio/x-aac': ['.aac'],
    'audio/ogg': ['.ogg'],
    'audio/x-ms-wma': ['.wma'],
}

export const DOC_TYPES: Record<string, string[]> = {
    'application/pdf': ['.pdf'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
    'text/markdown': ['.md'],
    'text/x-markdown': ['.md'],
    'application/zip': ['.zip'],
    'application/x-zip-compressed': ['.zip'],
}

const CATEGORY_MAP: Record<FileCategory, Record<string, string[]>> = {
    video: VIDEO_TYPES,
    image: IMAGE_TYPES,
    audio: AUDIO_TYPES,
    doc: DOC_TYPES,
}

/** Comma-joined list for an HTML `<input accept="...">` attribute. */
export const ACCEPT_ATTRIBUTE = [
    ...Object.keys(VIDEO_TYPES),
    ...Object.keys(IMAGE_TYPES),
    ...Object.keys(AUDIO_TYPES),
    ...Object.keys(DOC_TYPES),
    ...Object.values(VIDEO_TYPES).flat(),
    ...Object.values(IMAGE_TYPES).flat(),
    ...Object.values(AUDIO_TYPES).flat(),
    ...Object.values(DOC_TYPES).flat(),
].join(',')

export interface ValidationResult {
    ok: boolean
    category?: FileCategory
    error?: string
}

/** Validate a file by MIME + extension + size. Used both client-side and server-side. */
export function validateChatFile(input: { name: string; type: string; size: number }): ValidationResult {
    if (input.size > MAX_BYTES) {
        return { ok: false, error: `File exceeds 100 MB limit (${(input.size / (1024 * 1024)).toFixed(1)} MB)` }
    }
    const ext = '.' + (input.name.split('.').pop() || '').toLowerCase()
    const mime = (input.type || '').toLowerCase()

    for (const [category, map] of Object.entries(CATEGORY_MAP) as [FileCategory, Record<string, string[]>][]) {
        const allowedExts = map[mime]
        if (allowedExts && allowedExts.includes(ext)) {
            return { ok: true, category }
        }
        // Fallback: extension match alone (some browsers report empty/wrong MIME).
        for (const exts of Object.values(map)) {
            if (exts.includes(ext)) {
                return { ok: true, category }
            }
        }
    }
    return { ok: false, error: `File type not supported (${ext || mime || 'unknown'})` }
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
