#!/usr/bin/env node
/**
 * [AUDIT HT-020] Ghim hai sự thật về AWS SDK mà toàn bộ bản vá HT-020 dựa vào.
 *
 * VÌ SAO CẦN: lỗ hổng HT-020 sinh ra từ một CHÚ THÍCH SAI trong repo, khẳng định presign có ký
 * Content-Type nên upload không thể nói dối kiểu tệp. Không ai kiểm lại, và bản vá đầu tiên vì thế
 * canh một giá trị không bao giờ tới R2. Bài học: những sự thật về THƯ VIỆN NGƯỜI KHÁC mà một
 * chốt bảo mật dựa vào thì phải được KHẲNG ĐỊNH BẰNG MÁY, không phải bằng trí nhớ.
 *
 * Một lần `npm update` làm SDK đổi hành vi sẽ mở lại lỗ hổng mà build vẫn xanh. Script này bắt
 * được cả hai chiều.
 *
 * Chạy: node scripts/assert-r2-presign-contract.mjs
 * KHÔNG chạm mạng, KHÔNG cần credential thật — ký URL là phép tính cục bộ, nên dùng khoá giả.
 */
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const client = new S3Client({
    region: 'auto',
    endpoint: 'https://example.r2.cloudflarestorage.com',
    credentials: { accessKeyId: 'dummy-access-key', secretAccessKey: 'dummy-secret-key' },
})

const failures = []
function check(name, ok, detail) {
    if (ok) console.log(`  OK   ${name}`)
    else { console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name) }
}

const putUrl = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: 'b', Key: 'k', ContentType: 'image/png' }),
    { expiresIn: 900 },
)
const signedHeaders = new URL(putUrl).searchParams.get('X-Amz-SignedHeaders') ?? ''

console.log('PUT — Content-Type KHÔNG được ký (nếu điều này đổi, chốt chặn có thể chuyển về lúc tải lên):')
check(
    "X-Amz-SignedHeaders không chứa 'content-type'",
    !signedHeaders.includes('content-type'),
    `SignedHeaders=${signedHeaders}`,
)
check(
    'chuỗi truy vấn không mang ContentType',
    !/content-type/i.test(new URL(putUrl).search),
)

const getUrl = await getSignedUrl(
    client,
    new GetObjectCommand({
        Bucket: 'b',
        Key: 'k',
        ResponseContentType: 'image/png',
        ResponseContentDisposition: 'attachment; filename="x.png"',
    }),
    { expiresIn: 900 },
)
const getQs = new URL(getUrl).searchParams

console.log('\nGET — hai tham số ghi đè PHẢI nằm trong URL đã ký (đây mới là chốt chặn thật):')
check("có 'response-content-type'", getQs.get('response-content-type') === 'image/png')
check("có 'response-content-disposition'", (getQs.get('response-content-disposition') ?? '').startsWith('attachment'))

// Đổi giá trị phải đổi chữ ký — chứng minh chúng nằm TRONG phần được ký, không phải chỉ đi kèm.
const getUrlOther = await getSignedUrl(
    client,
    new GetObjectCommand({
        Bucket: 'b',
        Key: 'k',
        ResponseContentType: 'image/gif',
        ResponseContentDisposition: 'attachment; filename="x.png"',
    }),
    { expiresIn: 900 },
)
check(
    'đổi ResponseContentType thì chữ ký đổi theo (client không sửa được)',
    getQs.get('X-Amz-Signature') !== new URL(getUrlOther).searchParams.get('X-Amz-Signature'),
)

if (failures.length) {
    console.error(`\n✗ ${failures.length} khẳng định SAI. Giả định mà HT-020 dựa vào không còn đúng — ĐỌC LẠI src/lib/review/r2.ts trước khi phát hành.`)
    process.exit(1)
}
console.log('\n✓ Hợp đồng presign vẫn đúng như bản vá HT-020 giả định.')
