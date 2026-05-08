'use server'

/**
 * Auth Phase 3 — Email migration cho user cũ (Vietnamese username, no email).
 *
 * 2-step flow:
 *   1. requestEmailMigrationOtp(newEmail)    — gửi OTP đến newEmail
 *   2. verifyEmailMigrationOtp(newEmail, otp) — verify + atomic update User.email
 *
 * Security highlights:
 *   - User MUST be authenticated với requiresEmailMigration=true claim trong JWT.
 *   - Verify OTP ở email mới TRƯỚC KHI gán — chống takeover (kẻ tấn công đoán
 *     password user cũ rồi gán email của hắn).
 *   - Atomic transaction: check duplicate + update User + bump sessionVersion.
 *   - sessionVersion bump → JWT cũ bị reject; user phải re-login với email mới.
 *   - Audit log với action='auth.email_migrated'.
 */

import { prisma } from '@/lib/db'
import { headers } from 'next/headers'
import { randomInt } from 'crypto'
import { generateOtp, hashOtp, verifyOtp } from '@/lib/otp'
import { validateEmailForSignup } from '@/lib/email-validator'
import { checkOtpEmail, checkOtpIp } from '@/lib/rate-limit-upstash'
import { sendEmail } from '@/lib/email'
import { buildPasswordResetOtpEmail } from '@/lib/notification-emails/templates/auth/password-reset-otp'
import { getSession } from '@/lib/auth'
import { getCurrentUser } from '@/lib/auth-guard'

const OTP_TTL_MINUTES = 10
const OTP_MAX_ATTEMPTS = 5
const PURPOSE = 'EMAIL_MIGRATION'  // C1 fix: distinct purpose từ PASSWORD_RESET

// Strip CRLF (chống email header injection nếu displayName được dùng trong subject sau này)
function sanitizeForHeader(s: string): string {
    return (s ?? '').replace(/[\r\n]/g, '').trim()
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

// ─── Step 1: Request OTP ──────────────────────────────────────────

export async function requestEmailMigrationOtp(newEmailRaw: string) {
    // Authenticate user qua session
    const user = await getCurrentUser().catch(() => null)
    if (!user) {
        await paddingDelay()
        return { success: false, message: 'Bạn cần đăng nhập.' }
    }

    // M1 fix: Verify JWT claim `requiresEmailMigration=true`
    // Already-migrated users KHÔNG được call này (sẽ overwrite email).
    const session = await getSession()
    const dbUserCheck = await prisma.user.findUnique({
        where: { id: user.id },
        select: { hasCompletedEmailMigration: true },
    })
    if (!dbUserCheck || dbUserCheck.hasCompletedEmailMigration === true) {
        await paddingDelay()
        return { success: false, message: 'Tài khoản này đã được liên kết email. Liên hệ admin nếu cần đổi email.' }
    }

    const newEmail = (newEmailRaw ?? '').trim().toLowerCase()
    const { ip } = await getRequestMeta()

    // Validate email format + disposable
    const validation = validateEmailForSignup(newEmail)
    if (!validation.valid) {
        await paddingDelay()
        return { success: false, message: validation.message ?? 'Email không hợp lệ.' }
    }

    // C2 fix: KHÔNG pre-check email duplicate ở đây — gây enumeration leak
    // (kẻ tấn công biết email đã đăng ký bằng cách nhìn message khác nhau).
    // Thay vào đó, check duplicate được làm ATOMICALLY trong transaction ở
    // verifyEmailMigrationOtp. Nếu duplicate ở giai đoạn verify, trả lỗi
    // generic "OTP không đúng" — kẻ tấn công không phân biệt được email tồn tại.

    // Rate limit
    const ipLimit = await checkOtpIp(ip)
    if (!ipLimit.success) {
        await paddingDelay()
        return {
            success: false,
            message: `Quá nhiều yêu cầu. Vui lòng thử lại sau ${ipLimit.retryAfter ?? 600} giây.`,
        }
    }
    const emailLimit = await checkOtpEmail(newEmail)
    if (!emailLimit.success) {
        await paddingDelay()
        return {
            success: false,
            message: 'Quá nhiều yêu cầu cho email này. Vui lòng thử lại sau.',
        }
    }

    // Invalidate previous unconsumed EMAIL_MIGRATION OTPs (purpose-scoped)
    await prisma.passwordResetOTP.updateMany({
        where: { userId: user.id, purpose: PURPOSE, consumedAt: null, invalidatedAt: null },
        data: { invalidatedAt: new Date() },
    })

    // Generate + persist OTP với purpose=EMAIL_MIGRATION
    const otp = generateOtp()
    const otpHash = hashOtp(otp)
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)

    await prisma.passwordResetOTP.create({
        data: {
            userId: user.id,
            otpHash,
            purpose: PURPOSE,
            email: newEmail,  // snapshot — bind OTP vs new email
            expiresAt,
            ipAddress: ip,
        },
    })

    // Audit log
    try {
        await prisma.auditLog.create({
            data: {
                workspaceId: null,
                actorUserId: user.id,
                userId: user.id,
                action: 'auth.email_migration_otp_requested',
                targetType: 'User',
                targetId: user.id,
                ipAddress: ip,
                afterData: { newEmail },
            },
        })
    } catch { /* non-blocking */ }

    // Send OTP email (re-use password-reset-otp template — generic OTP UI)
    // Lookup displayName từ DB (AuthContext có thể null username cho cases nhất định)
    const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { displayName: true, username: true, nickname: true },
    })
    const displayName = dbUser?.displayName ?? dbUser?.nickname ?? dbUser?.username ?? 'User'
    const { subject, html } = buildPasswordResetOtpEmail({
        displayName,
        otp,
        expiresMinutes: OTP_TTL_MINUTES,
    })
    sendEmail({ to: newEmail, subject, html }).catch(e => {
        console.error('[email-migration] failed to send OTP:', e)
    })

    await paddingDelay()
    return { success: true, message: `Đã gửi mã OTP đến ${newEmail}. Vui lòng kiểm tra hộp thư.` }
}

// ─── Step 2: Verify OTP + atomic email update ─────────────────────

export async function verifyEmailMigrationOtp(newEmailRaw: string, otpInput: string) {
    const user = await getCurrentUser().catch(() => null)
    if (!user) {
        await paddingDelay()
        return { success: false, message: 'Bạn cần đăng nhập.' }
    }

    const newEmail = (newEmailRaw ?? '').trim().toLowerCase()
    const otp = (otpInput ?? '').trim()
    const { ip, userAgent } = await getRequestMeta()

    if (!newEmail || !otp || !/^\d{6}$/.test(otp)) {
        await paddingDelay()
        return { success: false, message: 'Mã OTP không hợp lệ.' }
    }

    // Find latest OTP cho user + bound vs newEmail — purpose-scoped (C1 fix)
    const otpRecord = await prisma.passwordResetOTP.findFirst({
        where: {
            userId: user.id,
            purpose: PURPOSE,  // EMAIL_MIGRATION only — chống token confusion với PASSWORD_RESET
            email: newEmail,
            consumedAt: null,
            invalidatedAt: null,
            expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
    })
    if (!otpRecord) {
        await paddingDelay()
        return { success: false, message: 'Mã OTP không đúng hoặc đã hết hạn.' }
    }

    const isValid = verifyOtp(otp, otpRecord.otpHash)
    if (!isValid) {
        // Atomic optimistic-lock increment
        const newCount = otpRecord.attemptCount + 1
        const willInvalidate = newCount >= OTP_MAX_ATTEMPTS
        await prisma.passwordResetOTP.updateMany({
            where: { id: otpRecord.id, attemptCount: otpRecord.attemptCount },
            data: {
                attemptCount: newCount,
                invalidatedAt: willInvalidate ? new Date() : null,
            },
        })
        await paddingDelay()
        return { success: false, message: 'Mã OTP không đúng hoặc đã hết hạn.' }
    }

    // OTP correct → atomic transaction:
    //   - Re-check email không trùng (race-safe)
    //   - Update User.email + emailVerified + hasCompletedEmailMigration
    //   - Bump sessionVersion → invalidate JWT cũ (user phải re-login)
    //   - Mark OTP consumed
    try {
        await prisma.$transaction(async (tx) => {
            const dup = await tx.user.findFirst({
                where: { email: newEmail, id: { not: user.id } },
                select: { id: true },
            })
            if (dup) {
                throw new Error('EMAIL_TAKEN')
            }

            const consumed = await tx.passwordResetOTP.updateMany({
                where: { id: otpRecord.id, consumedAt: null, invalidatedAt: null },
                data: { consumedAt: new Date() },
            })
            if (consumed.count === 0) {
                throw new Error('OTP_RACE')
            }

            await tx.user.update({
                where: { id: user.id },
                data: {
                    email: newEmail,
                    emailVerified: true,
                    emailVerifiedAt: new Date(),
                    hasCompletedEmailMigration: true,
                    sessionVersion: { increment: 1 },  // Force re-login với email mới
                },
            })

            await tx.auditLog.create({
                data: {
                    workspaceId: null,
                    actorUserId: user.id,
                    userId: user.id,
                    action: 'auth.email_migrated',
                    targetType: 'User',
                    targetId: user.id,
                    ipAddress: ip,
                    userAgent: userAgent,
                    afterData: { newEmail },
                },
            })
        })
    } catch (e: any) {
        if (e?.message === 'EMAIL_TAKEN') {
            // C2 fix: KHÔNG tiết lộ rằng email đã có user khác.
            // Trả message generic giống như OTP sai — kẻ tấn công không phân biệt được.
            await paddingDelay()
            return { success: false, message: 'Mã OTP không đúng hoặc đã hết hạn.' }
        }
        if (e?.message === 'OTP_RACE') {
            await paddingDelay()
            return { success: false, message: 'Mã OTP đã được sử dụng. Vui lòng thử lại.' }
        }
        console.error('[email-migration] transaction error:', e)
        await paddingDelay()
        return { success: false, message: 'Đã xảy ra lỗi. Vui lòng thử lại.' }
    }

    return {
        success: true,
        message: 'Email đã được liên kết thành công. Vui lòng đăng nhập lại với email mới.',
    }
}
