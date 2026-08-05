/**
 * [Giải trí] Bơm lại việc xử lý cho phim kẹt PROCESSING mà Mux chưa hề nhận.
 *
 * Đây chính là bước janitor làm lúc 20h mỗi tối; script chỉ để khỏi phải chờ.
 * AN TOÀN: entProcessUpload kiểm muxAssetId trước khi tạo asset, nên bắn lại
 * nhiều lần cũng KHÔNG trả tiền encode hai lần.
 *
 * Chạy: npx tsx scripts/ent/requeue-stuck.ts
 */
import { ReviewPipelineStatus } from '@prisma/client'
import { prisma } from '../../src/lib/db'
import { inngest } from '../../src/lib/review/inngest'
import { ENT_EVENTS } from '../../src/lib/ent/events'

async function main() {
    const stuck = await prisma.entVideo.findMany({
        where: { pipelineStatus: ReviewPipelineStatus.PROCESSING, muxAssetId: null },
        select: { id: true, title: true },
    })
    if (stuck.length === 0) {
        console.log('\nKhông có phim nào kẹt (mọi phim PROCESSING đều đã có asset Mux).\n')
        return
    }
    for (const v of stuck) {
        await inngest.send({ name: ENT_EVENTS.UPLOAD_COMPLETED, data: { videoId: v.id } })
        console.log(`  ↻ đã bắn lại: ${v.title}`)
    }
    console.log(`\nĐã bơm lại ${stuck.length} phim. Chờ ~1 phút rồi chạy check-video-status.ts để xem Mux đã nhận chưa.\n`)
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
