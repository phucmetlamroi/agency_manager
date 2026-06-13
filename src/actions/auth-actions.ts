'use server'

import { prisma } from '@/lib/db'
import { login, logout, loginWithProfile } from '@/lib/auth'
import { compare } from 'bcryptjs'
import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { rateLimit } from '@/lib/rate-limit'
import { checkLoginIp } from '@/lib/rate-limit-upstash'
import { UserRole } from '@prisma/client'
import { randomInt } from 'crypto'

// Auth Phase 1: lockout config
const LOCKOUT_THRESHOLD = 5             // 5 fail trong 15 phút → lock
const LOCKOUT_WINDOW_MINUTES = 15
const LOCKOUT_DURATION_MINUTES = 15

// Email regex (RFC 5322 lite)
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

// ─── Helper: response time padding (chống timing enumeration) ─────
// Use crypto.randomInt (CSPRNG) thay vì Math.random — tránh deterministic timing oracle.
async function paddingDelay() {
    const ms = randomInt(100, 301) // 100..300 ms inclusive
    await new Promise(r => setTimeout(r, ms))
}

// ─── Helper: log login attempt ─────────────────────────────────────
async function logLoginAttempt(opts: {
    userId: string | null
    emailTried: string
    success: boolean
    failReason?: string
    ipAddress: string
    userAgent: string | null
}) {
    try {
        await prisma.loginAttempt.create({
            data: {
                userId: opts.userId,
                emailTried: opts.emailTried.toLowerCase(),
                success: opts.success,
                failReason: opts.failReason,
                ipAddress: opts.ipAddress,
                userAgent: opts.userAgent,
            }
        })
    } catch (e) {
        // KHÔNG block business action nếu log thất bại
        console.error('[auth] Failed to log login attempt:', e)
    }
}

// ─── Helper: check & update lockout state ──────────────────────────
async function checkAndUpdateLockout(userId: string): Promise<{ locked: boolean; lockedUntil: Date | null }> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { failedLoginAttempts: true, lockedUntil: true }
    })

    if (!user) return { locked: false, lockedUntil: null }

    // Đang trong window lock → reject
    if (user.lockedUntil && user.lockedUntil > new Date()) {
        return { locked: true, lockedUntil: user.lockedUntil }
    }

    return { locked: false, lockedUntil: null }
}

/**
 * Atomic increment failedLoginAttempts. Nếu đạt threshold → set lockedUntil.
 * Toàn bộ chạy trong $transaction với serializable isolation để đảm bảo
 * 2 request concurrent KHÔNG bypass được lockout (HIGH #4 fix).
 */
async function bumpFailedAttempts(userId: string) {
    const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60 * 1000)
    const lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000)

    let didLock = false
    let failsInWindow = 0

    await prisma.$transaction(async (tx) => {
        // Count recent fails within transaction
        const recentFails = await tx.loginAttempt.count({
            where: {
                userId,
                success: false,
                createdAt: { gte: windowStart },
            }
        })
        failsInWindow = recentFails + 1

        if (failsInWindow >= LOCKOUT_THRESHOLD) {
            await tx.user.update({
                where: { id: userId },
                data: {
                    failedLoginAttempts: { increment: 1 },
                    lockedUntil: lockUntil,
                }
            })
            didLock = true
        } else {
            await tx.user.update({
                where: { id: userId },
                data: { failedLoginAttempts: { increment: 1 } }
            })
        }
    }, { isolationLevel: 'Serializable' })

    if (didLock) {
        try {
            await prisma.auditLog.create({
                data: {
                    workspaceId: null,
                    actorUserId: userId,
                    userId: userId,
                    action: 'auth.account_locked',
                    targetType: 'User',
                    targetId: userId,
                    afterData: { lockedUntil: lockUntil.toISOString(), failsInWindow },
                }
            })
        } catch { /* non-blocking */ }
    }
}

async function resetLockoutOnSuccess(userId: string, ip: string) {
    await prisma.user.update({
        where: { id: userId },
        data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
            lastLoginIp: ip,
        }
    })
}

// ─── Main action ──────────────────────────────────────────────────
/**
 * loginAction — hỗ trợ login bằng EMAIL hoặc USERNAME (transition mode).
 *
 * Auth Phase 1 thay đổi:
 *   - Field `username` đổi thành `emailOrUsername` (frontend form vẫn có thể gửi key 'username' để backward compat).
 *   - Nếu input chứa '@' → query bằng email; ngược lại query bằng username.
 *   - Account lockout: 5 fail trong 15 phút → khóa 15 phút.
 *   - Mọi error (user_not_found / invalid_password / locked / not_verified) trả về CÙNG message
 *     để chống user-status enumeration (theo §4.2 spec).
 *   - Ghi LoginAttempt mỗi lần (kể cả khi rate-limited).
 *   - Padding response time 100-300ms.
 *   - Hỗ trợ rememberMe (JWT TTL 30d thay vì 7d).
 */
export async function loginAction(prevState: any, formData: FormData) {
    // Backward compat: chấp nhận cả 'username' field cũ và 'emailOrUsername' field mới
    const emailOrUsername = (
        (formData.get('emailOrUsername') as string) ||
        (formData.get('username') as string) ||
        ''
    ).trim()
    const password = formData.get('password') as string
    const rememberMe = formData.get('rememberMe') === 'on' || formData.get('rememberMe') === 'true'

    if (!emailOrUsername || !password) {
        return { error: 'Vui lòng nhập đầy đủ thông tin.' }
    }

    // Generic error message cho mọi failure case (anti-enumeration)
    const GENERIC_AUTH_ERROR = 'Email hoặc mật khẩu không đúng. Vui lòng thử lại.'

    let ip = 'unknown-ip'
    let userAgent: string | null = null
    try {
        const headersList = await headers()
        ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim()
            || headersList.get('x-real-ip')
            || 'unknown-ip'
        userAgent = headersList.get('user-agent')
    } catch { /* edge runtime */ }

    // HIGH #6 fix: Use Upstash Redis (persistent across cold-starts) thay in-memory.
    // checkLoginIp = 10/phút/IP. Lockout per-user (5 fail/15 min) là tuyến phòng thủ thứ 2.
    try {
        const rl = await checkLoginIp(ip)
        if (!rl.success) {
            console.warn(`[SECURITY] Login rate limit triggered for IP: ${ip}`)
            await logLoginAttempt({
                userId: null,
                emailTried: emailOrUsername,
                success: false,
                failReason: 'rate_limited',
                ipAddress: ip,
                userAgent,
            })
            await paddingDelay()
            return { error: `Quá nhiều yêu cầu. Vui lòng thử lại sau ${rl.retryAfter ?? 60} giây.` }
        }
    } catch { /* skip nếu Upstash unreachable — fail-open ở dev */ }

    let userRole: string = 'USER'

    try {
        // ── Lookup: email-mode hoặc username-mode ──
        const isEmailMode = emailOrUsername.includes('@') && EMAIL_REGEX.test(emailOrUsername)
        const user = isEmailMode
            ? await prisma.user.findFirst({
                where: { email: emailOrUsername.toLowerCase() }
            })
            : await prisma.user.findUnique({
                where: { username: emailOrUsername }
            })

        if (!user) {
            await logLoginAttempt({
                userId: null,
                emailTried: emailOrUsername,
                success: false,
                failReason: 'user_not_found',
                ipAddress: ip,
                userAgent,
            })
            await paddingDelay()
            return { error: GENERIC_AUTH_ERROR }
        }

        // ── Check lockout BEFORE bcrypt verify (tiết kiệm CPU) ──
        const lockState = await checkAndUpdateLockout(user.id)
        if (lockState.locked) {
            await logLoginAttempt({
                userId: user.id,
                emailTried: emailOrUsername,
                success: false,
                failReason: 'account_locked',
                ipAddress: ip,
                userAgent,
            })
            await paddingDelay()
            // KHÔNG tiết lộ status lock — trả generic error
            return { error: GENERIC_AUTH_ERROR }
        }

        // [Google OAuth] User created via Google Sign-In has no password.
        // Reject password login the SAME way as a wrong password (generic error,
        // bump attempts, timing-safe) so we don't leak that the account is
        // Google-only — and so compare() never runs against a null hash.
        if (!user.password) {
            await bumpFailedAttempts(user.id)
            await logLoginAttempt({
                userId: user.id,
                emailTried: emailOrUsername,
                success: false,
                failReason: 'invalid_password',
                ipAddress: ip,
                userAgent,
            })
            await paddingDelay()
            return { error: GENERIC_AUTH_ERROR }
        }

        // ── Verify password ──
        const isValid = await compare(password, user.password)
        if (!isValid) {
            await bumpFailedAttempts(user.id)
            await logLoginAttempt({
                userId: user.id,
                emailTried: emailOrUsername,
                success: false,
                failReason: 'invalid_password',
                ipAddress: ip,
                userAgent,
            })
            await paddingDelay()
            return { error: GENERIC_AUTH_ERROR }
        }

        // ── Check role LOCKED (banned by admin) ──
        if (user.role === 'LOCKED') {
            await logLoginAttempt({
                userId: user.id,
                emailTried: emailOrUsername,
                success: false,
                failReason: 'role_locked',
                ipAddress: ip,
                userAgent,
            })
            await paddingDelay()
            return { error: GENERIC_AUTH_ERROR }
        }

        // ── Login success ──
        userRole = user.role
        await resetLockoutOnSuccess(user.id, ip)
        await logLoginAttempt({
            userId: user.id,
            emailTried: emailOrUsername,
            success: true,
            ipAddress: ip,
            userAgent,
        })

        // Audit log success (workspaceId = null cho auth events)
        try {
            await prisma.auditLog.create({
                data: {
                    workspaceId: null,
                    actorUserId: user.id,
                    userId: user.id,
                    action: 'auth.login_success',
                    targetType: 'User',
                    targetId: user.id,
                    ipAddress: ip,
                    userAgent: userAgent,
                }
            })
        } catch { /* non-blocking */ }

        // Build session payload với các Auth Phase 1 claims
        const sessionPayload = {
            id: user.id,
            username: user.username,
            role: user.role,
            profileId: user.profileId,
            // Auth Phase 1 claims
            sessionVersion: user.sessionVersion ?? 0,
            email: user.email,
            displayName: user.displayName ?? user.nickname ?? user.username,
            // restricted = true nếu user chưa verify email (trừ user cũ đã grandfathered)
            restricted: !user.emailVerified && user.hasCompletedEmailMigration === false ? false : !user.emailVerified,
            // requiresEmailMigration = true nếu user cũ chưa hoàn tất migration
            requiresEmailMigration: !user.hasCompletedEmailMigration,
        }

        // [Canonical Clients] CLIENT accounts can no longer log in — the
        // account portal was replaced by public /share/[token] links and the
        // accounts are LOCKED by scripts/deactivate-legacy-client-accounts.
        // Defensive guard for any row the script hasn't reached yet.
        if (userRole === 'CLIENT') {
            return { error: 'Tài khoản khách hàng đã được thay bằng link chia sẻ. Vui lòng liên hệ agency để nhận link theo dõi dự án.' }
        }

        // Staff/Admin → auto-select profile + workspace
        let defaultProfileId = user.profileId
        if (!defaultProfileId) {
            const crossAccess = await prisma.profileAccess.findFirst({
                where: { userId: user.id },
                select: { profileId: true }
            })
            defaultProfileId = crossAccess?.profileId ?? null
        }

        if (!defaultProfileId) {
            await login(sessionPayload, { rememberMe })
            redirect('/login')
        }

        await loginWithProfile(sessionPayload, defaultProfileId, { rememberMe })

        const firstWs = await prisma.workspace.findFirst({
            where: { profileId: defaultProfileId, status: { not: 'SOFT_DELETED' } },
            orderBy: { createdAt: 'desc' },
        })

        if (!firstWs) {
            redirect('/login')
        }

        redirect(`/${firstWs.id}/admin`)

    } catch (err) {
        if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err
        console.error('[Login] ERROR:', err)
        await paddingDelay()
        return { error: 'Đã xảy ra lỗi. Vui lòng thử lại.' }
    }
}

export async function logoutAction() {
    await logout()
    redirect('/login')
}
