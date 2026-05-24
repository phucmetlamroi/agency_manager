/**
 * [Username Handle] Centralized username validation.
 *
 * Username = clean ASCII handle (Twitter/GitHub style). Required at signup,
 * unique system-wide, shown in invite + display fallback (when displayName
 * not set). Existing users with legacy username (email-derived or with
 * Vietnamese diacritics) must migrate via UsernameMigrationModal before
 * accessing the app.
 *
 * Pattern requirements:
 *   - 3-30 characters
 *   - At least 1 ASCII letter (a-z or A-Z)
 *   - At least 1 digit (0-9)
 *   - At least 1 of [_.-]
 *   - Only [a-zA-Z0-9_.-] allowed (no space, no diacritic, no @, etc.)
 */

export const USERNAME_REGEX =
    /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[_.\-])[a-zA-Z0-9_.\-]{3,30}$/

/* ──────────────────────────────────────────────────────────────────── */
/*  Per-rule check helpers (for client-side inline ✓/✗ feedback)       */
/* ──────────────────────────────────────────────────────────────────── */

/** True if length is 3-30 */
export function hasValidLength(s: string): boolean {
    return s.length >= 3 && s.length <= 30
}

/** True if string contains at least one ASCII letter */
export function hasAsciiLetter(s: string): boolean {
    return /[a-zA-Z]/.test(s)
}

/** True if string contains at least one digit */
export function hasDigit(s: string): boolean {
    return /\d/.test(s)
}

/** True if string contains at least one of `_`, `.`, `-` */
export function hasAllowedSpecial(s: string): boolean {
    return /[_.\-]/.test(s)
}

/** True if string contains only [a-zA-Z0-9_.-] (no diacritic / space / @ / etc) */
export function hasOnlyAllowedChars(s: string): boolean {
    return /^[a-zA-Z0-9_.\-]*$/.test(s)
}

/**
 * Detect Vietnamese diacritics (and other Latin diacritics).
 * Covers: à á ả ã ạ ă ắ ằ ẳ ẵ ặ â ấ ầ ẩ ẫ ậ è é ẻ ẽ ẹ ê ế ề ể ễ ệ
 *         ì í ỉ ĩ ị ò ó ỏ õ ọ ô ố ồ ổ ỗ ộ ơ ớ ờ ở ỡ ợ
 *         ù ú ủ ũ ụ ư ứ ừ ử ữ ự ỳ ý ỷ ỹ ỵ đ + uppercase variants.
 */
export function hasVietnameseDiacritics(s: string): boolean {
    // Vietnamese-specific extended ranges + general Latin diacritic block
    if (/[À-ÿĀ-ɏḀ-ỿ]/.test(s)) return true
    // đ / Đ specifically (in case the above misses)
    if (/[đĐ]/.test(s)) return true
    return false
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Aggregate validation                                               */
/* ──────────────────────────────────────────────────────────────────── */

export interface UsernameValidationResult {
    valid: boolean
    /** Human-readable error message (Vietnamese) when invalid */
    error?: string
    /** Per-rule pass/fail breakdown for inline UI feedback */
    checks: {
        length: boolean
        letter: boolean
        digit: boolean
        special: boolean
        onlyAllowed: boolean
    }
}

/**
 * Validate username against all rules. Returns per-rule breakdown so UI can
 * show inline ✓/✗ feedback for each rule.
 */
export function validateUsername(raw: string): UsernameValidationResult {
    const s = (raw ?? '').trim()
    const checks = {
        length: hasValidLength(s),
        letter: hasAsciiLetter(s),
        digit: hasDigit(s),
        special: hasAllowedSpecial(s),
        onlyAllowed: hasOnlyAllowedChars(s),
    }
    const allPass = checks.length && checks.letter && checks.digit && checks.special && checks.onlyAllowed
    if (allPass && USERNAME_REGEX.test(s)) {
        return { valid: true, checks }
    }

    // Build error message — prioritize the most actionable one
    let error: string
    if (!checks.length) {
        error = 'Username phải có 3-30 ký tự.'
    } else if (!checks.onlyAllowed) {
        // Most likely cause: diacritic, space, or non-ASCII char
        if (hasVietnameseDiacritics(s)) {
            error = 'Username không được chứa dấu tiếng Việt. Vd: "bao_phuc.7" thay vì "bảo_phúc.7".'
        } else if (/\s/.test(s)) {
            error = 'Username không được chứa khoảng trắng.'
        } else {
            error = 'Username chỉ được dùng chữ cái (a-z, A-Z), số, và các ký tự _ . -'
        }
    } else if (!checks.letter) {
        error = 'Username phải có ít nhất 1 chữ cái (a-z hoặc A-Z).'
    } else if (!checks.digit) {
        error = 'Username phải có ít nhất 1 số (0-9).'
    } else if (!checks.special) {
        error = 'Username phải có ít nhất 1 ký tự đặc biệt: _ . hoặc -'
    } else {
        error = 'Username không hợp lệ.'
    }

    return { valid: false, error, checks }
}

/**
 * Check if a legacy username needs to be migrated. Returns true if:
 *   - Username contains Vietnamese diacritics
 *   - Username is the user's email (auto-derived at old signup flow)
 *   - Username does NOT match the new strict pattern
 *
 * Caller (layout.tsx) uses this together with `user.usernameSetByUser`
 * to decide whether to show UsernameMigrationModal.
 */
export function needsUsernameMigration(
    username: string | null | undefined,
    usernameSetByUser: boolean,
): boolean {
    if (usernameSetByUser) return false
    if (!username) return true
    if (hasVietnameseDiacritics(username)) return true
    if (username.includes('@')) return true
    if (!USERNAME_REGEX.test(username)) return true
    return false
}
