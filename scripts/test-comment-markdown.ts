/**
 * [Chat GĐ3 · B2] Kiểm thử bộ dựng markdown cho bình luận TASK.
 *
 * Chạy: npx tsx scripts/test-comment-markdown.ts   (hoặc: npm run test:comment-markdown)
 *
 * Khác bình luận review video: bên này dựng chuỗi HTML rồi nhét qua dangerouslySetInnerHTML,
 * nên phần lớn bài kiểm ở đây là về AN TOÀN và về việc không nuốt mất chữ của người dùng.
 *
 * Lưu ý: chạy trong Node nên không có `window`, DOMPurify không chạy. Đó CHÍNH LÀ điều đáng
 * kiểm — đường SSR phải tự nó đã an toàn, không được dựa vào lớp dọn dẹp ở trình duyệt.
 */
import { renderCommentMarkdown as md } from '../src/lib/comment-markdown'

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string) {
    if (ok) { pass++; console.log(`  ✓ ${name}`) }
    else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`) }
}

/** Lấy href đầu tiên trong chuỗi HTML kết quả. */
function href(html: string): string | null {
    const m = html.match(/href="([^"]*)"/)
    return m ? m[1] : null
}
function anchorCount(html: string): number {
    return (html.match(/<a /g) || []).length
}

console.log('\n── LỖI 1: dấu câu bám đuôi bị nuốt vào địa chỉ ──')
{
    const h = md('Xem ở https://vd.com/a.')
    check('dấu chấm KHÔNG nằm trong href', href(h) === 'https://vd.com/a', `href=${href(h)}`)
    check('dấu chấm vẫn còn trên màn hình', h.trimEnd().endsWith('</a>.'), h)

    const h2 = md('link https://vd.com/x, rồi tiếp')
    check('dấu phẩy KHÔNG nằm trong href', href(h2) === 'https://vd.com/x', `href=${href(h2)}`)
    check('dấu phẩy vẫn còn trên màn hình', h2.includes('</a>, rồi tiếp'), h2)
}

console.log('\n── LỖI 2: ngoặc đơn làm đứt địa chỉ ──')
{
    const h = md('https://vi.wikipedia.org/wiki/Phim_(1995)')
    check(
        'ngoặc cân bằng NẰM TRONG href (trước đây bị cắt mất)',
        href(h) === 'https://vi.wikipedia.org/wiki/Phim_(1995)',
        `href=${href(h)}`,
    )

    const h2 = md('xem (https://vd.com) nhé')
    check('ngoặc bao ngoài KHÔNG nằm trong href', href(h2) === 'https://vd.com', `href=${href(h2)}`)
    check('ngoặc đóng vẫn còn trên màn hình', h2.includes('</a>) nhé'), h2)
}

console.log('\n── LỖI 3: www. không được nhận ──')
{
    const h = md('trang chủ www.frame.io nhé')
    check('www. thành link', anchorCount(h) === 1, h)
    check('href được gắn https://', href(h) === 'https://www.frame.io', `href=${href(h)}`)
    check('chữ hiển thị giữ nguyên www.', h.includes('>www.frame.io</a>'), h)
}

console.log('\n── AN TOÀN (không có DOMPurify vì chạy ở Node) ──')
{
    const h = md('<script>alert(1)</script>')
    check('thẻ script bị thoát, không còn là thẻ', !h.includes('<script'), h)
    check('hiện ra dưới dạng chữ', h.includes('&lt;script&gt;'), h)

    check('javascript: KHÔNG thành link', anchorCount(md('bấm javascript:alert(1) đi')) === 0)
    check('data: KHÔNG thành link', anchorCount(md('data:text/html,<h1>x')) === 0)
    check('vbscript: KHÔNG thành link', anchorCount(md('vbscript:msgbox(1)')) === 0)

    const evil = md('[bấm đây](javascript:alert(1))')
    check('link markdown giao thức độc KHÔNG thành thẻ a', anchorCount(evil) === 0, evil)

    const img = md('<img src=x onerror=alert(1)>')
    check('thẻ img bị thoát', !img.includes('<img'), img)

    const quote = md('xem "https://vd.com" nhé')
    check('&quot; không lọt vào href', (href(quote) ?? '').indexOf('&quot') === -1, `href=${href(quote)}`)
}

console.log('\n── Không nuốt mất chữ của người dùng ──')
{
    // Gỡ hết thẻ đi thì phần chữ còn lại phải chứa đủ mọi ký tự người dùng đã gõ.
    const samples = [
        'Xem ở https://vd.com/a.',
        'xem (https://vd.com) nhé',
        'link https://vd.com/x, rồi tiếp',
        'trang chủ www.frame.io nhé',
        'https://vi.wikipedia.org/wiki/Phim_(1995) rồi xong!',
    ]
    for (const s of samples) {
        const plain = md(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
        check(`giữ đủ chữ: "${s.slice(0, 34)}${s.length > 34 ? '…' : ''}"`, plain === s, `ra: "${plain}"`)
    }
}

console.log('\n── Không phá các tính năng cũ ──')
{
    check('in đậm', md('**đậm**').includes('<strong>đậm</strong>'))
    check('in nghiêng', md('_nghiêng_').includes('<em>nghiêng</em>'))
    check('gạch ngang', md('~~bỏ~~').includes('<del>bỏ</del>'))
    check('mã inline', md('`ma`').includes('<code>ma</code>'))
    check('xuống dòng thành br', md('a\nb').includes('<br/>'))
    check('@nhắc tên', md('chào @phuc nhé').includes('tc-mention'))

    const mk = md('[tài liệu](https://vd.com/doc)')
    check('link markdown vẫn chạy', href(mk) === 'https://vd.com/doc', `href=${href(mk)}`)
    check('link markdown chỉ tạo MỘT thẻ a', anchorCount(mk) === 1, mk)

    const q = md('https://vd.com/a?b=1&c=2')
    check('dấu & trong chuỗi truy vấn được giữ', (href(q) ?? '').includes('&amp;c=2'), `href=${href(q)}`)

    const both = md('[x](https://a.com) và https://b.com')
    check('link markdown + link trần cùng lúc = 2 thẻ', anchorCount(both) === 2, both)

    check('mọi thẻ a đều có rel an toàn', !md('https://vd.com').includes('<a ') || md('https://vd.com').includes('rel="noopener noreferrer nofollow"'))
    check('mọi thẻ a đều mở tab mới', md('https://vd.com').includes('target="_blank"'))
}

console.log(`\n${'─'.repeat(50)}`)
console.log(`ĐẠT ${pass} · HỎNG ${fail}`)
if (fail > 0) process.exitCode = 1
