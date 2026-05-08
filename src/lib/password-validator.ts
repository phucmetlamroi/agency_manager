/**
 * Auth Phase 2 — Password validation: strength + HIBP k-anonymity check.
 *
 * Strength rules (§4.1 spec, NIST SP 800-63B-4 final 8/2025):
 *   - Tối thiểu 12 ký tự. (NIST khuyến nghị 15 cho single-factor; ta chọn 12 cho UX
 *     trong v1, có roadmap nâng lên 15 ở Phase 4+.)
 *   - Tối đa 128 ký tự. (bcryptjs cap 72 bytes, ép cap 128 ở UI.)
 *   - KHÔNG bắt buộc uppercase / số / ký tự đặc biệt. NIST 800-63B-4: composition
 *     rules đã chuyển từ "should not" → "shall not".
 *   - Check HIBP k-anonymity: nếu password trong public breach → reject.
 *
 * HIBP API: https://api.pwnedpasswords.com/range/{first5_sha1}
 *   - Public, free, no auth. K-anonymity → chỉ gửi 5 ký tự đầu của SHA-1 hash.
 *   - Fail-open: nếu HIBP down, log warning, KHÔNG block user (false positive
 *     blocking signup là worse than allowing 1 leaked password).
 */

import { createHash } from 'crypto'

const MIN_LENGTH = 12
const MAX_LENGTH = 128

export type PasswordValidationResult = {
    valid: boolean
    errors: string[]
}

/**
 * Validate password strength rules. Sync — không gọi external service.
 */
export function validatePasswordStrength(password: string): PasswordValidationResult {
    const errors: string[] = []

    if (!password || typeof password !== 'string') {
        errors.push('Vui lòng nhập mật khẩu.')
        return { valid: false, errors }
    }

    if (password.length < MIN_LENGTH) {
        errors.push(`Mật khẩu phải có ít nhất ${MIN_LENGTH} ký tự.`)
    }
    if (password.length > MAX_LENGTH) {
        errors.push(`Mật khẩu không được dài quá ${MAX_LENGTH} ký tự.`)
    }

    // Optional: warn about extremely common patterns (không reject, chỉ warn).
    // Để fully block, dùng HIBP check.

    return {
        valid: errors.length === 0,
        errors,
    }
}

/**
 * SHA-1 hash của password (dùng cho HIBP k-anonymity).
 */
function sha1Hex(input: string): string {
    return createHash('sha1').update(input).digest('hex').toUpperCase()
}

/**
 * Check password against HIBP Pwned Passwords API.
 * @returns true nếu password ĐÃ xuất hiện trong public breach (REJECT user).
 *          false nếu password chưa thấy hoặc HIBP API fail (fail-open).
 */
export async function checkHibpPwned(password: string): Promise<boolean> {
    if (!password) return false

    try {
        const sha1 = sha1Hex(password)
        const prefix = sha1.slice(0, 5)
        const suffix = sha1.slice(5)

        const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
            // Add-Padding theo HIBP best-practice: chống side-channel
            headers: { 'Add-Padding': 'true' },
            // Timeout 3s để tránh hang
            signal: AbortSignal.timeout(3000),
        })

        if (!res.ok) {
            console.warn(`[hibp] API returned ${res.status}; failing open.`)
            return false
        }

        const text = await res.text()
        // Response format: each line "{HASH_SUFFIX}:{COUNT}"
        const lines = text.split('\n')
        for (const line of lines) {
            const [hashSuffix, countStr] = line.trim().split(':')
            if (hashSuffix === suffix) {
                const count = parseInt(countStr, 10)
                if (count > 0) return true
            }
        }
        return false
    } catch (err) {
        console.warn('[hibp] check failed; failing open:', err)
        return false
    }
}

/**
 * Combined validation: strength + HIBP. Use for signup, password reset, change.
 * @returns errors array; empty = valid.
 */
export async function validatePasswordFull(password: string): Promise<PasswordValidationResult> {
    const strength = validatePasswordStrength(password)
    if (!strength.valid) return strength

    const isPwned = await checkHibpPwned(password)
    if (isPwned) {
        return {
            valid: false,
            errors: ['Mật khẩu này đã xuất hiện trong các vụ rò rỉ dữ liệu công khai. Vui lòng chọn mật khẩu khác.']
        }
    }

    return { valid: true, errors: [] }
}
