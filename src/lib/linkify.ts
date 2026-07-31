// [Linkify] Tách một đoạn văn bản thuần thành các mảnh "chữ" và "link".
//
// Dùng cho nội dung DO NGƯỜI DÙNG NHẬP — kể cả khách vãng lai chưa đăng nhập bình luận qua
// link chia sẻ. Vì vậy hàm này cố ý trả về DỮ LIỆU chứ không trả về HTML: bên gọi dựng thẻ
// React từ các mảnh, nên React tự thoát ký tự và không có đường nào chèn được mã độc.
//
// TUYỆT ĐỐI KHÔNG đổi hàm này thành trả chuỗi HTML rồi nhét qua `dangerouslySetInnerHTML`.
// Đó chính là cách mọi bộ tự-động-tạo-link biến thành lỗ hổng.

export type LinkifySegment =
    | { type: 'text'; value: string }
    /** `value` = chữ hiển thị (giữ nguyên như người dùng gõ). `href` = địa chỉ đã chuẩn hoá. */
    | { type: 'link'; value: string; href: string }

// Chỉ bắt `http://`, `https://` và `www.`.
//
// Đây là lớp phòng thủ THỨ NHẤT và là lớp quan trọng nhất: `javascript:`, `data:`, `vbscript:`,
// `file:` KHÔNG khớp mẫu này nên không bao giờ trở thành link. Một bộ tạo link bắt mọi thứ
// dạng `<gì đó>:` là một lỗ XSS đang chờ ngày nổ.
//
// Dừng ở khoảng trắng và ở `<>"'` để một đoạn văn dài không bị nuốt thành một link khổng lồ.
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi

/**
 * Gỡ dấu câu bám đuôi mà gần như chắc chắn thuộc về CÂU VĂN chứ không thuộc về địa chỉ.
 *
 * Ví dụ phải xử đúng:
 *   "Xem ở https://vd.com/a."          -> dấu chấm KHÔNG thuộc link
 *   "(tham khảo https://vd.com)"        -> ngoặc đóng KHÔNG thuộc link
 *   "https://vi.wikipedia.org/wiki/A_(B)" -> ngoặc đóng CÓ thuộc link
 *
 * Cách phân biệt hai trường hợp ngoặc: đếm ngoặc mở và ngoặc đóng bên trong chuỗi đã bắt.
 * Thừa ngoặc đóng nghĩa là cái cuối cùng đến từ câu văn bao ngoài.
 */
export function trimUrlTail(raw: string, opts: { stripSemicolon?: boolean } = {}): string {
    const { stripSemicolon = true } = opts
    // `stripSemicolon: false` dành cho đường dựng HTML (src/lib/comment-markdown.ts): ở đó chuỗi
    // ĐÃ được thoát ký tự nên có thể kết thúc bằng `&quot;` hay `&amp;`. Cắt dấu `;` sẽ phá vỡ
    // thực thể HTML thành `&quot` — sai địa chỉ, và trông như lỗi ngẫu nhiên không ai truy ra được.
    const marks = stripSemicolon ? '.,;:!?' : '.,:!?'

    let s = raw
    while (s.length > 0) {
        const last = s[s.length - 1]

        if (marks.includes(last)) {
            s = s.slice(0, -1)
            continue
        }
        if (last === '"' || last === "'") {
            s = s.slice(0, -1)
            continue
        }
        if (last === ')' && count(s, ')') > count(s, '(')) {
            s = s.slice(0, -1)
            continue
        }
        if (last === ']' && count(s, ']') > count(s, '[')) {
            s = s.slice(0, -1)
            continue
        }
        break
    }
    return s
}

function count(s: string, ch: string): number {
    let n = 0
    for (const c of s) if (c === ch) n++
    return n
}

/**
 * Chuẩn hoá thành địa chỉ mở được. Trả `null` nếu chuỗi không phải địa chỉ web hợp lệ —
 * bên gọi phải coi `null` là "để nguyên làm chữ thường", KHÔNG được tạo link.
 *
 * Lớp phòng thủ THỨ HAI: dù mẫu ở trên đã chặn, vẫn kiểm lại giao thức sau khi phân tích.
 * Hai lớp vì đây là chỗ mà sai một lần là mở cửa cho mã chạy trong trình duyệt người khác.
 */
function toHref(matched: string): string | null {
    const candidate = /^www\./i.test(matched) ? `https://${matched}` : matched
    try {
        const u = new URL(candidate)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
        return u.toString()
    } catch {
        return null
    }
}

/**
 * Tách văn bản thành mảnh. Ghép `value` của mọi mảnh lại luôn ra ĐÚNG chuỗi gốc — không mất,
 * không thêm ký tự nào. Bên gọi dựa vào tính chất này để giữ nguyên xuống dòng và khoảng trắng.
 */
export function linkify(input: string): LinkifySegment[] {
    if (!input) return []

    const out: LinkifySegment[] = []
    let cursor = 0

    // `lastIndex` bị thay đổi trong vòng lặp nên tạo mẫu mới mỗi lần gọi — dùng chung một
    // đối tượng regex có cờ `g` giữa các lần gọi là nguồn lỗi kinh điển.
    const re = new RegExp(URL_PATTERN.source, 'gi')

    let m: RegExpExecArray | null
    while ((m = re.exec(input)) !== null) {
        const rawMatch = m[0]
        const start = m.index
        const display = trimUrlTail(rawMatch)

        // Cả chuỗi chỉ toàn dấu câu sau khi gỡ -> không phải link, bỏ qua.
        if (!display) continue

        const href = toHref(display)
        if (!href) {
            // Không phân tích được thì để nguyên làm chữ. Đẩy con trỏ tới hết chỗ đã khớp để
            // vòng sau không xét lại cùng một đoạn.
            continue
        }

        if (start > cursor) out.push({ type: 'text', value: input.slice(cursor, start) })
        out.push({ type: 'link', value: display, href })
        cursor = start + display.length

        // Phần đuôi đã gỡ (dấu chấm, ngoặc…) phải quay lại thành CHỮ, nên kéo con trỏ tìm
        // kiếm về đúng chỗ đó thay vì bỏ qua theo độ dài chuỗi khớp ban đầu.
        re.lastIndex = cursor
    }

    if (cursor < input.length) out.push({ type: 'text', value: input.slice(cursor) })
    return out
}

/** Có ít nhất một link không — để bên gọi bỏ qua hẳn phần dựng thẻ khi không cần. */
export function hasLink(input: string): boolean {
    return linkify(input).some((s) => s.type === 'link')
}
