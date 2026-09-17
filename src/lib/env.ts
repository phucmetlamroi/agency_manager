import { z } from 'zod'

const JWT_SECRET_DEFAULT = "temporary-build-secret-key-change-me"

const envSchema = z.object({
    DATABASE_URL: z.string().min(1).default("placeholder_url_replace_me"),
    JWT_SECRET: z.string().min(10).default(JWT_SECRET_DEFAULT),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

// Helper to clean quotes that users might copy-paste into Vercel
const cleanEnvValue = (val: string | undefined) => {
    if (!val) return val
    return val.trim().replace(/^['"](.*)['"]$/, '$1')
}

const rawEnv = {
    ...process.env,
    DATABASE_URL: cleanEnvValue(process.env.POSTGRES_URL || process.env.DATABASE_URL),
    JWT_SECRET: cleanEnvValue(process.env.JWT_SECRET)
}

const parsed = envSchema.safeParse(rawEnv)

// [AUDIT SWEEP-2026-07-30 fix · ENV-PARSE] CHÍNH CHỐT FAIL-CLOSED TỰ TẮT KHI ENV SAI.
//
// Trước đây: parse thất bại → chỉ in một dòng console.error → rồi `envSchema.parse({})` đặt LẠI TOÀN
// BỘ env về default. Hậu quả dây chuyền, và đây là phần nguy hiểm: `NODE_ENV` cũng về 'development',
// nên hai chốt fail-closed bên dưới (JWT_SECRET placeholder ở :37 và INNGEST_DEV ở :53) đều hỏi
// `env.NODE_ENV === 'production'` và đều TRẢ LỜI KHÔNG. Tức ứng dụng vẫn boot ở production, ký và
// xác thực mọi cookie phiên bằng khoá công khai nằm trong git (JWT_SECRET_DEFAULT ngay trên), và
// không còn chặn INNGEST_DEV. Một chốt bảo mật tự vô hiệu hoá đúng lúc cấu hình sai là loại lỗi tệ
// nhất — nó im lặng khi cần nói to nhất.
//
// Kịch bản thật, không cần kẻ tấn công: người vận hành dán JWT_SECRET 8 ký tự, hoặc dựng môi trường
// với NODE_ENV=staging (không thuộc enum) → deploy vẫn xanh, chỉ có một dòng lẫn trong log build.
//
// VÌ SAO THROW Ở ĐÂY LÀ AN TOÀN: cả ba khoá trong schema đều có `.default()`, nên safeParse CHỈ
// thất bại khi biến CÓ MẶT nhưng SAI (chuỗi rỗng / JWT ngắn / NODE_ENV lạ) — biến thiếu thì lấy
// default và vẫn parse được. Thêm nữa, nếu production hiện tại đang hỏng parse thì DATABASE_URL đã
// là 'placeholder_url_replace_me' và gần như mọi trang phải 500; hệ thống đang chạy bình thường ⇒
// env hiện tại parse được ⇒ bật fail-closed không làm sập gì.
// Cố ý KHÔNG miễn cho build phase: biến có-mặt-nhưng-sai là lỗi thật, và chặn ở build tốt hơn chặn
// ở runtime.
if (!parsed.success) {
    console.error("❌ Invalid environment variables:", JSON.stringify(parsed.error.format(), null, 2))
    throw new Error(
        '[env] Invalid environment variables (xem log phía trên). Refusing to start (fail closed). ' +
        'Trước đây lỗi này bị nuốt và ứng dụng chạy tiếp bằng giá trị default — gồm cả JWT_SECRET công khai.'
    )
}

export const env = parsed.data

// [AUDIT R1 — CRITICAL fix] Fail CLOSED at runtime in production if JWT_SECRET is
// missing or the public, source-controlled placeholder. Booting on the placeholder
// lets anyone forge session JWTs (full auth bypass / impersonation of any role).
// We still allow the build phase (next build) to run on the placeholder so a deploy
// doesn't break when the real secret is only injected at runtime.
const IS_BUILD_PHASE = process.env.NEXT_PHASE === 'phase-production-build'
if (env.NODE_ENV === 'production' && !IS_BUILD_PHASE && env.JWT_SECRET === JWT_SECRET_DEFAULT) {
    throw new Error(
        '[env] JWT_SECRET is unset or set to the default placeholder in production. ' +
        'Set a strong, secret JWT_SECRET. Refusing to start (fail closed).'
    )
}

if (env.DATABASE_URL === "placeholder_url_replace_me" && env.NODE_ENV === 'production') {
    console.error("❌ ERROR: No DATABASE_URL or POSTGRES_URL found in Vercel env!")
}

// [AUDIT P5-005] Fail CLOSED on an Inngest misconfiguration in production. A truthy INNGEST_DEV
// puts the /api/inngest handler into dev mode, which SKIPS webhook signature verification — anyone
// could then POST-invoke background functions (including the destructive review-janitor that hard-
// deletes Mux assets / R2 objects / DB rows). It must never be set in prod. Mirrors the JWT_SECRET
// fail-closed guard above. (Default = unset = cloud mode = signature required = safe.)
if (env.NODE_ENV === 'production' && !IS_BUILD_PHASE) {
    // [AUDIT SWEEP-2026-07-30 fix · INNGEST-DEV] Chốt cũ là DANH SÁCH CẤM chỉ gồm '1' và 'true'.
    // Nhưng Inngest SDK vào chế độ dev với MỌI chuỗi không rỗng khác 'false'/'0' — nên
    // `INNGEST_DEV=yes` (hoặc 'on', 'dev', 'TRUE ') ở production tắt sạch xác thực chữ ký webhook mà
    // chốt này vẫy tay cho qua. Danh sách cấm luôn thua ở chỗ này: nó phải đoán hết cách viết, còn
    // danh sách cho phép chỉ cần biết cách viết ĐÚNG.
    const inngestDev = (process.env.INNGEST_DEV || '').trim().toLowerCase()
    const INNGEST_DEV_ALLOWED_IN_PROD = ['', 'false', '0']
    if (!INNGEST_DEV_ALLOWED_IN_PROD.includes(inngestDev)) {
        throw new Error(
            `[env] INNGEST_DEV="${process.env.INNGEST_DEV}" ở production — bất kỳ giá trị nào ngoài ` +
            `unset/'false'/'0' đều đẩy Inngest SDK sang chế độ dev và BỎ QUA xác thực chữ ký webhook ` +
            `(kẻ ngoài POST được vào job review-janitor, job này XOÁ CỨNG Mux/R2/DB). ` +
            `Bỏ biến này. Refusing to start (fail closed).`
        )
    }
    if (!process.env.INNGEST_SIGNING_KEY) {
        console.error('[env] INNGEST_SIGNING_KEY is not set in production — Inngest cloud mode requires it for signed webhooks.')
    }
}
