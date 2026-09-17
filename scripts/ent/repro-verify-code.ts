/**
 * [Giải trí] Tái hiện đường "nhập mã" mà KHÔNG cần đăng nhập, để tìm chỗ ném lỗi.
 *
 * Route /api/ent/auth/verify-code làm đúng 5 việc; script này chạy lại từng việc
 * và in ra việc nào ngã:
 *   1. limitDb  (bảng RateLimitBucket)
 *   2. consumeCodeAttempt (đọc + tăng useCount trên EntAccessCode)
 *   3. signEntCookie  (jose HS256 + REVIEW_COOKIE_SECRET)
 *   4. readEntCookie  (giải mã lại)
 *   5. resolveEntSession (đọc vai trò từ DB)
 *
 * Chạy: DATABASE_URL="<chuỗi>" npx tsx scripts/ent/repro-verify-code.ts [MÃ]
 * Không truyền MÃ thì script tự tạo một mã thử rồi XOÁ đi sau khi chạy xong.
 */
import { prisma } from '../../src/lib/db'
import { limitDb } from '../../src/lib/review/rate-limit-db'
import { consumeCodeAttempt, createEntCode, normalizeEntCode } from '../../src/lib/ent/codes'
import { signEntCookie, readEntCookie, resolveEntSession } from '../../src/lib/ent/auth'

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
    try {
        const out = await fn()
        console.log(`  ✓ ${name}`)
        return out
    } catch (e) {
        console.log(`  ✗ ${name}  ⟵ CHỖ NÀY NÉM LỖI`)
        console.log(`      ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`)
        if (e instanceof Error && e.stack) {
            console.log(
                e.stack
                    .split('\n')
                    .slice(1, 5)
                    .map((l) => `      ${l.trim()}`)
                    .join('\n'),
            )
        }
        return null
    }
}

async function main() {
    console.log(`\nDB: ${(process.env.DATABASE_URL ?? '').match(/@([^/?]+)/)?.[1] ?? '(không rõ)'}`)
    console.log(
        `REVIEW_COOKIE_SECRET: ${process.env.REVIEW_COOKIE_SECRET ? `có, ${process.env.REVIEW_COOKIE_SECRET.length} ký tự` : 'KHÔNG CÓ ⟵ signEntCookie sẽ ném lỗi'}\n`,
    )

    let code = process.argv[2] ? normalizeEntCode(process.argv[2]) : null
    let temporaryId: string | null = null

    if (!code) {
        const created = await step('tạo mã thử', () =>
            createEntCode({ role: 'ENT_ADMIN', note: '[script kiểm tra — sẽ tự xoá]', createdById: 'script' }),
        )
        if (!created) return
        code = created.code
        temporaryId = created.id
        console.log(`      mã thử: ${code}\n`)
    } else {
        console.log(`Dùng mã anh đưa: ${code}\n`)
    }

    console.log('── Chạy lại từng bước của route ──')
    await step('1. limitDb theo IP', () => limitDb('ent:code:script-probe', 8, 900, { failClosed: true }))
    await step('2. limitDb theo user', () => limitDb('ent:code:u:script-probe', 8, 900, { failClosed: true }))

    const hit = await step('3. consumeCodeAttempt', async () => {
        const r = await consumeCodeAttempt(code!)
        if (!r) throw new Error('KHÔNG khớp mã nào — mã sai, đã thu hồi, hoặc sai database')
        return r
    })
    if (!hit) return await cleanup(temporaryId)

    const token = await step('4. signEntCookie', () => signEntCookie(hit.codeId))
    if (!token) return await cleanup(temporaryId)

    const reader = { get: (n: string) => (n === 'ent_access' ? { value: token } : undefined) }
    await step('5. readEntCookie', async () => {
        const cid = await readEntCookie(reader)
        if (cid !== hit.codeId) throw new Error(`giải mã ra "${cid}", cần "${hit.codeId}"`)
        return cid
    })
    await step('6. resolveEntSession', async () => {
        const s = await resolveEntSession(reader)
        if (!s) throw new Error('trả về null — mã bị coi là đã thu hồi?')
        return s
    })

    console.log('\n✅ Toàn bộ đường nhập mã chạy được ở tầng thư viện.')
    console.log('   ⇒ Nếu giao diện vẫn báo "Lỗi hệ thống" thì lỗi nằm ở tầng route/môi trường,')
    console.log('     không phải ở logic mã.\n')
    await cleanup(temporaryId)
}

async function cleanup(id: string | null) {
    if (!id) return
    await prisma.entAccessCode.delete({ where: { id } }).catch(() => {})
    console.log('(đã xoá mã thử)')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
