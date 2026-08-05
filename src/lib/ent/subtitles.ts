// [Giải trí] Chuyển .srt của người dùng sang WebVTT.
//
// Trình duyệt KHÔNG đọc được SRT — thẻ <track> chỉ hiểu WebVTT. Chuyển ngay lúc
// tải lên (một lần) thay vì mỗi lần phát, và lưu bản VTT.
//
// Hàm THUẦN, không dependency: thư viện chuyển sub nào cũng là một dep mới, mà
// thêm dep ⇒ postinstall chạy lại ⇒ từng đẩy nhầm schema vào production.
//
// ─── VÌ SAO VIẾT LẠI (rà soát 05/08/2026) ───────────────────────────────────
// Bản đầu dùng một lệnh replace regex trên cả tệp. Cue nào KHÔNG khớp regex thì
// được giữ nguyên dấu PHẨY — WebVTT không hiểu, trình duyệt lặng lẽ bỏ cue đó.
// Tệp trộn nhiều dạng mốc thời gian (rất hay gặp) ⇒ người xem thấy phụ đề chạy
// nhưng THIẾU CÂU, mà không ai được báo gì. Đã chứng minh bằng
// scripts/ent/test-srt-vtt.ts: tệp 3 cue chỉ nhận 2.
//
// Bản này phân tích theo TỪNG KHỐI và ĐẾM cue hỏng. Có cue hỏng ⇒ TỪ CHỐI cả
// tệp kèm số dòng. Thà bắt người dùng sửa tệp còn hơn để họ xem hết bộ phim rồi
// mới phát hiện mất thoại.

export interface SrtConvertResult {
    vtt: string
    cueCount: number
    /** Cảnh báo không chặn (ví dụ đã lược bỏ thẻ định dạng của ASS/SSA). */
    notes: string[]
}

export class SubtitleParseError extends Error {}

/**
 * Mốc thời gian ngoài đời gặp đủ kiểu:
 *   00:01:02,500   chuẩn SRT
 *   0:01:02,500    giờ 1 chữ số (nhiều công cụ xuất vậy)
 *   01:02,500      KHÔNG có trường giờ — WebVTT cho phép MM:SS.mmm
 *   00:01:02.500   dùng dấu chấm
 *   00:01:02,5     mili-giây 1–2 chữ số (phần thập phân của giây)
 *   00:01:02,5000  thừa chữ số
 *   00:01:02       không có mili-giây
 */
const TIME = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})(?:[,.](\d{1,6}))?$/
const ARROW = /-{2,}>|→/

/** Dòng có vẻ là mốc thời gian (để phân biệt với lời thoại khi báo lỗi). */
const LOOKS_LIKE_TIMING = /\d{1,3}:\d{1,2}[:,.]/

function parseStamp(raw: string): string | null {
    const m = TIME.exec(raw.trim())
    if (!m) return null
    const [, h, mm, ss, frac] = m
    const hours = Number(h ?? 0)
    const mins = Number(mm)
    const secs = Number(ss)
    if (mins > 59 || secs > 59) return null
    // Phần sau dấu phẩy là THẬP PHÂN của giây: ",5" = 500ms, không phải 5ms.
    const ms = frac ? Math.round(Number(`0.${frac}`) * 1000) : 0
    const pad = (n: number, w = 2) => String(n).padStart(w, '0')
    // Luôn xuất dạng đầy đủ HH:MM:SS.mmm — WebVTT nhận cả hai dạng, nhưng dạng
    // đầy đủ thì không phụ thuộc vào cách từng trình duyệt suy diễn.
    return `${pad(hours)}:${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`
}

/**
 * WebVTT coi "<" là mở thẻ. Lời thoại kiểu "5 < 10 và 3 > 2" sẽ bị trình duyệt
 * nuốt mất từ dấu "<" tới dấu ">" — MẤT CHỮ trên màn hình.
 * Giữ nguyên các thẻ WebVTT thật sự hiểu (<i> <b> <u> <v> <c> <ruby> <rt> <lang>)
 * cùng <font> hay gặp trong SRT, còn lại thì escape.
 */
const KNOWN_TAG = /^<\/?(?:i|b|u|v|c|ruby|rt|lang|font)(?:[ .:][^<>]*)?>$/i

function escapeCueText(line: string): string {
    // & trước, nếu không sẽ escape lại chính các thực thể vừa tạo.
    let out = line.replace(/&(?!(?:amp|lt|gt|nbsp|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;')
    out = out.replace(/<[^<>]*>|</g, (tok) => (KNOWN_TAG.test(tok) ? tok : tok.replace(/</g, '&lt;')))
    return out
}

/** Thẻ ghi đè kiểu ASS/SSA ({\an8}, {\pos(..)}) lọt vào .srt — WebVTT hiện nguyên văn. */
const ASS_OVERRIDE = /\{\\[^}]*\}/g

/**
 * Đọc byte thô của tệp phụ đề thành chuỗi, đoán bảng mã.
 *
 * Phụ đề tiếng Việt tải từ mạng rất hay lưu bằng UTF-16 (có BOM) hoặc bảng mã
 * cũ windows-1258. Đọc mù bằng UTF-8 sẽ ra chữ hỏng mà KHÔNG báo lỗi — người
 * dùng chỉ phát hiện khi đang xem phim.
 */
export function decodeSubtitleBytes(buf: ArrayBuffer): { text: string; encoding: string } {
    const bytes = new Uint8Array(buf)

    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' }
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' }
    }

    // UTF-8 nghiêm ngặt: sai một byte là ném, nhờ đó phát hiện được bảng mã cũ.
    try {
        return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' }
    } catch {
        /* rơi xuống các bảng mã cũ */
    }

    // windows-1258 là bảng mã tiếng Việt cũ; 1252 cho tệp phương Tây.
    for (const enc of ['windows-1258', 'windows-1252']) {
        try {
            const text = new TextDecoder(enc).decode(bytes)
            if (!text.includes('�')) return { text, encoding: enc }
        } catch {
            /* môi trường không có bảng mã này */
        }
    }

    throw new SubtitleParseError(
        'Không đọc được bảng mã của tệp phụ đề. Hãy mở bằng Notepad và lưu lại với mã hoá UTF-8 rồi tải lên lần nữa.',
    )
}

export function srtToVtt(raw: string): SrtConvertResult {
    if (!raw.trim()) throw new SubtitleParseError('Tệp phụ đề rỗng.')

    const notes: string[] = []
    let text = raw
        .replace(/^﻿/, '') // BOM còn sót sau khi giải mã
        .replace(/\r\n?/g, '\n')

    // Đã là VTT (người dùng đưa nhầm .vtt đặt tên .srt) — bỏ tiêu đề cũ đi rồi
    // dựng lại, để không có hai dòng WEBVTT.
    if (/^\s*WEBVTT/.test(text)) text = text.replace(/^\s*WEBVTT[^\n]*\n?/, '')

    // Dòng chỉ chứa khoảng trắng KHÔNG phải dòng trống với WebVTT — nó dính cue
    // sau vào lời thoại cue trước. Chuẩn hoá về rỗng thật.
    const lines = text.split('\n').map((l) => (l.trim() === '' ? '' : l.replace(/\s+$/, '')))

    const out: string[] = ['WEBVTT', '']
    const badLines: number[] = []
    let cueCount = 0
    let hadAssTags = false

    let i = 0
    while (i < lines.length) {
        if (lines[i] === '') {
            i++
            continue
        }

        // Số thứ tự cue (tuỳ chọn trong WebVTT) — bỏ qua, dòng kế mới là mốc giờ.
        if (/^\d+$/.test(lines[i]) && i + 1 < lines.length && ARROW.test(lines[i + 1])) i++

        const timingLine = lines[i]
        if (!ARROW.test(timingLine)) {
            // Rác giữa các cue: bỏ qua, nhưng nếu TRÔNG như mốc giờ thì phải báo —
            // đó chính là kiểu mất thoại âm thầm mà bản trước mắc phải.
            if (LOOKS_LIKE_TIMING.test(timingLine)) badLines.push(i + 1)
            i++
            continue
        }

        const [rawStart, rawEndAndSettings = ''] = timingLine.split(ARROW)
        // Phần sau mốc kết thúc có thể là cue settings của WebVTT (align, line…).
        const endParts = rawEndAndSettings.trim().split(/\s+/)
        const start = parseStamp(rawStart)
        const end = parseStamp(endParts[0] ?? '')
        if (!start || !end) {
            badLines.push(i + 1)
            i++
            continue
        }
        const settings = endParts.slice(1).join(' ')

        // Gom lời thoại tới dòng trống.
        i++
        const body: string[] = []
        while (i < lines.length && lines[i] !== '') {
            let line = lines[i]
            if (ASS_OVERRIDE.test(line)) {
                hadAssTags = true
                line = line.replace(ASS_OVERRIDE, '')
            }
            body.push(escapeCueText(line))
            i++
        }

        out.push(`${start} --> ${end}${settings ? ' ' + settings : ''}`)
        out.push(...body)
        out.push('')
        cueCount++
    }

    if (badLines.length) {
        const shown = badLines.slice(0, 5).join(', ')
        throw new SubtitleParseError(
            `Có ${badLines.length} dòng thời gian không đọc được (dòng ${shown}${badLines.length > 5 ? '…' : ''}). ` +
                `Nếu vẫn tải lên thì những câu thoại đó sẽ MẤT khi xem. Hãy kiểm tra lại tệp .srt.`,
        )
    }
    if (cueCount === 0) {
        throw new SubtitleParseError('Không đọc được mốc thời gian nào — tệp có đúng định dạng .srt không?')
    }
    if (hadAssTags) notes.push('Đã lược bỏ thẻ định dạng kiểu ASS/SSA ({\\an8}…) mà trình duyệt không hiểu.')

    return { vtt: out.join('\n'), cueCount, notes }
}
