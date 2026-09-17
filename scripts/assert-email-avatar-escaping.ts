/**
 * Chạy THẬT bản vá N10 với đầu vào thù địch. Kiểm KẾT QUẢ ĐƯỢC PARSE, không kiểm chuỗi thô.
 */
import { avatar } from '../src/lib/notification-emails/shared/wrapTemplate'

let fail = 0
const check = (label: string, cond: boolean, extra = '') => {
    if (!cond) { fail++; console.log(`  x ${label} ${extra}`) }
    else console.log(`  v ${label}`)
}

/**
 * Trích TÊN thuộc tính đúng như trình duyệt: thực thể HTML nằm trong một giá trị đã trích dẫn
 * KHÔNG kết thúc thuộc tính đó. Bài học: đừng bóc &quot; ra rồi mới kiểm — làm vậy là tự tay
 * tháo lớp escape rồi kết luận lớp escape không hoạt động.
 */
function attrNames(tag: string): string[] {
    const inner = tag.replace(/^<img\s*/, '').replace(/>$/, '')
    const out: string[] = []
    const re = /([a-zA-Z-]+)\s*=\s*"[^"]*"/g
    let m: RegExpExecArray | null
    while ((m = re.exec(inner))) out.push(m[1].toLowerCase())
    return out
}

const EXPECTED = ['src', 'alt', 'width', 'height', 'style']

console.log('--- N10: avatar() ---')

// 1. Đường hợp lệ THẬT phải còn chạy: Vercel Blob + ảnh hồ sơ Google.
const blob = 'https://abc123.public.blob.vercel-storage.com/avatars/u1-XyZ.png'
const gphoto = 'https://lh3.googleusercontent.com/a/ACg8ocK_abc=s96-c'
for (const ok of [blob, gphoto]) {
    const html = avatar(ok, 'Dareu')
    check(`giu duoc URL hop le (${ok.slice(0, 32)}...)`, html.includes(`src="${ok}"`), html.slice(0, 120))
}

// 2. Thoát thuộc tính — chính lỗ N10.
const h2 = avatar('https://x.com/a.png" onerror="alert(1)', 'Dareu')
const n2 = attrNames(h2)
check('chi co dung cac thuoc tinh mong doi', JSON.stringify(n2) === JSON.stringify(EXPECTED), JSON.stringify(n2))
check('khong sinh ra thuoc tinh on*', !n2.some((n) => n.startsWith('on')), JSON.stringify(n2))
check('dau nhay kep bi escape', h2.includes('&quot;'), h2)
check('van dung 1 the img', (h2.match(/<img/g) || []).length === 1, h2)

// 3. Scheme lạ → rơi về ảnh chữ cái, KHÔNG render img.
for (const bad of [
    'javascript:alert(1)',
    '  javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    '//evil.com/x.png',
    '/relative/x.png',
    'httpx://x.com/a.png',
    '',
]) {
    const h = avatar(bad, 'Dareu')
    check(`tu choi scheme la: ${JSON.stringify(bad).slice(0, 38)}`, !h.includes('<img'), h.slice(0, 90))
}

// 4. Tên bắt đầu bằng dấu nháy kép → alt không được vỡ.
const h4 = avatar(blob, '"><script>alert(1)</script>')
check('alt escape ky tu dau', h4.includes('alt="&quot;"'), h4)
check('khong co the script', !h4.includes('<script'), h4)
check('thuoc tinh van dung bo mong doi', JSON.stringify(attrNames(h4)) === JSON.stringify(EXPECTED), JSON.stringify(attrNames(h4)))

// 5. Nhánh fallback (không url) cũng phải escape.
const h5 = avatar(null, '"><img src=x onerror=alert(1)>')
check('fallback escape', !h5.includes('<img') && h5.includes('&quot;'), h5)

// 6. Dữ liệu bình thường không bị hỏng.
check('ten tieng Viet giu nguyen', avatar(null, 'Đạt').includes('>Đ</span>'), avatar(null, 'Đạt'))

console.log(fail === 0 ? '\nN10: TAT CA DAT' : `\nN10: ${fail} MUC HONG`)
process.exit(fail === 0 ? 0 : 1)
