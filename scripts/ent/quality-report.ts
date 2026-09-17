/**
 * [Giải trí] Báo cáo chất lượng thật của từng phim — chỉ đọc.
 *
 * Trả lời câu "phim có bị hạ chất lượng không". Mux ghi lại độ phân giải THẬT
 * của bản gốc; đặt cạnh mức encode đã chọn (`plus` giữ nguyên độ phân giải,
 * `basic` CHẶN TRẦN ở 720p) là thấy ngay có bị cắt hay không.
 *
 * Lưu ý khi đọc số: phim rạp tỉ lệ 2,40:1 ra chiều cao ~800px ở bề ngang 1920 —
 * đó là tỉ lệ gốc của bản phim, KHÔNG phải bị hạ từ 1080p xuống.
 *
 * Chạy: npx tsx scripts/ent/quality-report.ts
 */
import { prisma } from '../../src/lib/db'

function ratio(w: number | null, h: number | null): string {
    if (!w || !h) return '—'
    const r = w / h
    if (r > 2.3) return `${r.toFixed(2)}:1 (rạp/scope)`
    if (r > 1.9) return `${r.toFixed(2)}:1 (16:9)`
    return `${r.toFixed(2)}:1`
}

async function main() {
    const rows = await prisma.entVideo.findMany({
        orderBy: { createdAt: 'desc' },
        select: { title: true, width: true, height: true, muxQuality: true, pipelineStatus: true, sizeBytes: true, durationMs: true },
    })
    if (rows.length === 0) return console.log('\nKho phim trống.\n')

    console.log('')
    for (const v of rows) {
        const res = v.width && v.height ? `${v.width}×${v.height}` : '(chưa có)'
        const mins = v.durationMs ? Math.round(v.durationMs / 60000) : null
        console.log(`  ${res.padEnd(11)} ${ratio(v.width, v.height).padEnd(18)} encode=${(v.muxQuality ?? '?').padEnd(5)} ${v.pipelineStatus.padEnd(10)} ${mins ? `${mins}p` : ''} ${v.title}`)
    }
    const capped = rows.filter((v) => v.muxQuality === 'basic' && (v.height ?? 0) >= 700)
    console.log(
        capped.length
            ? `\n⚠️  ${capped.length} phim dùng mức "basic" — Mux CHẶN TRẦN 720p, bản gốc cao hơn đã bị cắt.\n`
            : '\n✓ Không phim nào bị mức encode chặn trần độ phân giải.\n',
    )
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
