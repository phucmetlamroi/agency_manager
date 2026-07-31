/**
 * [Linkify] Kiểm thử bộ tách link cho bình luận review video.
 *
 * Chạy: npx tsx scripts/test-linkify.ts   (hoặc: npm run test:linkify)
 *
 * Không chạm database, không chạm mạng. Chỉ kiểm hàm thuần.
 */
import { linkify, hasLink, type LinkifySegment } from '../src/lib/linkify'

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string) {
    if (ok) {
        pass++
        console.log(`  ✓ ${name}`)
    } else {
        fail++
        console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`)
    }
}

function links(input: string): { text: string; href: string }[] {
    return linkify(input)
        .filter((s): s is Extract<LinkifySegment, { type: 'link' }> => s.type === 'link')
        .map((s) => ({ text: s.value, href: s.href }))
}

/** Bất biến quan trọng nhất: ghép mọi mảnh lại phải ra ĐÚNG chuỗi gốc. */
function reassembles(input: string): boolean {
    return linkify(input).map((s) => s.value).join('') === input
}

console.log('\n── Trường hợp cơ bản ──')
{
    check('văn bản thuần không sinh link', links('Sửa lại đoạn mở đầu giúp anh').length === 0)
    check('bắt được https', links('Xem https://vd.com/a')[0]?.href === 'https://vd.com/a')

    const w = links('Xem www.vd.com')[0]
    check('www. được thêm https:// vào href', w?.href === 'https://www.vd.com/', `href=${w?.href}`)
    check('www. vẫn HIỂN THỊ đúng như người dùng gõ', w?.text === 'www.vd.com', `text=${w?.text}`)
}

console.log('\n── Dấu câu bám đuôi (chỗ mọi bộ tạo link hay sai) ──')
{
    const a = links('Tham khảo ở https://vd.com/a.')[0]
    check('dấu chấm cuối câu KHÔNG thuộc link', a?.text === 'https://vd.com/a', `text=${a?.text}`)

    const b = links('Xem (https://vd.com) nhé')[0]
    check('ngoặc đóng bao ngoài KHÔNG thuộc link', b?.text === 'https://vd.com', `text=${b?.text}`)

    const c = links('https://vi.wikipedia.org/wiki/Phim_(1995)')[0]
    check(
        'ngoặc đóng CÂN BẰNG thì THUỘC link',
        c?.text === 'https://vi.wikipedia.org/wiki/Phim_(1995)',
        `text=${c?.text}`,
    )

    const d = links('link: https://vd.com/a?b=1, còn lại thì ok')[0]
    check('dấu phẩy KHÔNG thuộc link', d?.text === 'https://vd.com/a?b=1', `text=${d?.text}`)

    const e = links('Đúng chưa https://vd.com/x?')[0]
    check('dấu hỏi cuối câu KHÔNG thuộc link', e?.text === 'https://vd.com/x', `text=${e?.text}`)
}

console.log('\n── An toàn: giao thức nguy hiểm KHÔNG bao giờ thành link ──')
{
    for (const evil of [
        'javascript:alert(1)',
        'JavaScript:alert(1)',
        'data:text/html;base64,PHNjcmlwdD4=',
        'vbscript:msgbox(1)',
        'file:///etc/passwd',
        'javascript:void(0)',
    ]) {
        check(`"${evil.slice(0, 28)}" KHÔNG thành link`, links(`bấm ${evil} đi`).length === 0)
    }
    // Trường hợp hiểm: giao thức độc GẮN SAU một chuỗi trông giống link.
    check(
        'javascript: nằm sau chữ vẫn không thành link',
        links('xem javascript:alert(document.cookie)').length === 0,
    )
}

console.log('\n── Nhiều link, tiếng Việt có dấu, xuống dòng ──')
{
    const many = links('Ref 1 https://a.com và ref 2 https://b.com/x nhé')
    check('bắt được cả hai link', many.length === 2, `đếm được ${many.length}`)
    check('link thứ nhất đúng', many[0]?.text === 'https://a.com')
    check('link thứ hai đúng', many[1]?.text === 'https://b.com/x')

    const vn = 'Đoạn 00:12 bị lệch màu, đối chiếu https://vd.com/màu nhé anh'
    check('tiếng Việt có dấu không làm hỏng việc tách', links(vn).length === 1)

    const multi = 'Dòng 1 https://a.com\nDòng 2\n\nDòng 3 https://b.com'
    check('xuống dòng được giữ nguyên', reassembles(multi))
    check('bắt link qua nhiều dòng', links(multi).length === 2)
}

console.log('\n── Bất biến: ghép lại phải ra đúng chuỗi gốc ──')
{
    const samples = [
        '',
        'không có link',
        'https://vd.com',
        'đầu https://vd.com/a. giữa https://vd.com/b, cuối',
        '(https://vd.com)',
        'javascript:alert(1)',
        'www.vd.com và https://vd.com',
        'Xem ở  https://vd.com/a   (nhiều khoảng trắng)  ',
        'https://vi.wikipedia.org/wiki/Phim_(1995) rồi https://b.com!',
    ]
    for (const s of samples) {
        check(`ghép lại nguyên vẹn: "${s.slice(0, 34)}${s.length > 34 ? '…' : ''}"`, reassembles(s))
    }
}

console.log('\n── hasLink ──')
{
    check('hasLink đúng khi có', hasLink('xem https://vd.com') === true)
    check('hasLink đúng khi không', hasLink('không có gì') === false)
    check('hasLink không bị lừa bởi javascript:', hasLink('javascript:alert(1)') === false)
}

console.log(`\n${'─'.repeat(50)}`)
console.log(`ĐẠT ${pass} · HỎNG ${fail}`)
if (fail > 0) process.exitCode = 1
