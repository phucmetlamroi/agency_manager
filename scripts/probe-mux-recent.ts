/**
 * [Giải trí] Liệt kê asset Mux gần đây — chỉ đọc.
 *
 * Dùng để phân biệt hai kiểu hỏng nhìn giống hệt nhau trên giao diện:
 *   • hàm nền chưa hề chạy   ⇒ Mux không có asset nào mang passthrough `ent:`
 *   • hàm chạy nhưng ghi DB hụt ⇒ Mux CÓ asset mồ côi (đang tính tiền!)
 *
 * Chạy: npx tsx scripts/ent/probe-mux-recent.ts
 */
const id = process.env.MUX_TOKEN_ID
const secret = process.env.MUX_TOKEN_SECRET

async function main() {
    if (!id || !secret) {
        console.log('\n❌ Thiếu MUX_TOKEN_ID / MUX_TOKEN_SECRET trong môi trường.\n')
        return
    }
    const auth = Buffer.from(`${id}:${secret}`).toString('base64')
    const res = await fetch('https://api.mux.com/video/v1/assets?limit=10', {
        headers: { authorization: `Basic ${auth}` },
    })
    if (!res.ok) {
        console.log(`\n❌ Mux trả HTTP ${res.status}: ${(await res.text()).slice(0, 300)}\n`)
        return
    }
    const body = (await res.json()) as {
        data: { id: string; status: string; created_at: string; passthrough?: string; duration?: number }[]
    }
    if (body.data.length === 0) {
        console.log('\nTài khoản Mux không có asset nào.\n')
        return
    }
    console.log(`\n${body.data.length} asset gần nhất:\n`)
    for (const a of body.data) {
        const when = new Date(Number(a.created_at) * 1000)
        const mins = Math.round((Date.now() - when.getTime()) / 60000)
        console.log(
            `  ${a.status.padEnd(10)} ${mins < 1440 ? `${mins} phút trước`.padEnd(18) : when.toISOString().slice(0, 10).padEnd(18)}` +
                ` passthrough=${a.passthrough ?? '(không có)'}`,
        )
    }
    console.log('')
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
