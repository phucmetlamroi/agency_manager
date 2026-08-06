/**
 * [Giải trí] Đo tốc độ tải lên THẬT của từng phim đã xong — chỉ đọc.
 *
 * Câu hỏi cần tách bạch: "mạng lúc này chậm" hay "hệ thống có chỗ bóp tốc độ".
 * Hai thứ đó đòi hai cách chữa hoàn toàn khác nhau, và nhìn một lần up đang chạy
 * thì không phân biệt được. Số liệu lịch sử phân biệt được ngay:
 *   • các lần trước NHANH, lần này chậm  ⇒ mạng/đường truyền lúc này
 *   • lần nào cũng chậm như nhau         ⇒ nghi hệ thống hoặc tuyến đường cố định
 *
 * Mốc đo: EntUploadSession.createdAt (lúc xin URL ký) → completedAt (lúc chốt
 * multipart). Khoảng này CHỈ gồm việc đẩy byte, chưa có phần Mux chuyển mã.
 *
 * Chạy: npx tsx scripts/ent/upload-throughput.ts
 */
import { prisma } from '../../src/lib/db'

function mbps(bytes: number, seconds: number): string {
    if (seconds <= 0) return '—'
    return `${((bytes * 8) / seconds / 1e6).toFixed(1)} Mbps`
}
function mbs(bytes: number, seconds: number): string {
    if (seconds <= 0) return '—'
    return `${(bytes / seconds / 1e6).toFixed(2)} MB/s`
}
function dur(seconds: number): string {
    const m = Math.floor(seconds / 60)
    return m < 1 ? `${Math.round(seconds)}s` : `${m}p${String(Math.round(seconds % 60)).padStart(2, '0')}s`
}

async function main() {
    const sessions = await prisma.entUploadSession.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
            createdAt: true,
            completedAt: true,
            abortedAt: true,
            partSizeBytes: true,
            partsTotal: true,
            partsDone: true,
            video: { select: { title: true, sizeBytes: true, pipelineStatus: true } },
        },
    })
    if (sessions.length === 0) return console.log('\nChưa có phiên tải lên nào.\n')

    console.log('')
    for (const s of sessions) {
        const bytes = Number(s.video?.sizeBytes ?? 0)
        const title = (s.video?.title ?? '(phim đã bị gỡ)').slice(0, 42)
        const part = `${Math.round(s.partSizeBytes / 1e6)}MB×${s.partsTotal}`

        if (!s.completedAt) {
            const secs = (Date.now() - s.createdAt.getTime()) / 1000
            console.log(
                `  ĐANG CHẠY  ${dur(secs).padStart(8)}  ${part.padEnd(10)} ` +
                    `${String(s.partsDone).padStart(3)}/${s.partsTotal} phần xong  ${title}`,
            )
            continue
        }
        const secs = (s.completedAt.getTime() - s.createdAt.getTime()) / 1000
        console.log(
            `  XONG       ${dur(secs).padStart(8)}  ${part.padEnd(10)} ` +
                `${(bytes / 1e9).toFixed(2)} GB  ${mbs(bytes, secs).padStart(9)}  ${mbps(bytes, secs).padStart(10)}  ${title}`,
        )
    }
    console.log('\n  (khoảng đo = xin URL ký → chốt multipart; CHƯA gồm thời gian Mux chuyển mã)\n')
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
