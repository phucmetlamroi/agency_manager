// [Giải trí] Chuyển .srt của người dùng sang WebVTT.
//
// Trình duyệt KHÔNG đọc được SRT — thẻ <track> chỉ hiểu WebVTT. Chuyển ngay lúc
// tải lên (một lần) thay vì mỗi lần phát, và lưu bản VTT; SRT gốc không giữ.
//
// Hàm THUẦN, không dependency: thư viện chuyển sub nào cũng là một dep mới, mà
// thêm dep ⇒ postinstall chạy lại ⇒ từng đẩy nhầm schema vào production.

export interface SrtConvertResult {
    vtt: string
    cueCount: number
}

export class SubtitleParseError extends Error {}

/**
 * Khác biệt thật giữa SRT và VTT chỉ có ba điểm:
 *   1. VTT bắt buộc mở đầu bằng "WEBVTT"
 *   2. mốc thời gian dùng dấu CHẤM thay vì phẩy: 00:01:02,500 → 00:01:02.500
 *   3. VTT không cần số thứ tự cue (giữ lại cũng hợp lệ)
 * Ngoài ra còn phải dọn BOM và CRLF — hai thứ khiến trình duyệt bỏ qua cả tệp
 * mà không báo lỗi gì.
 */
export function srtToVtt(raw: string): SrtConvertResult {
    if (!raw.trim()) throw new SubtitleParseError('Tệp phụ đề rỗng.')

    let text = raw
        .replace(/^﻿/, '') // BOM
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')

    // Đã là VTT rồi (người dùng đưa nhầm .vtt đặt tên .srt) — chỉ chuẩn hoá lại.
    const alreadyVtt = /^\s*WEBVTT/.test(text)
    if (alreadyVtt) text = text.replace(/^\s*WEBVTT[^\n]*\n?/, '')

    const TIMING = /(\d{1,2}:\d{2}:\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2})[,.](\d{1,3})/g
    let cueCount = 0
    const body = text.replace(TIMING, (_m, a, ams, b, bms) => {
        cueCount++
        return `${a}.${ams.padEnd(3, '0')} --> ${b}.${bms.padEnd(3, '0')}`
    })

    if (cueCount === 0) {
        throw new SubtitleParseError('Không đọc được mốc thời gian nào — tệp có đúng định dạng .srt không?')
    }

    return { vtt: `WEBVTT\n\n${body.trim()}\n`, cueCount }
}
