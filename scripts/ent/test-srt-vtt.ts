/**
 * [Giải trí] Kiểm thử hàm chuyển .srt → WebVTT bằng các kiểu tệp THẬT ngoài đời.
 *
 * Chạy: npx tsx scripts/ent/test-srt-vtt.ts
 *
 * Đọc code không đủ để biết phụ đề có khớp video không — phải cho hàm ăn đúng
 * những biến thể mà tệp .srt tải từ mạng hay có: thiếu số 0 ở giờ, không có
 * trường giờ, mili-giây 2 chữ số, BOM, CRLF, thẻ định dạng, dòng trống thừa.
 */
import { srtToVtt, SubtitleParseError, decodeSubtitleBytes } from '../../src/lib/ent/subtitles'

let pass = 0
let fail = 0

function check(name: string, fn: () => void) {
    try {
        fn()
        pass++
        console.log(`  ✓ ${name}`)
    } catch (e) {
        fail++
        console.log(`  ✗ ${name}`)
        console.log(`      ${e instanceof Error ? e.message : String(e)}`)
    }
}

function expectCue(vtt: string, timing: string) {
    if (!vtt.includes(timing)) {
        throw new Error(`thiếu mốc "${timing}"\n--- đầu ra ---\n${vtt}`)
    }
}

console.log('\n=== 1. SRT chuẩn ===')
check('mốc giờ đầy đủ, mili-giây 3 chữ số', () => {
    const { vtt, cueCount } = srtToVtt(
        '1\n00:00:01,000 --> 00:00:04,500\nXin chào\n\n2\n00:01:02,250 --> 00:01:05,000\nTạm biệt\n',
    )
    if (cueCount !== 2) throw new Error(`cueCount = ${cueCount}, cần 2`)
    if (!vtt.startsWith('WEBVTT')) throw new Error('thiếu dòng WEBVTT')
    expectCue(vtt, '00:00:01.000 --> 00:00:04.500')
    expectCue(vtt, '00:01:02.250 --> 00:01:05.000')
})

console.log('\n=== 2. Biến thể mốc thời gian ngoài đời ===')
check('giờ 1 chữ số: 0:00:01,000 → chuẩn hoá về 2 chữ số', () => {
    const { vtt } = srtToVtt('1\n0:00:01,000 --> 0:00:04,500\nA\n')
    expectCue(vtt, '00:00:01.000 --> 00:00:04.500')
})

check('KHÔNG có trường giờ: 00:01,000 (dạng MM:SS)', () => {
    const { vtt, cueCount } = srtToVtt('1\n00:01,000 --> 00:04,500\nA\n')
    if (cueCount !== 1) throw new Error(`cueCount = ${cueCount}, cần 1 — cue này bị BỎ QUA`)
    expectCue(vtt, '00:00:01.000 --> 00:00:04.500')
})

check('mili-giây 2 chữ số: 00:00:01,25', () => {
    const { vtt } = srtToVtt('1\n00:00:01,25 --> 00:00:04,5\nA\n')
    // ,25 nghĩa là 0,25 giây = 250ms → phải thành .250 chứ không phải .025
    expectCue(vtt, '00:00:01.250 --> 00:00:04.500')
})

check('mili-giây 4 chữ số: 00:00:01,2500', () => {
    const { vtt } = srtToVtt('1\n00:00:01,2500 --> 00:00:04,0000\nA\n')
    expectCue(vtt, '00:00:01.250 --> 00:00:04.000')
})

check('không có mili-giây: 00:00:01 --> 00:00:04', () => {
    const { vtt } = srtToVtt('1\n00:00:01 --> 00:00:04\nA\n')
    expectCue(vtt, '00:00:01.000 --> 00:00:04.000')
})

check('dùng dấu chấm thay phẩy (một số công cụ xuất kiểu này)', () => {
    const { vtt } = srtToVtt('1\n00:00:01.000 --> 00:00:04.500\nA\n')
    expectCue(vtt, '00:00:01.000 --> 00:00:04.500')
})

check('khoảng trắng lạ quanh mũi tên', () => {
    const { vtt } = srtToVtt('1\n00:00:01,000    -->   00:00:04,500\nA\n')
    expectCue(vtt, '00:00:01.000 --> 00:00:04.500')
})

console.log('\n=== 3. Bảng mã & xuống dòng ===')
check('BOM ở đầu tệp', () => {
    const { vtt, cueCount } = srtToVtt('﻿1\n00:00:01,000 --> 00:00:04,500\nA\n')
    if (cueCount !== 1) throw new Error('BOM làm hỏng cue')
    if (!vtt.startsWith('WEBVTT')) throw new Error(`không bắt đầu bằng WEBVTT: ${JSON.stringify(vtt.slice(0, 12))}`)
})

check('CRLF (tệp làm trên Windows)', () => {
    const { vtt, cueCount } = srtToVtt('1\r\n00:00:01,000 --> 00:00:04,500\r\nA\r\n\r\n')
    if (cueCount !== 1) throw new Error('CRLF làm hỏng cue')
    if (vtt.includes('\r')) throw new Error('còn sót ký tự CR')
})

check('tiếng Việt có dấu', () => {
    const { vtt } = srtToVtt('1\n00:00:01,000 --> 00:00:04,500\nĐừng nói nữa, tôi mệt rồi!\n')
    if (!vtt.includes('Đừng nói nữa')) throw new Error('mất chữ tiếng Việt')
})

console.log('\n=== 4. Nội dung lời thoại đặc biệt ===')
check('thẻ nghiêng <i> (WebVTT cũng hiểu)', () => {
    const { vtt } = srtToVtt('1\n00:00:01,000 --> 00:00:04,500\n<i>thì thầm</i>\n')
    if (!vtt.includes('<i>thì thầm</i>')) throw new Error('mất thẻ <i>')
})

check('dấu < và & trong lời thoại phải được escape (nếu không WebVTT nuốt chữ)', () => {
    const { vtt } = srtToVtt('1\n00:00:01,000 --> 00:00:04,500\n5 < 10 & 3 > 2\n')
    if (!vtt.includes('5 &lt; 10 &amp; 3 > 2')) {
        throw new Error(`chưa escape đúng:\n${vtt}`)
    }
})

check('thực thể có sẵn không bị escape hai lần', () => {
    const { vtt } = srtToVtt('1\n00:00:01,000 --> 00:00:04,500\nTom &amp; Jerry\n')
    if (vtt.includes('&amp;amp;')) throw new Error('escape hai lần')
})

check('thẻ ASS/SSA {\\an8} bị lược bỏ', () => {
    const { vtt, notes } = srtToVtt('1\n00:00:01,000 --> 00:00:04,500\n{\\an8}Trên đỉnh màn hình\n')
    if (vtt.includes('{\\an8}')) throw new Error('còn sót thẻ ASS')
    if (!vtt.includes('Trên đỉnh màn hình')) throw new Error('mất lời thoại')
    if (!notes.length) throw new Error('không có ghi chú cảnh báo')
})

check('nhiều dòng trong một cue', () => {
    const { vtt } = srtToVtt('1\n00:00:01,000 --> 00:00:04,500\nDòng một\nDòng hai\n')
    if (!vtt.includes('Dòng một\nDòng hai')) throw new Error('mất xuống dòng trong cue')
})

console.log('\n=== 5. Trường hợp phải BÁO LỖI ===')
check('tệp rỗng', () => {
    try {
        srtToVtt('   ')
        throw new Error('đáng lẽ phải ném lỗi')
    } catch (e) {
        if (!(e instanceof SubtitleParseError)) throw new Error('sai loại lỗi')
    }
})

check('tệp không phải phụ đề', () => {
    try {
        srtToVtt('đây chỉ là một đoạn văn bản bình thường\nkhông có mốc thời gian nào')
        throw new Error('đáng lẽ phải ném lỗi')
    } catch (e) {
        if (!(e instanceof SubtitleParseError)) throw new Error('sai loại lỗi')
    }
})

console.log('\n=== 6. Tệp .vtt đưa nhầm vào ===')
check('đã là WEBVTT rồi thì không nhân đôi tiêu đề', () => {
    const { vtt } = srtToVtt('WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.500\nA\n')
    const count = (vtt.match(/WEBVTT/g) ?? []).length
    if (count !== 1) throw new Error(`có ${count} dòng WEBVTT, cần đúng 1`)
})

console.log('\n=== 7. TRỘN nhiều dạng trong CÙNG một tệp (hay gặp nhất) ===')
check('cue dạng có giờ + cue dạng không giờ trong một tệp', () => {
    const { cueCount } = srtToVtt(
        '1\n00:00:01,000 --> 00:00:04,500\nA\n\n2\n00:05,000 --> 00:08,000\nB\n\n3\n00:00:10,000 --> 00:00:12,000\nC\n',
    )
    if (cueCount !== 3) throw new Error(`chỉ nhận ${cueCount}/3 cue — có cue bị BỎ QUA, phụ đề sẽ MẤT CÂU`)
})

check('dòng phân cách chỉ chứa khoảng trắng vẫn tách được cue', () => {
    const { cueCount } = srtToVtt('1\n00:00:01,000 --> 00:00:04,500\nA\n   \n2\n00:00:05,000 --> 00:00:08,000\nB\n')
    if (cueCount !== 2) throw new Error(`chỉ nhận ${cueCount}/2 cue`)
})

check('mốc giờ HỎNG phải TỪ CHỐI cả tệp, không âm thầm bỏ cue', () => {
    try {
        srtToVtt('1\n00:00:01,000 --> 00:00:04,500\nA\n\n2\n99:99:99,xxx --> 00:00:08,000\nB\n')
        throw new Error('đáng lẽ phải ném lỗi thay vì lặng lẽ bỏ cue 2')
    } catch (e) {
        if (!(e instanceof SubtitleParseError)) throw new Error('sai loại lỗi')
        if (!/dòng/.test(e.message)) throw new Error(`thông báo không chỉ ra dòng nào: ${e.message}`)
    }
})

console.log('\n=== 8. Bảng mã tệp thật (byte thô) ===')
check('UTF-16LE có BOM đọc được', () => {
    const src = '1\n00:00:01,000 --> 00:00:04,500\nĐừng đi\n'
    const body = Buffer.from(src, 'utf16le')
    const withBom = Buffer.concat([Buffer.from([0xff, 0xfe]), body])
    const { text, encoding } = decodeSubtitleBytes(
        withBom.buffer.slice(withBom.byteOffset, withBom.byteOffset + withBom.byteLength) as ArrayBuffer,
    )
    if (encoding !== 'utf-16le') throw new Error(`đoán nhầm bảng mã: ${encoding}`)
    if (!srtToVtt(text).vtt.includes('Đừng đi')) throw new Error('mất chữ tiếng Việt')
})

check('UTF-8 thường vẫn nhận đúng', () => {
    const b = Buffer.from('1\n00:00:01,000 --> 00:00:04,500\nXin chào\n', 'utf8')
    const { encoding } = decodeSubtitleBytes(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
    if (encoding !== 'utf-8') throw new Error(`đoán nhầm bảng mã: ${encoding}`)
})

check('byte KHÔNG hợp lệ UTF-8 không bị nuốt thành chữ hỏng', () => {
    // 0xC0 0x41 không phải chuỗi UTF-8 hợp lệ → phải rơi sang bảng mã cũ, KHÔNG
    // được trả về chuỗi đầy ký tự thay thế.
    const b = Buffer.from([0x31, 0x0a, 0xc0, 0x41, 0x0a])
    const { text, encoding } = decodeSubtitleBytes(
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
    )
    if (encoding === 'utf-8') throw new Error('nhận nhầm là UTF-8')
    if (text.includes('�')) throw new Error('vẫn còn ký tự hỏng')
})

console.log(`\n──────────────────────────────\nĐẠT ${pass} · HỎNG ${fail}\n`)
process.exit(fail > 0 ? 1 : 0)
