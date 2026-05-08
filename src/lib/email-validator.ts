/**
 * Auth Phase 3 — Email validation: format + disposable blocklist.
 *
 * Disposable email check chống abuse free trial (sign up nhiều lần với mailinator/10minutemail).
 * Library: `disposable-email-domains` (MIT, ~5,196 domains theo bộ generator companion).
 */

import disposableDomains from 'disposable-email-domains'

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

// Convert array → Set 1 lần ở module-load time để O(1) lookup
const DISPOSABLE_SET = new Set<string>((disposableDomains as string[]).map(d => d.toLowerCase()))

/**
 * Strict email format check.
 */
export function isEmailValid(email: string): boolean {
    if (!email || typeof email !== 'string') return false
    const trimmed = email.trim()
    if (trimmed.length > 254) return false  // RFC 5321 max
    return EMAIL_REGEX.test(trimmed)
}

/**
 * Check if email domain is in known disposable list.
 * @returns true nếu domain disposable (REJECT signup); false otherwise.
 */
export function isDisposableEmail(email: string): boolean {
    if (!email) return false
    const at = email.lastIndexOf('@')
    if (at === -1) return false
    const domain = email.slice(at + 1).trim().toLowerCase()
    if (!domain) return false
    return DISPOSABLE_SET.has(domain)
}

export type EmailValidationResult = {
    valid: boolean
    reason?: 'format' | 'disposable' | 'too_long'
    message?: string
}

/**
 * Combined validation for signup. Returns user-friendly Vietnamese message on fail.
 */
export function validateEmailForSignup(email: string): EmailValidationResult {
    if (!email || typeof email !== 'string') {
        return { valid: false, reason: 'format', message: 'Vui lòng nhập email.' }
    }
    const trimmed = email.trim().toLowerCase()
    if (trimmed.length > 254) {
        return { valid: false, reason: 'too_long', message: 'Email quá dài.' }
    }
    if (!EMAIL_REGEX.test(trimmed)) {
        return { valid: false, reason: 'format', message: 'Định dạng email không hợp lệ.' }
    }
    if (isDisposableEmail(trimmed)) {
        return {
            valid: false,
            reason: 'disposable',
            message: 'Vui lòng dùng email cá nhân thật. Không hỗ trợ email tạm/disposable.'
        }
    }
    return { valid: true }
}
