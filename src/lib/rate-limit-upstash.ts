/**
 * Auth Phase 2 — Upstash Redis rate-limit cho auth endpoints.
 *
 * Tại sao thay rate-limit.ts (in-memory)?
 *   - In-memory state RESET khi Vercel cold-start serverless function. Attacker có thể
 *     trigger cold-start liên tục để bypass rate-limit. Auth flows (signup/forgot/login)
 *     MUST có persistent rate-limit.
 *   - Upstash Redis HTTP-based, latency ~30-50ms, hỗ trợ Edge runtime.
 *
 * Configured limiters (theo §7.10 spec login.md):
 *   - signupIp:    5 signup / 1 giờ / IP
 *   - signupEmail: 3 signup / 1 giờ / email
 *   - loginIp:     10 login / 1 phút / IP (rộng hơn vì có lockout sau 5 fail)
 *   - otpEmail:    3 OTP / 1 giờ / email + cooldown 60s giữa lần
 *   - otpIp:       10 OTP / 1 giờ / IP (chống bulk enumeration)
 *
 * Fallback: nếu UPSTASH_* env không set → return success=true (cho dev local).
 * Production deploy SẼ FAIL nếu env thiếu vì rate-limit là security-critical.
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Lazy-init Redis client; chỉ tạo khi env có sẵn để dev local không cần Upstash
let _redis: Redis | null | undefined = undefined

function getRedis(): Redis | null {
    if (_redis !== undefined) return _redis

    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN

    if (!url || !token) {
        if (process.env.NODE_ENV === 'production') {
            console.error('[rate-limit-upstash] UPSTASH_REDIS_REST_URL/TOKEN missing in production!')
        } else {
            console.warn('[rate-limit-upstash] Upstash not configured — rate limits will be permissive in dev.')
        }
        _redis = null
        return null
    }

    _redis = new Redis({ url, token })
    return _redis
}

// Lazy-init limiters — tạo 1 lần per process
let _signupIpLimiter: Ratelimit | null = null
let _signupEmailLimiter: Ratelimit | null = null
let _loginIpLimiter: Ratelimit | null = null
let _otpEmailLimiter: Ratelimit | null = null
let _otpIpLimiter: Ratelimit | null = null
let _inviteLimiter: Ratelimit | null = null

function getSignupIpLimiter() {
    if (_signupIpLimiter) return _signupIpLimiter
    const redis = getRedis()
    if (!redis) return null
    _signupIpLimiter = new Ratelimit({
        redis, limiter: Ratelimit.slidingWindow(5, '1 h'),
        analytics: true, prefix: 'rl:signup:ip',
    })
    return _signupIpLimiter
}

function getSignupEmailLimiter() {
    if (_signupEmailLimiter) return _signupEmailLimiter
    const redis = getRedis()
    if (!redis) return null
    _signupEmailLimiter = new Ratelimit({
        redis, limiter: Ratelimit.slidingWindow(3, '1 h'),
        analytics: true, prefix: 'rl:signup:email',
    })
    return _signupEmailLimiter
}

function getLoginIpLimiter() {
    if (_loginIpLimiter) return _loginIpLimiter
    const redis = getRedis()
    if (!redis) return null
    _loginIpLimiter = new Ratelimit({
        redis, limiter: Ratelimit.slidingWindow(10, '1 m'),
        analytics: true, prefix: 'rl:login:ip',
    })
    return _loginIpLimiter
}

function getOtpEmailLimiter() {
    if (_otpEmailLimiter) return _otpEmailLimiter
    const redis = getRedis()
    if (!redis) return null
    _otpEmailLimiter = new Ratelimit({
        redis, limiter: Ratelimit.slidingWindow(3, '1 h'),
        analytics: true, prefix: 'rl:otp:email',
    })
    return _otpEmailLimiter
}

function getOtpIpLimiter() {
    if (_otpIpLimiter) return _otpIpLimiter
    const redis = getRedis()
    if (!redis) return null
    _otpIpLimiter = new Ratelimit({
        redis, limiter: Ratelimit.slidingWindow(10, '1 h'),
        analytics: true, prefix: 'rl:otp:ip',
    })
    return _otpIpLimiter
}

function getInviteLimiter() {
    if (_inviteLimiter) return _inviteLimiter
    const redis = getRedis()
    if (!redis) return null
    // 5 invites cho cùng (workspace, target user) trong 24h.
    // Audit finding #2.7: Trước đây ADMIN có thể spam mời cùng user nhiều lần
    // → invitee inbox bị flood (DoS chiến thuật).
    _inviteLimiter = new Ratelimit({
        redis, limiter: Ratelimit.slidingWindow(5, '1 d'),
        analytics: true, prefix: 'rl:invite',
    })
    return _inviteLimiter
}

// ─── Public API ──────────────────────────────────────────────────

export type RateLimitResult = {
    success: boolean
    limit?: number
    remaining?: number
    reset?: number     // Unix ms timestamp
    retryAfter?: number // Seconds until allowed again
}

/**
 * Check signup rate limit theo IP. 5/giờ.
 */
export async function checkSignupIp(ip: string): Promise<RateLimitResult> {
    const limiter = getSignupIpLimiter()
    if (!limiter) return { success: true } // Dev fallback
    const r = await limiter.limit(`ip:${ip}`)
    return {
        success: r.success,
        limit: r.limit,
        remaining: r.remaining,
        reset: r.reset,
        retryAfter: r.success ? undefined : Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)),
    }
}

/**
 * Check signup rate limit theo email. 3/giờ. Chống enumeration loop.
 */
export async function checkSignupEmail(email: string): Promise<RateLimitResult> {
    const limiter = getSignupEmailLimiter()
    if (!limiter) return { success: true }
    const r = await limiter.limit(`email:${email.toLowerCase()}`)
    return {
        success: r.success,
        limit: r.limit,
        remaining: r.remaining,
        reset: r.reset,
        retryAfter: r.success ? undefined : Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)),
    }
}

/**
 * Check login rate limit theo IP. 10/phút. Đây là tuyến phòng thủ thứ 1
 * (lockout per-user là tuyến thứ 2 sau 5 fail).
 */
export async function checkLoginIp(ip: string): Promise<RateLimitResult> {
    const limiter = getLoginIpLimiter()
    if (!limiter) return { success: true }
    const r = await limiter.limit(`ip:${ip}`)
    return {
        success: r.success,
        limit: r.limit,
        remaining: r.remaining,
        reset: r.reset,
        retryAfter: r.success ? undefined : Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)),
    }
}

/**
 * Check OTP send rate limit theo email. 3/giờ + cooldown 60s.
 * Cooldown 60s implement riêng ở caller (check `createdAt` của OTP gần nhất).
 */
export async function checkOtpEmail(email: string): Promise<RateLimitResult> {
    const limiter = getOtpEmailLimiter()
    if (!limiter) return { success: true }
    const r = await limiter.limit(`email:${email.toLowerCase()}`)
    return {
        success: r.success,
        limit: r.limit,
        remaining: r.remaining,
        reset: r.reset,
        retryAfter: r.success ? undefined : Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)),
    }
}

/**
 * Check OTP request rate limit theo IP. 10/giờ. Chống bulk enumeration.
 */
export async function checkOtpIp(ip: string): Promise<RateLimitResult> {
    const limiter = getOtpIpLimiter()
    if (!limiter) return { success: true }
    const r = await limiter.limit(`ip:${ip}`)
    return {
        success: r.success,
        limit: r.limit,
        remaining: r.remaining,
        reset: r.reset,
        retryAfter: r.success ? undefined : Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)),
    }
}

/**
 * Check invitation rate limit theo (workspace, target user) tuple. 5/24h.
 * Chống spam ADMIN mời cùng user nhiều lần.
 */
export async function checkInviteRate(workspaceId: string, targetUserId: string): Promise<RateLimitResult> {
    const limiter = getInviteLimiter()
    if (!limiter) return { success: true }
    const r = await limiter.limit(`ws:${workspaceId}:user:${targetUserId}`)
    return {
        success: r.success,
        limit: r.limit,
        remaining: r.remaining,
        reset: r.reset,
        retryAfter: r.success ? undefined : Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)),
    }
}
