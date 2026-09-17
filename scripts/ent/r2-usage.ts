/**
 * [Giải trí] Đếm THẬT những gì đang nằm trên R2 — chỉ đọc, không xoá gì.
 *
 * Gộp theo tiền tố khoá cấp một (`ent/`, `review/`, …) để thấy ngay phần nào là
 * kho phim, phần nào là module Tệp cũ. Dung lượng lấy từ chính siêu dữ liệu của
 * vật thể, không ước lượng từ bảng trong cơ sở dữ liệu — hai số này lệch nhau
 * đúng ở chỗ đáng lo: vật thể mồ côi mà DB không còn khoá nào trỏ tới.
 *
 * Chạy: npx tsx scripts/ent/r2-usage.ts
 *   (cần R2_ACCOUNT_ID + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY + R2_BUCKET)
 */
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'

function gb(bytes: number): string {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
    return `${(bytes / 1e3).toFixed(0)} KB`
}

async function main() {
    const accountId = process.env.R2_ACCOUNT_ID
    const bucket = process.env.R2_BUCKET || 'hustly-review'
    if (!accountId) {
        console.log('\n❌ Thiếu R2_ACCOUNT_ID.\n')
        return
    }
    const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
        },
    })

    const groups = new Map<string, { count: number; bytes: number }>()
    let total = 0
    let objects = 0
    let token: string | undefined
    let pages = 0

    do {
        const out = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token, MaxKeys: 1000 }))
        for (const o of out.Contents ?? []) {
            const key = o.Key ?? ''
            const size = o.Size ?? 0
            const top = key.split('/')[0] || '(gốc)'
            const g = groups.get(top) ?? { count: 0, bytes: 0 }
            g.count++
            g.bytes += size
            groups.set(top, g)
            total += size
            objects++
        }
        token = out.IsTruncated ? out.NextContinuationToken : undefined
        pages++
    } while (token && pages < 200)

    console.log(`\nBucket R2: ${bucket}   (endpoint ${accountId}.r2.cloudflarestorage.com)\n`)
    console.log(`${'tiền tố'.padEnd(16)} ${'số tệp'.padStart(8)}  dung lượng`)
    console.log('─'.repeat(44))
    for (const [k, v] of [...groups].sort((a, b) => b[1].bytes - a[1].bytes)) {
        console.log(`${k.padEnd(16)} ${String(v.count).padStart(8)}  ${gb(v.bytes)}`)
    }
    console.log('─'.repeat(44))
    console.log(`${'TỔNG'.padEnd(16)} ${String(objects).padStart(8)}  ${gb(total)}`)
    console.log(`\nGiá R2 ≈ $0,015/GB/tháng ⇒ khoảng $${((total / 1e9) * 0.015).toFixed(2)}/tháng.\n`)
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
})
