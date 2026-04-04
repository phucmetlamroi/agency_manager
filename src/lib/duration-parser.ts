/**
 * Smart Duration Parser
 * Supports formats: 1p30s, 1P30S, 45s, 45S, 2p, 2P
 * "p" = phút (minutes), "s" = seconds
 */

export type ParsedDuration = {
    valid: boolean
    totalSeconds: number
    display: string
    raw: string
}

const DURATION_REGEX = /^(\d+)\s*[pP]\s*(\d+)\s*[sS]$|^(\d+)\s*[sS]$|^(\d+)\s*[pP]$|^(\d+)\s*[pP]\s*(\d+)$/

export function parseDuration(input: string): ParsedDuration {
    const trimmed = input.trim()
    if (!trimmed) return { valid: false, totalSeconds: 0, display: '', raw: input }

    // Try pattern: XpYs (e.g., 1p30s, 1P30S)
    let match = trimmed.match(/^(\d+)\s*[pP]\s*(\d+)\s*[sS]?$/)
    if (match) {
        const mins = parseInt(match[1], 10)
        const secs = parseInt(match[2], 10)
        const total = mins * 60 + secs
        return {
            valid: true,
            totalSeconds: total,
            display: formatDuration(total),
            raw: input
        }
    }

    // Try pattern: Xs (e.g., 45s, 45S)
    match = trimmed.match(/^(\d+)\s*[sS]$/)
    if (match) {
        const secs = parseInt(match[1], 10)
        return {
            valid: true,
            totalSeconds: secs,
            display: formatDuration(secs),
            raw: input
        }
    }

    // Try pattern: Xp (e.g., 2p, 2P)
    match = trimmed.match(/^(\d+)\s*[pP]$/)
    if (match) {
        const mins = parseInt(match[1], 10)
        const total = mins * 60
        return {
            valid: true,
            totalSeconds: total,
            display: formatDuration(total),
            raw: input
        }
    }

    return { valid: false, totalSeconds: 0, display: '', raw: input }
}

export function formatDuration(totalSeconds: number): string {
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60

    if (mins > 0 && secs > 0) return `${mins} phút ${secs} giây`
    if (mins > 0) return `${mins} phút`
    return `${secs} giây`
}

export function formatDurationShort(totalSeconds: number): string {
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60

    if (mins > 0 && secs > 0) return `${mins}p${secs}s`
    if (mins > 0) return `${mins}p`
    return `${secs}s`
}

/**
 * Parse a stored duration string back to seconds.
 * Stored format can be raw user input (1p30s) or totalSeconds as string.
 */
export function durationToSeconds(stored: string | null | undefined): number {
    if (!stored) return 0
    // If it's a plain number, treat as seconds
    if (/^\d+$/.test(stored.trim())) return parseInt(stored.trim(), 10)
    const parsed = parseDuration(stored)
    return parsed.valid ? parsed.totalSeconds : 0
}
