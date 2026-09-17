// [Review module P1] MIME allowlist + size caps + magic-byte table.
// Source of truth: API-SPEC §2 + UPLOAD-PIPELINE §4.1/§4.2. Images/video ONLY.

/** Video MIME whitelist (UPLOAD-PIPELINE §4.1). mkv sometimes reports empty
 *  MIME — the API falls back to the extension for that case. */
export const VIDEO_MIME_ALLOWLIST = new Set<string>([
    'video/mp4',
    'video/x-m4v',
    'video/quicktime',
    'video/webm',
    'video/x-matroska',
    'video/x-msvideo',
    'video/mpeg',
    'video/3gpp',
    'video/x-ms-wmv',
])

/** Image MIME whitelist (UPLOAD-PIPELINE §4.2). HEIC/TIFF/SVG/RAW rejected on
 *  purpose (sharp can't decode HEIC/RAW on Vercel; SVG = XSS risk). */
export const IMAGE_MIME_ALLOWLIST = new Set<string>([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/bmp',
])

/**
 * [AUDIT HT-020] Cổng DUY NHẤT cho ảnh đính kèm bình luận (cả nhân viên lẫn khách).
 *
 * Trước đây bốn điểm vào chỉ kiểm `/^image\//` — mà `image/svg+xml` khớp tiền tố đó. SVG là tài
 * liệu chứ không phải ảnh bitmap: nó mang được `<script>`. Chính team đã CỐ Ý loại SVG ở luồng
 * upload bản dựng (chú thích 'SVG = XSS risk' ngay trên IMAGE_MIME_ALLOWLIST) — đây chỉ là bịt
 * nốt cửa còn hở, không phải quyết định mới.
 *
 * Dùng ALLOWLIST chứ không phải "chặn chữ svg": danh sách cấm chỉ chặn được những cách viết mà
 * người viết nghĩ ra, còn allowlist thì chặn mọi thứ không được gọi tên.
 *
 * ⚠️ HÀM NÀY KHÔNG PHẢI CHỐT CHẶN CHÍNH — đừng tưởng lầm như tôi đã tưởng.
 * Bản nháp đầu của chú thích này viết rằng giá trị trả về dùng "để ký ContentType", ám chỉ presign
 * ràng buộc được kiểu tệp lúc tải lên. SAI, và chính câu đó đẻ ra lỗ hổng: presigner của AWS đánh
 * dấu content-type là KHÔNG-KÝ-ĐƯỢC (S3RequestPresigner.prepareRequest), nên client PUT kiểu gì R2
 * lưu kiểu đó. Kiểm ở đây chỉ là vệ sinh đầu vào; nơi thật sự quyết định trình duyệt hiểu tệp là
 * gì nằm ở lúc PHỤC VỤ — `responseContentType` + `downloadFileName` trong presignGetObject.
 * (Nó cũng làm một việc nữa: nhờ chặn ở đây mà mọi hàng MỚI luôn có mimeType trong allowlist.)
 */

/**
 * Bí danh MIME mà một số máy Windows gửi lên. Chromium lấy `File.type` từ registry
 * (`HKCR\.jpg\Content Type`), và vài phần mềm ảnh ghi đè khoá đó thành `image/jpg` / `image/pjpeg`
 * — cả hai đều KHÔNG phải media type hợp lệ. Người dùng phần lớn dùng Windows nên chặn thẳng là
 * gây phiền vô cớ.
 *
 * ⚠️ Cố ý ánh xạ VỀ `image/jpeg` chứ KHÔNG thêm vào IMAGE_MIME_ALLOWLIST: giá trị trả về của hàm
 * này được phục vụ lại làm `Content-Type`, mà trả về `image/jpg` thì một số bộ giải mã từ chối.
 * Bí danh chỉ nới rộng cái được CHẤP NHẬN, không nới rộng cái được PHỤC VỤ.
 */
// Dùng Map chứ không phải object literal: khoá tra cứu do client kiểm soát, mà
// `({} as Record<string,string>)['__proto__']` trả về Object.prototype và `['constructor']` trả về
// một hàm — kiểu khai báo nói dối ngay lúc chạy. Map không có bề mặt prototype đó.
const IMAGE_MIME_ALIASES = new Map<string, string>([
    ['image/jpg', 'image/jpeg'],
    ['image/pjpeg', 'image/jpeg'],
])

export function canonicalAttachmentImageMime(mimeType: unknown): string | null {
    if (typeof mimeType !== 'string') return null
    const raw = mimeType.trim().toLowerCase()
    const m = IMAGE_MIME_ALIASES.get(raw) ?? raw
    return IMAGE_MIME_ALLOWLIST.has(m) ? m : null
}

/** Extensions we trust to be video when the browser sends an empty/generic MIME. */
export const VIDEO_EXT_FALLBACK = new Set<string>([
    'mkv', 'mp4', 'm4v', 'mov', 'webm', 'avi', 'mpeg', 'mpg', '3gp', 'wmv',
])

// Caps (API-SPEC §2 / error 413). Video 5GB (real-world max ~2GB), image 100MB.
export const VIDEO_MAX_BYTES = BigInt(5 * 1024 * 1024 * 1024)
export const IMAGE_MAX_BYTES = BigInt(100 * 1024 * 1024)
export const ATTACHMENT_MAX_BYTES = BigInt(10 * 1024 * 1024) // comment images (P4)

export type MediaKind = 'VIDEO' | 'IMAGE'

/**
 * Classify an upload from its MIME (+ filename fallback for empty-MIME mkv).
 * Returns null when neither list matches → caller responds 415.
 */
export function mediaKindFromMime(mimeType: string, fileName: string): MediaKind | null {
    const mime = (mimeType || '').toLowerCase().trim()
    if (VIDEO_MIME_ALLOWLIST.has(mime)) return 'VIDEO'
    if (IMAGE_MIME_ALLOWLIST.has(mime)) return 'IMAGE'
    // Empty/generic MIME (application/octet-stream, ''): trust a video extension.
    if (mime === '' || mime === 'application/octet-stream') {
        const ext = fileName.toLowerCase().split('.').pop() || ''
        if (VIDEO_EXT_FALLBACK.has(ext)) return 'VIDEO'
    }
    return null
}

/** Byte cap for a media kind. */
export function capForKind(kind: MediaKind): bigint {
    return kind === 'VIDEO' ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES
}
