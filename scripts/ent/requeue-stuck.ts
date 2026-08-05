/**
 * [Giải trí] Bơm lại việc xử lý cho phim kẹt PROCESSING mà Mux chưa hề nhận.
 *
 * Đây chính là bước janitor làm lúc 20h mỗi tối; script chỉ để khỏi phải chờ.
 * AN TOÀN: entProcessUpload kiểm muxAssetId trước khi tạo asset, nên bắn lại
 * nhiều lần cũng KHÔNG trả tiền encode hai lần.
 *
 * Gửi sự kiện bằng HTTP THUẦN tới cổng nhận sự kiện của Inngest, KHÔNG import
 * `@/lib/review/inngest`. Lý do: tệp đó kéo theo cả đồ thị hàm nền của module
 * Tệp → upload-service → billing/entitlements → `server-only`, thứ chỉ tồn tại
 * bên trong Next. Script chạy bằng tsx trần sẽ chết ngay ở bước nạp mô-đun.
 *
 * Chạy: npx tsx scripts/ent/requeue-stuck.ts
 *   (cần DATABASE_URL + INNGEST_EVENT_KEY trong môi trường)
 */
import { ReviewPipelineStatus } from '@prisma/client'
import { prisma } from '../../src/lib/db'
import { ENT_EVENTS } from '../../src/lib/ent/events'

async function sendEvent(name: string, data: Record<string, unknown>) {
    const key = process.env.INNGEST_EVENT_KEY
    if (!key) throw new Error('Thiếu INNGEST_EVENT_KEY trong môi trường.')
    const res = await fetch(`https://inn.gs/e/${key}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, data }),
    })
    if (!res.ok) throw new Error(`Inngest trả HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

async function main() {
    const stuck = await prisma.entVideo.findMany({
        where: { pipelineStatus: ReviewPipelineStatus.PROCESSING, muxAssetId: null },
        select: { id: true, title: true },
    })
    if (stuck.length === 0) {
        // Phân biệt "kho trống" với "có phim nhưng không phim nào kẹt". Bản đầu
        // in chung một câu cho cả hai, khẳng định "mọi phim PROCESSING đều đã có
        // asset Mux" — câu đó SAI khi bảng rỗng, và đủ để hiểu nhầm là mọi thứ
        // đang chạy trong khi thực ra chẳng còn phim nào.
        const total = await prisma.entVideo.count()
        console.log(
            total === 0
                ? '\nKho phim đang TRỐNG — không còn phim nào trong cơ sở dữ liệu.\n'
                : `\n${total} phim trong kho, không phim nào kẹt (phim đang xử lý đều đã có asset Mux).\n`,
        )
        return
    }
    for (const v of stuck) {
        await sendEvent(ENT_EVENTS.UPLOAD_COMPLETED, { videoId: v.id })
        console.log(`  ↻ đã bắn lại: ${v.title}`)
    }
    console.log(`\nĐã bơm lại ${stuck.length} phim. Chờ ~1 phút rồi chạy check-video-status.ts để xem Mux đã nhận chưa.\n`)
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
