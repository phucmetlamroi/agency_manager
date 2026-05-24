/**
 * [Username Handle] Centralized user display name formatting.
 *
 * Single source of truth for "how to display a user's name" across the app.
 * Replaces ad-hoc patterns like:
 *   - `user.displayName ?? user.nickname ?? user.username`
 *   - `user.email?.split('@')[0]`
 *   - `user.username || 'User'`
 *
 * Display priority (after Username Handle migration):
 *   1. displayName (clean Vietnamese name like "Bảo Phúc")
 *   2. username (clean ASCII handle like "bao_phuc.7")
 *   3. "User" fallback (should never happen since username is required)
 *
 * NEVER shows email prefix — that's the old buggy pattern this replaces.
 */

interface UserLike {
    displayName?: string | null
    username?: string | null
    nickname?: string | null
    email?: string | null
}

/**
 * Returns the best human-readable display name for a user. Use this everywhere
 * in the UI where you'd normally show "user.displayName" or fall back to
 * email/username.
 *
 * @example
 *   formatUserDisplay(user)              // "Bảo Phúc" or "@bao_phuc.7"
 *   formatUserDisplay({ username: 'foo_1' })  // "foo_1"
 *   formatUserDisplay(null)              // "User"
 */
export function formatUserDisplay(user: UserLike | null | undefined): string {
    if (!user) return 'User'
    const display = user.displayName?.trim()
    if (display) return display
    const username = user.username?.trim()
    if (username) return username
    // Defensive: should never reach here since username is required, but
    // guards against malformed data + makes TS happy.
    const nickname = user.nickname?.trim()
    if (nickname) return nickname
    return 'User'
}

/**
 * Format username as a handle string with @ prefix (Twitter style).
 * Use in invite dropdowns, profile cards, etc. where you want to clearly
 * distinguish "the unique handle" from "the display name".
 *
 * @example
 *   formatUserHandle({ username: 'bao_phuc.7' })  // "@bao_phuc.7"
 *   formatUserHandle({ username: null })          // ""  (empty, no @ prefix alone)
 */
export function formatUserHandle(user: UserLike | null | undefined): string {
    if (!user?.username?.trim()) return ''
    return `@${user.username.trim()}`
}

/**
 * Returns initials for avatar fallback. Uses display name if available,
 * else first 2 chars of username.
 *
 * @example
 *   formatUserInitials({ displayName: 'Bảo Phúc' })       // "BP"
 *   formatUserInitials({ username: 'bao_phuc.7' })         // "BA"
 */
export function formatUserInitials(user: UserLike | null | undefined): string {
    if (!user) return '?'
    const display = user.displayName?.trim()
    if (display) {
        const parts = display.split(/\s+/).filter(Boolean)
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        }
        if (parts.length === 1 && parts[0].length >= 2) {
            return parts[0].slice(0, 2).toUpperCase()
        }
        if (parts.length === 1) return parts[0][0].toUpperCase()
    }
    const username = user.username?.trim()
    if (username) {
        // Skip leading special chars when computing initials
        const cleaned = username.replace(/[^a-zA-Z0-9]/g, '')
        if (cleaned.length >= 2) return cleaned.slice(0, 2).toUpperCase()
        if (cleaned.length === 1) return cleaned.toUpperCase()
    }
    return '?'
}
