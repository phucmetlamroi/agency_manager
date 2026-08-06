/**
 * [Giải trí] Đối chiếu vật thể R2 dưới `ent/` với cơ sở dữ liệu — CHỈ ĐỌC.
 *
 * Tìm hai loại rác mà không lệnh nào khác nhìn thấy:
 *   1. Vật thể ĐÃ HOÀN TẤT nhưng không hàng EntVideo nào trỏ tới. Xoá phim mà
 *      dọn hụt, hoặc tải lên xong rồi hàng bị xoá bằng đường khác ⇒ nằm đó tính
 *      tiền mãi, không khoá nào trong DB tìm ra.
 *   2. Multipart ĐANG DỞ DANG. ListObjectsV2 KHÔNG thấy loại này — part đã ghi
 *      vẫn tính tiền cho tới khi bị huỷ, nên nhìn danh sách vật thể sẽ tưởng
 *      kho sạch trong khi vẫn đang chảy tiền.
 *
 * Chạy: npx tsx scripts/ent/r2-orphans.ts
 */
import { ListObjectsV2Command, ListMultipartUploadsCommand, S3Client } from '@aws-sdk/client-s3'
import { prisma } from '../../src/lib/db'

function size(bytes: number): string {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
    return `${(bytes / 1e3).toFixed(0)} KB`
}

async function main() {
    const accountId = process.env.R2_ACCOUNT_ID
    const bucket = process.env.R2_BUCKET || 'hustly-review'
    if (!accountId) return console.log('\n❌ Thiếu R2_ACCOUNT_ID.\n')

    const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
        },
    })

    // ── vật thể đã hoàn tất ──
    const objects: { key: string; size: number; when?: Date }[] = []
    let token: string | undefined
    do {
        const out = await s3.send(
            new ListObjectsV2Command({ Bucket: bucket, Prefix: 'ent/', ContinuationToken: token, MaxKeys: 1000 }),
        )
        for (const o of out.Contents ?? []) {
            objects.push({ key: o.Key ?? '', size: o.Size ?? 0, when: o.LastModified })
        }
        token = out.IsTruncated ? out.NextContinuationToken : undefined
    } while (token)

    // Khoá mà DB còn nhớ: nguồn phim + phụ đề + phiên tải lên dở dang.
    const known = new Set<string>()
    for (const v of await prisma.entVideo.findMany({ select: { r2Key: true } })) if (v.r2Key) known.add(v.r2Key)
    for (const s of await prisma.entSubtitle.findMany({ select: { r2Key: true } })) if (s.r2Key) known.add(s.r2Key)
    for (const s of await prisma.entUploadSession.findMany({ select: { r2Key: true } })) known.add(s.r2Key)

    const orphans = objects.filter((o) => !known.has(o.key))
    const linked = objects.filter((o) => known.has(o.key))

    console.log(`\n── Vật thể dưới ent/ ──`)
    console.log(`  tổng      : ${objects.length} tệp · ${size(objects.reduce((s, o) => s + o.size, 0))}`)
    console.log(`  DB còn nhớ: ${linked.length} tệp · ${size(linked.reduce((s, o) => s + o.size, 0))}`)
    console.log(`  MỒ CÔI    : ${orphans.length} tệp · ${size(orphans.reduce((s, o) => s + o.size, 0))}`)
    for (const o of orphans.sort((a, b) => b.size - a.size)) {
        console.log(`     ${size(o.size).padStart(9)}  ${o.when?.toISOString().slice(0, 16).replace('T', ' ')}  ${o.key}`)
    }

    // ── multipart dở dang (KHÔNG hiện trong danh sách vật thể) ──
    const mp = await s3.send(new ListMultipartUploadsCommand({ Bucket: bucket, Prefix: 'ent/' }))
    const ups = mp.Uploads ?? []
    console.log(`\n── Multipart đang dở dang dưới ent/ ──`)
    if (ups.length === 0) console.log('  không có.')
    for (const u of ups) {
        console.log(`  ${u.Initiated?.toISOString().slice(0, 16).replace('T', ' ')}  ${u.Key}`)
    }
    console.log('')
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
