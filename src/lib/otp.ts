/**
 * Auth Phase 2 — OTP utilities cho password reset & email migration verification.
 *
 * Design (theo §4.3 spec):
 *   - 6 chữ số decimal (1 triệu khả năng → đủ với rate-limit + 5-attempt invalidation).
 *   - SHA-256 hash trước khi lưu DB. KHÔNG lưu plaintext anywhere.
 *   - SHA-256 (fast hash) đủ với OTP vì keyspace nhỏ → bcrypt không thêm giá trị.
 *     (Theo OWASP MFA Cheat Sheet: "Hashing OTPs is still recommended ... for short-term
 *      exposure protection, not long-term cryptographic secrecy.")
 *   - TTL 10 phút (cân bằng UX recovery vs security).
 */

import { randomInt, createHash, randomBytes } from 'crypto'

/**
 * Generate cryptographically secure 6-digit OTP.
 * Range: "100000" - "999999" (zero-padded nếu cần).
 */
export function generateOtp(): string {
    const n = randomInt(0, 1_000_000)
    return n.toString().padStart(6, '0')
}

/**
 * SHA-256 hash của OTP. Deterministic — cùng OTP → cùng hash.
 * Dùng để compare vs stored hash trong DB.
 */
export function hashOtp(otp: string): string {
    return createHash('sha256').update(otp.trim()).digest('hex')
}

/**
 * Constant-time comparison giữa input OTP và stored hash.
 * Hash input → so với stored hash. KHÔNG dùng `===` direct vì vẫn timing-safe
 * trong hex compare nhưng dùng explicit constant-time để bullet-proof.
 */
export function verifyOtp(input: string, storedHash: string): boolean {
    if (!input || !storedHash) return false
    const inputHash = hashOtp(input)
    if (inputHash.length !== storedHash.length) return false
    let mismatch = 0
    for (let i = 0; i < inputHash.length; i++) {
        mismatch |= inputHash.charCodeAt(i) ^ storedHash.charCodeAt(i)
    }
    return mismatch === 0
}

/**
 * Generate token cho email verification / reset flow.
 * 32-byte random hex string = 64 chars. Chỉ xuất hiện trong email link.
 * DB lưu SHA-256 hash của token này.
 */
export function generateRandomToken(): string {
    return randomBytes(32).toString('hex')
}

/**
 * SHA-256 hash của token (cho EmailVerificationToken / reset token).
 */
export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
}

/**
 * Constant-time token verification.
 */
export function verifyToken(input: string, storedHash: string): boolean {
    if (!input || !storedHash) return false
    const inputHash = hashToken(input)
    if (inputHash.length !== storedHash.length) return false
    let mismatch = 0
    for (let i = 0; i < inputHash.length; i++) {
        mismatch |= inputHash.charCodeAt(i) ^ storedHash.charCodeAt(i)
    }
    return mismatch === 0
}
