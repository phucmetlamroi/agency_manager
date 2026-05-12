'use server'

/**
 * Auth Phase 3 — Public signup server action.
 *
 * Flow (theo §4.1 spec login.md):
 *   1. Honeypot check (silent reject)
 *   2. Vercel BotID classify (passive — replaces Turnstile siteverify)
 *   3. Rate limit (IP 5/h, email 3/h)
 *   4. Validate input (Zod-style)
 *   5. HIBP password check
 *   6. Disposable email check
 *   7. Hash password (bcrypt cost 12)
 *   8. Transaction:
 *      - Skip nếu email đã tồn tại (silent return success — anti-enumeration)
 *      - Tạo Profile mới (free + full features — Sprint B bỏ trial/subscription)
 *      - Tạo User (role=USER, emailVerified=false, hasCompletedEmailMigration=true)
 *      - Tạo Workspace mặc định "{displayName}'s Workspace", User → OWNER
 *      - Tạo EmailVerificationToken (purpose=EMAIL_VERIFICATION, TTL 24h)
 *      - Audit log
 *   9. Send verify email
 *   10. Padding response time
 *
 * Response giống nhau dù email tồn tại hay không (anti-enumeration).
 */

import { prisma } from '@/lib/db'
import { hash } from 'bcryptjs'
import { headers } from 'next/headers'
import { randomInt } from 'crypto'
import { generateRandomToken, hashToken } from '@/lib/otp'
import { validatePasswordFull } from '@/lib/password-validator'
import { validateEmailForSignup } from '@/lib/email-validator'
import { checkBotId } from 'botid/server'
import { checkSignupIp, checkSignupEmail } from '@/lib/rate-limit-upstash'
import { sendEmail } from '@/lib/email'
import { buildVerifyEmailEmail } from '@/lib/notification-emails/templates/auth/verify-email'

const SIGNUP_BCRYPT_COST = 12  // Higher cost for new signups (NIST 2025-aligned)
const VERIFY_TOKEN_TTL_HOURS = 24
const MAX_DISPLAY_NAME = 60
const MIN_DISPLAY_NAME = 2

const GENERIC_SIGNUP_RESPONSE = {
    success: true,
    message: 'Nếu email hợp lệ, chúng tôi đã gửi link xác thực. Vui lòng kiểm tra hộp thư trong 5 phút tới.',
}

// M3 fix: pad to constant target (~600ms) thay vì fixed jitter.
// Bcrypt cost 12 (~250-400ms) làm new-user path lâu hơn existing-user.
// Để ngăn timing leak, mọi path phải finish ở thời gian gần nhau.
// 600ms = bcrypt(~350ms) + jitter(~100-200ms) + buffer.
const TARGET_RESPONSE_MS = 600

function elapsedSince(start: number): number {
    return Date.now() - start
}

async function padToTarget(start: number) {
    const elapsed = elapsedSince(start)
    const remaining = TARGET_RESPONSE_MS - elapsed
    if (remaining > 0) {
        // Vẫn thêm random jitter 0-100ms để khó dự đoán target chính xác
        await new Promise(r => setTimeout(r, remaining + randomInt(0, 100)))
    }
}

async function paddingDelay() {
    const ms = randomInt(100, 301)
    await new Promise(r => setTimeout(r, ms))
}

async function getRequestMeta() {
    let ip = 'unknown-ip'
    let userAgent: string | null = null
    try {
        const h = await headers()
        ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown-ip'
        userAgent = h.get('user-agent')
    } catch { /* edge */ }
    return { ip, userAgent }
}

// ─── Input types ──────────────────────────────────────────────────

export type SignupInput = {
    email: string
    password: string
    displayName: string
    acceptTos: boolean
    // [BotID migration] turnstileToken removed — Vercel BotID là passive,
    // không cần client gửi token. Server gọi checkBotId() đọc signal headers.
    honeypot?: string  // Should be empty; bots fill it
}

export type SignupResponse = {
    success: boolean
    message?: string
    errors?: Record<string, string>
    retryAfter?: number
}

// ─── Main action ──────────────────────────────────────────────────

export async function signupAction(input: SignupInput): Promise<SignupResponse> {
    const startedAt = Date.now()  // M3 fix: track for constant-time response padding
    const { ip, userAgent } = await getRequestMeta()

    // ── 1. Honeypot — bots fill this, humans don't ──
    if (input.honeypot && input.honeypot.trim() !== '') {
        // Silent success (return same as legit signup)
        await paddingDelay()
        return GENERIC_SIGNUP_RESPONSE
    }

    // ── 2. Validate ToS acceptance ──
    if (!input.acceptTos) {
        await paddingDelay()
        return {
            success: false,
            errors: { tos: 'Bạn cần đồng ý với Điều khoản dịch vụ và Chính sách bảo mật.' }
        }
    }

    // ── 3. Validate displayName (Unicode tiếng Việt OK) ──
    const displayName = (input.displayName ?? '').trim()
    if (displayName.length < MIN_DISPLAY_NAME || displayName.length > MAX_DISPLAY_NAME) {
        await paddingDelay()
        return {
            success: false,
            errors: { displayName: `Tên hiển thị phải từ ${MIN_DISPLAY_NAME} đến ${MAX_DISPLAY_NAME} ký tự.` }
        }
    }

    // ── 4. Validate email format + disposable ──
    const emailValidation = validateEmailForSignup(input.email)
    if (!emailValidation.valid) {
        await paddingDelay()
        return {
            success: false,
            errors: { email: emailValidation.message ?? 'Email không hợp lệ.' }
        }
    }
    const email = input.email.trim().toLowerCase()

    // ── 5. Vercel BotID — passive bot detection (replaces Cloudflare Turnstile) ──
    // BotID đọc passive signals từ client (set bởi src/instrumentation-client.ts)
    // và classify request. Local dev returns isBot=false. Vercel platform
    // fail-open nếu signal không khả dụng — đủ phù hợp với defense-in-depth
    // hiện tại (Upstash rate-limit + honeypot + HIBP + bcrypt 12).
    const botCheck = await checkBotId()
    if (botCheck.isBot) {
        await paddingDelay()
        return {
            success: false,
            errors: { turnstile: 'Vui lòng thử lại.' }
        }
    }

    // ── 6. Rate limit IP (5/h) ──
    const ipLimit = await checkSignupIp(ip)
    if (!ipLimit.success) {
        await paddingDelay()
        return {
            success: false,
            message: `Quá nhiều yêu cầu đăng ký. Vui lòng thử lại sau ${ipLimit.retryAfter ?? 600} giây.`,
            retryAfter: ipLimit.retryAfter,
        }
    }

    // ── 7. Rate limit email (3/h) — chống enumeration loop ──
    // H4 fix: trả về cùng shape (429 + retryAfter) như IP limit để không leak
    // distinction giữa IP limit vs email limit. Kẻ tấn công không thể infer
    // rằng email cụ thể đã được signup nhiều lần.
    const emailLimit = await checkSignupEmail(email)
    if (!emailLimit.success) {
        await paddingDelay()
        return {
            success: false,
            message: `Quá nhiều yêu cầu đăng ký. Vui lòng thử lại sau ${emailLimit.retryAfter ?? 600} giây.`,
            retryAfter: emailLimit.retryAfter,
        }
    }

    // ── 8. Validate password (≥12 chars + HIBP) ──
    const pwdValidation = await validatePasswordFull(input.password)
    if (!pwdValidation.valid) {
        await paddingDelay()
        return {
            success: false,
            errors: { password: pwdValidation.errors[0] ?? 'Mật khẩu không hợp lệ.' }
        }
    }

    // ── 9. Check email tồn tại — silent return success nếu có ──
    const existing = await prisma.user.findFirst({
        where: { email },
        select: { id: true },
    })
    if (existing) {
        // M3 fix: Anti-enumeration với constant-time padding (~600ms target).
        // Existing-user path skip bcrypt (250-400ms), nên dùng padToTarget để
        // tổng response time ~bằng new-user path.
        await padToTarget(startedAt)
        return GENERIC_SIGNUP_RESPONSE
    }

    // ── 10. Hash password ──
    const passwordHash = await hash(input.password, SIGNUP_BCRYPT_COST)

    // ── 11. Atomic create: Profile + User + Workspace + Token ──
    let userId: string
    let rawToken: string
    try {
        const result = await prisma.$transaction(async (tx) => {
            // [Sprint B] Tạo Profile mới — free + full features (bỏ trial/subscription)
            const profile = await tx.profile.create({
                data: {
                    name: `${displayName}'s Profile`,
                },
                select: { id: true },
            })

            // Tạo User. username = email (unique constraint requires unique username).
            // Nếu email đã được dùng làm username (legacy migration), thêm suffix.
            // Note: rất hiếm vì email mới và user cũ thường có Vietnamese username.
            let username = email
            const usernameTaken = await tx.user.findUnique({
                where: { username },
                select: { id: true },
            })
            if (usernameTaken) {
                username = `${email}-${Date.now().toString(36)}`
            }

            const user = await tx.user.create({
                data: {
                    username,
                    email,
                    password: passwordHash,
                    role: 'USER',
                    profileId: profile.id,
                    displayName,
                    emailVerified: false,
                    hasCompletedEmailMigration: true,  // User mới đã có email từ đầu
                    sessionVersion: 0,
                },
                select: { id: true },
            })

            // Tạo Workspace mặc định, user → OWNER
            const workspace = await tx.workspace.create({
                data: {
                    name: `${displayName}'s Workspace`,
                    profileId: profile.id,
                    status: 'ACTIVE',
                },
                select: { id: true },
            })
            await tx.workspaceMember.create({
                data: {
                    userId: user.id,
                    workspaceId: workspace.id,
                    role: 'OWNER',
                },
            })

            // [Sprint Z] Auto-create ProfileAccess(role=OWNER) — user là chủ profile
            // họ vừa tạo lúc signup. Cần thiết để new RBAC system gate workspace
            // creation + member invitation đúng.
            await tx.profileAccess.create({
                data: {
                    userId: user.id,
                    profileId: profile.id,
                    role: 'OWNER',
                },
            })

            // Tạo EmailVerificationToken (purpose=EMAIL_VERIFICATION, TTL 24h)
            const raw = generateRandomToken()
            const tokenHash = hashToken(raw)
            await tx.emailVerificationToken.create({
                data: {
                    userId: user.id,
                    tokenHash,
                    purpose: 'EMAIL_VERIFICATION',
                    email,
                    expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_HOURS * 60 * 60 * 1000),
                },
            })

            return { userId: user.id, rawToken: raw }
        })
        userId = result.userId
        rawToken = result.rawToken
    } catch (e: any) {
        console.error('[signup] transaction error:', e)
        await paddingDelay()
        // Rare race: another request created same email between check và create
        if (e?.code === 'P2002') {
            return GENERIC_SIGNUP_RESPONSE  // Treat as exists
        }
        return { success: false, message: 'Đã xảy ra lỗi. Vui lòng thử lại.' }
    }

    // ── 12. Audit log (non-blocking) ──
    try {
        await prisma.auditLog.create({
            data: {
                workspaceId: null,
                actorUserId: userId,
                userId: userId,
                action: 'auth.signup',
                targetType: 'User',
                targetId: userId,
                ipAddress: ip,
                userAgent: userAgent,
            },
        })
    } catch { /* non-blocking */ }

    // ── 13. Send verify email (fire-and-forget) ──
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hustlytasker.xyz'
    const verifyUrl = `${appUrl}/api/auth/verify-email?token=${rawToken}`
    const { subject, html } = buildVerifyEmailEmail({
        displayName,
        verifyUrl,
        expiresHours: VERIFY_TOKEN_TTL_HOURS,
    })
    sendEmail({ to: email, subject, html }).catch(e => {
        console.error('[signup] failed to send verify email:', e)
    })

    // M3 fix: pad to constant target để new-user path = existing-user path
    await padToTarget(startedAt)
    return GENERIC_SIGNUP_RESPONSE
}
