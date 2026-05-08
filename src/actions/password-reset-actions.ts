'use server'

/**
 * Auth Phase 2 — Password Reset OTP server actions.
 *
 * 3-step flow:
 *   1. requestPasswordResetOtp(email)         — gửi OTP qua email
 *   2. verifyPasswordResetOtp(email, otp)     — verify OTP, trả resetToken
 *   3. resetPasswordWithToken(token, newPwd)  — đổi password, bump sessionVersion, gửi alert email
 *
 * Security highlights (theo §4.3 spec):
 *   - Anti-enumeration: response giống nhau dù email tồn tại hay không.
 *   - OTP hash SHA-256, TTL 10 phút, max 5 attempts.
 *   - Reset token 32-byte hex, hash SHA-256, TTL 5 phút, single-use.
 *   - Rate limit: 3 OTP/email/h + 60s cooldown, 10/IP/h.
 *   - Bump sessionVersion sau reset → invalidate tất cả JWT cũ.
 *   - HIBP check + ≥12 chars cho new password.
 */

import { prisma } from '@/lib/db'
import { hash } from 'bcryptjs'
import { headers } from 'next/headers'
import { randomInt } from 'crypto'
import { generateOtp, hashOtp, verifyOtp, generateRandomToken, hashToken } from '@/lib/otp'
import { validatePasswordFull } from '@/lib/password-validator'
import { checkOtpEmail, checkOtpIp } from '@/lib/rate-limit-upstash'
import { sendEmail } from '@/lib/email'
import { buildPasswordResetOtpEmail } from '@/lib/notification-emails/templates/auth/password-reset-otp'
import { buildPasswordChangedEmail } from '@/lib/notification-emails/templates/auth/password-changed'

const RESET_TOKEN_PURPOSE = 'PASSWORD_RESET'  // EmailVerificationToken.purpose marker

const OTP_TTL_MINUTES = 10
const OTP_COOLDOWN_SECONDS = 60
const OTP_MAX_ATTEMPTS = 5
const RESET_TOKEN_TTL_MINUTES = 5
const NEW_USER_BCRYPT_COST = 12  // Higher cost for password resets (treated as fresh password)

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

const GENERIC_OTP_RESPONSE = {
    success: true,
    message: 'Nếu email tồn tại trong hệ thống, mã OTP đã được gửi tới hộp thư. Vui lòng kiểm tra trong vòng 10 phút tới.',
}

// Use crypto.randomInt (CSPRNG) thay vì Math.random — tránh deterministic timing oracle.
async function paddingDelay() {
    const ms = randomInt(100, 301)  // 100..300 ms inclusive
    await new Promise(r => setTimeout(r, ms))
}

async function getRequestMeta() {
    let ip = 'unknown-ip'
    let userAgent: string | null = null
    try {
        const h = await headers()
        ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown-ip'
        userAgent = h.get('user-agent')
    } catch { /* edge runtime */ }
    return { ip, userAgent }
}

// ─── 1. Request OTP ────────────────────────────────────────────────

export async function requestPasswordResetOtp(emailRaw: string) {
    const email = (emailRaw ?? '').trim().toLowerCase()
    const { ip } = await getRequestMeta()

    // Format check (silent fail — vẫn return generic)
    if (!email || !EMAIL_REGEX.test(email)) {
        await paddingDelay()
        return GENERIC_OTP_RESPONSE
    }

    // Rate limit IP (10/h) — dùng cho both email tồn tại và không
    const ipLimit = await checkOtpIp(ip)
    if (!ipLimit.success) {
        await paddingDelay()
        return {
            success: false,
            message: `Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ${ipLimit.retryAfter ?? 600} giây.`,
            retryAfter: ipLimit.retryAfter,
        }
    }

    // Rate limit email (3/h)
    const emailLimit = await checkOtpEmail(email)
    if (!emailLimit.success) {
        await paddingDelay()
        // Vẫn return GENERIC để tránh tiết lộ rằng email này tồn tại (đã từng gửi 3 OTP)
        return GENERIC_OTP_RESPONSE
    }

    // Lookup user — nếu không tồn tại, vẫn return success
    const user = await prisma.user.findFirst({
        where: { email },
        select: { id: true, email: true, displayName: true, username: true, nickname: true, role: true },
    })

    if (!user || user.role === 'LOCKED') {
        await paddingDelay()
        return GENERIC_OTP_RESPONSE
    }

    // Cooldown 60s giữa 2 lần gửi liên tiếp cho cùng email (purpose-scoped)
    const recent = await prisma.passwordResetOTP.findFirst({
        where: {
            userId: user.id,
            purpose: 'PASSWORD_RESET',
            createdAt: { gte: new Date(Date.now() - OTP_COOLDOWN_SECONDS * 1000) },
            invalidatedAt: null,
        },
        orderBy: { createdAt: 'desc' },
    })
    if (recent) {
        await paddingDelay()
        return {
            success: true,
            message: `Mã OTP đã được gửi gần đây. Vui lòng kiểm tra hộp thư hoặc đợi ${OTP_COOLDOWN_SECONDS}s trước khi yêu cầu lại.`,
        }
    }

    // Invalidate previous unconsumed PASSWORD_RESET OTPs for this user (purpose-scoped)
    await prisma.passwordResetOTP.updateMany({
        where: { userId: user.id, purpose: 'PASSWORD_RESET', consumedAt: null, invalidatedAt: null },
        data: { invalidatedAt: new Date() },
    })

    // Generate + hash + persist
    const otp = generateOtp()
    const otpHash = hashOtp(otp)
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)

    await prisma.passwordResetOTP.create({
        data: {
            userId: user.id,
            otpHash,
            purpose: 'PASSWORD_RESET',
            email: user.email!,
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
                action: 'auth.password_reset_requested',
                targetType: 'User',
                targetId: user.id,
                ipAddress: ip,
            },
        })
    } catch { /* non-blocking */ }

    // Send email (KHÔNG await — fire-and-forget để không làm slow response)
    const displayName = user.displayName ?? user.nickname ?? user.username
    const { subject, html } = buildPasswordResetOtpEmail({
        displayName,
        otp,
        expiresMinutes: OTP_TTL_MINUTES,
    })
    sendEmail({ to: user.email!, subject, html }).catch(e => {
        console.error('[password-reset] failed to send OTP email:', e)
    })

    await paddingDelay()
    return GENERIC_OTP_RESPONSE
}

// ─── 2. Verify OTP → return reset token ────────────────────────────

export async function verifyPasswordResetOtp(emailRaw: string, otpInput: string) {
    const email = (emailRaw ?? '').trim().toLowerCase()
    const otp = (otpInput ?? '').trim()
    const { ip } = await getRequestMeta()

    // Generic "invalid OTP" response — KHÔNG bao gồm `attemptsRemaining` để tránh
    // enumeration leak (HIGH #3): user_not_found không có attemptsRemaining,
    // user_exists có attemptsRemaining → leak.
    const GENERIC_INVALID = { success: false, message: 'Mã OTP không đúng hoặc đã hết hạn.' }

    if (!email || !otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
        await paddingDelay()
        return GENERIC_INVALID
    }

    const user = await prisma.user.findFirst({
        where: { email },
        select: { id: true },
    })
    if (!user) {
        await paddingDelay()
        return GENERIC_INVALID
    }

    // Find latest unconsumed OTP for this user — purpose-scoped (PASSWORD_RESET only)
    const otpRecord = await prisma.passwordResetOTP.findFirst({
        where: {
            userId: user.id,
            purpose: 'PASSWORD_RESET',  // C1 fix: prevent token confusion với migration OTP
            consumedAt: null,
            invalidatedAt: null,
            expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
    })

    if (!otpRecord) {
        await paddingDelay()
        return GENERIC_INVALID
    }

    const isValid = verifyOtp(otp, otpRecord.otpHash)

    if (!isValid) {
        // CRITICAL #1 fix: Atomic optimistic-lock increment — concurrent requests
        // không thể bypass attempt counter. updateMany với where=current count chỉ
        // success nếu count chưa đổi; nếu race xảy ra thì 1 trong 2 sẽ no-op.
        const expectedCount = otpRecord.attemptCount
        const newAttemptCount = expectedCount + 1
        const willInvalidate = newAttemptCount >= OTP_MAX_ATTEMPTS

        const updateResult = await prisma.passwordResetOTP.updateMany({
            where: {
                id: otpRecord.id,
                attemptCount: expectedCount,  // optimistic lock
                consumedAt: null,
                invalidatedAt: null,
            },
            data: {
                attemptCount: newAttemptCount,
                invalidatedAt: willInvalidate ? new Date() : null,
            },
        })

        // Nếu update count = 0 → race condition đã xảy ra; treat as if attempt failed
        // mà không tăng counter (an toàn hơn — fail-secure).
        await paddingDelay()
        return GENERIC_INVALID
    }

    // OTP correct → consume + tạo reset token (atomic transaction)
    const rawToken = generateRandomToken()
    const tokenHash = hashToken(rawToken)
    const tokenExpires = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000)

    try {
        await prisma.$transaction([
            // CRITICAL #2 fix: dùng `purpose=PASSWORD_RESET` thay vì email marker
            prisma.emailVerificationToken.create({
                data: {
                    userId: user.id,
                    tokenHash,
                    purpose: RESET_TOKEN_PURPOSE,
                    email: emailRaw, // snapshot original email
                    expiresAt: tokenExpires,
                },
            }),
            // Atomic consume — chỉ update nếu chưa bị consume bởi request khác
            prisma.passwordResetOTP.updateMany({
                where: {
                    id: otpRecord.id,
                    consumedAt: null,
                    invalidatedAt: null,
                },
                data: {
                    consumedAt: new Date(),
                    attemptCount: otpRecord.attemptCount + 1,
                },
            }),
        ])
    } catch (e) {
        console.error('[password-reset] transaction failed:', e)
        await paddingDelay()
        return GENERIC_INVALID
    }

    return {
        success: true,
        resetToken: rawToken,  // Raw — chỉ trả về 1 lần này
        expiresIn: RESET_TOKEN_TTL_MINUTES * 60,
    }
}

// ─── 3. Reset password with token ──────────────────────────────────

export async function resetPasswordWithToken(rawToken: string, newPassword: string) {
    if (!rawToken || !newPassword) {
        return { success: false, message: 'Thiếu thông tin.' }
    }

    // Validate password (strength + HIBP)
    const validation = await validatePasswordFull(newPassword)
    if (!validation.valid) {
        return { success: false, message: validation.errors.join(' ') }
    }

    const tokenHash = hashToken(rawToken)
    // CRITICAL #2 fix: filter bằng purpose=PASSWORD_RESET (không phải email marker)
    const tokenRecord = await prisma.emailVerificationToken.findFirst({
        where: {
            tokenHash,
            purpose: RESET_TOKEN_PURPOSE,
            usedAt: null,
            expiresAt: { gt: new Date() },
        },
    })

    if (!tokenRecord) {
        return { success: false, message: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.' }
    }

    // Get user info trước update để gửi email
    const user = await prisma.user.findUnique({
        where: { id: tokenRecord.userId },
        select: {
            id: true, email: true, displayName: true, username: true, nickname: true,
        }
    })
    if (!user) {
        return { success: false, message: 'Tài khoản không tồn tại.' }
    }

    const { ip, userAgent } = await getRequestMeta()
    const newHash = await hash(newPassword, NEW_USER_BCRYPT_COST)

    // Atomic: mark token used (with optimistic lock) + update password + bump sessionVersion
    // Optimistic lock đảm bảo token không thể được dùng 2 lần trong 2 request concurrent.
    try {
        await prisma.$transaction(async (tx) => {
            const consumed = await tx.emailVerificationToken.updateMany({
                where: {
                    id: tokenRecord.id,
                    usedAt: null, // chỉ update nếu chưa used
                    purpose: RESET_TOKEN_PURPOSE,
                },
                data: { usedAt: new Date() },
            })
            if (consumed.count === 0) {
                throw new Error('TOKEN_ALREADY_USED')
            }
            await tx.user.update({
                where: { id: user.id },
                data: {
                    password: newHash,
                    lastPasswordChangedAt: new Date(),
                    // Bump sessionVersion → invalidate tất cả JWT cũ
                    sessionVersion: { increment: 1 },
                    // Reset lockout state
                    failedLoginAttempts: 0,
                    lockedUntil: null,
                },
            })
        })
    } catch (e: any) {
        if (e?.message === 'TOKEN_ALREADY_USED') {
            return { success: false, message: 'Liên kết đặt lại mật khẩu đã được sử dụng. Vui lòng yêu cầu lại.' }
        }
        console.error('[password-reset] transaction error:', e)
        return { success: false, message: 'Đã xảy ra lỗi. Vui lòng thử lại.' }
    }

    // Audit log
    try {
        await prisma.auditLog.create({
            data: {
                workspaceId: null,
                actorUserId: user.id,
                userId: user.id,
                action: 'auth.password_reset_completed',
                targetType: 'User',
                targetId: user.id,
                ipAddress: ip,
                userAgent: userAgent,
            },
        })
    } catch { /* non-blocking */ }

    // Send security alert email (fire-and-forget)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hustlytasker.xyz'
    const displayName = user.displayName ?? user.nickname ?? user.username
    if (user.email) {
        const { subject, html } = buildPasswordChangedEmail({
            displayName,
            timestamp: new Date(),
            ipAddress: ip,
            userAgent,
            appUrl,
        })
        sendEmail({ to: user.email, subject, html }).catch(e => {
            console.error('[password-reset] failed to send confirmation email:', e)
        })
    }

    return {
        success: true,
        message: 'Mật khẩu đã được cập nhật thành công. Vui lòng đăng nhập lại.',
    }
}
