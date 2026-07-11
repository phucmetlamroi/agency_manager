// src/lib/display-name.ts
// [FR-E5] Display-name fallback — cấm lộ ID kỹ thuật thô `g_3d72f8055f21` ra UI.
// Tầng HIỂN THỊ thuần: không ghi ngược DB, không đổi giá trị lưu trữ (PHAM-VI-LOAI-BO §0.5).
// Nguồn spec: docs/mobile-redesign/02-DAC-TA-SAN-PHAM/PRD.md FR-E5.

/** OAuth/handle kỹ thuật do provider sinh: `g_` + hex (≥8). KHÔNG bao giờ hiển thị nguyên văn. */
const TECHNICAL_HANDLE = /^g_[0-9a-f]{8,}$/i

/** Có phải ID kỹ thuật thô (`g_<hex>`) không — dùng để lọc trước khi render. */
export function isTechnicalHandle(name?: string | null): boolean {
    return !!name && TECHNICAL_HANDLE.test(name.trim())
}

type NamedUser = {
    displayName?: string | null
    nickname?: string | null
    username?: string | null
} | null | undefined

/**
 * Tên người an toàn để hiển thị.
 * Ưu tiên: displayName → nickname (nếu không phải handle kỹ thuật) → username (nếu không phải handle) → fallback ổn định.
 * KHÔNG bao giờ trả về chuỗi `g_…` (FR-E5).
 *
 * @param opts.index  thứ tự ổn định (leaderboard/podium) → "Editor 2".
 * @param opts.fallback  nhãn tùy biến khi không có tên (vd "Chưa giao").
 */
export function getDisplayName(
    user: NamedUser,
    opts?: { index?: number; fallback?: string },
): string {
    if (!user) return opts?.fallback ?? 'Ẩn danh'

    const displayName = user.displayName?.trim()
    if (displayName) return displayName

    const nickname = user.nickname?.trim()
    if (nickname && !isTechnicalHandle(nickname)) return nickname

    const username = user.username?.trim()
    if (username && !isTechnicalHandle(username)) return username

    if (typeof opts?.index === 'number') return `Editor ${opts.index}`

    // User TỒN TẠI nhưng chỉ có handle kỹ thuật (g_<hex>): dẫn xuất nhãn ỔN ĐỊNH
    // (4 hex cuối). KHÔNG dùng fallback ('Chưa giao'/'—') ở đây — người này CÓ tồn tại,
    // chỉ là chưa đặt tên; hiển thị "Chưa giao" sẽ sai (task đã được giao). Fallback chỉ
    // dành cho user null (đã xử lý ở đầu) hoặc user rỗng hoàn toàn (không trường nào).
    const techHandle = username && isTechnicalHandle(username)
        ? username
        : nickname && isTechnicalHandle(nickname)
            ? nickname
            : null
    if (techHandle) return `Editor ${techHandle.replace(/^g_/i, '').slice(-4)}`

    // Không còn định danh nào (mọi trường rỗng) → fallback tùy biến hoặc mặc định.
    return opts?.fallback ?? 'Editor'
}
