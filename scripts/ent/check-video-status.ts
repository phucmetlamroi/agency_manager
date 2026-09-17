/**
 * [Giải trí] Soi trạng thái THẬT của từng phim — chỉ đọc, không sửa gì.
 *
 * Trả lời đúng một câu hỏi: phim đang "Đang chuyển mã" là còn chạy hay đã treo?
 * Giao diện chỉ có một vòng xoay, không nói được điều đó; chỗ duy nhất biết sự
 * thật là Mux. Script hỏi thẳng Mux rồi đặt cạnh trạng thái trong DB.
 *
 * Chạy:  npx tsx scripts/ent/check-video-status.ts
 *   (cần DATABASE_URL + MUX_TOKEN_ID + MUX_TOKEN_SECRET trong môi trường)
 */
import { prisma } from '../../src/lib/db'
import { getMuxAsset, MuxError } from '../../src/lib/review/mux'

function ago(d: Date): string {
    const m = Math.floor((Date.now() - d.getTime()) / 60000)
    if (m < 60) return `${m} phút trước`
    const h = Math.floor(m / 60)
    return h < 24 ? `${h}h${m % 60}p trước` : `${Math.floor(h / 24)} ngày trước`
}

async function main() {
    const videos = await prisma.entVideo.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            title: true,
            pipelineStatus: true,
            errorMessage: true,
            sizeBytes: true,
            muxAssetId: true,
            muxPlaybackId: true,
            durationMs: true,
            height: true,
            createdAt: true,
            updatedAt: true,
        },
    })

    if (videos.length === 0) {
        console.log('\nKho phim đang trống.\n')
        return
    }

    for (const v of videos) {
        console.log(`\n━━ ${v.title}`)
        console.log(`   DB          : ${v.pipelineStatus}${v.errorMessage ? ` — ${v.errorMessage}` : ''}`)
        console.log(`   dung lượng  : ${(Number(v.sizeBytes) / 1e9).toFixed(2)} GB`)
        console.log(`   tạo lúc     : ${ago(v.createdAt)}   ·   đổi lần cuối: ${ago(v.updatedAt)}`)
        console.log(`   muxAssetId  : ${v.muxAssetId ?? '(CHƯA CÓ — Mux chưa hề nhận việc)'}`)
        if (v.height) console.log(`   kết quả     : ${v.height}p · ${Math.round((v.durationMs ?? 0) / 60000)} phút`)

        if (!v.muxAssetId) continue
        try {
            const a = await getMuxAsset(v.muxAssetId)
            const prog = (a as unknown as { progress?: { state?: string; progress?: number } }).progress
            console.log(
                `   MUX nói     : ${a.status}` +
                    (prog ? `  (${prog.state ?? ''} ${prog.progress != null ? `${prog.progress}%` : ''})` : ''),
            )
            if (a.errors?.messages?.length) console.log(`   MUX lỗi     : ${a.errors.messages.join('; ')}`)
            if (a.status === 'ready' && v.pipelineStatus !== 'READY') {
                console.log(`   ⚠️  LỆCH: Mux xong rồi mà DB chưa cập nhật ⇒ webhook rơi mất.`)
            }
        } catch (e) {
            console.log(
                `   MUX nói     : KHÔNG HỎI ĐƯỢC — ${e instanceof MuxError ? `HTTP ${e.status} ${e.message}` : String(e)}`,
            )
        }
    }
    console.log('')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
