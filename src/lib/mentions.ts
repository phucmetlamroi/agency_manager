// Mention parsing utilities — used both client and server side.
// Mentions are stored as @username inline text. Server resolves to userIds.

export interface MentionableUser {
    id: string
    username: string
    nickname: string | null
}

const MENTION_TOKEN_REGEX = /@([a-zA-Z0-9_.\-]{1,40})/g

// Extract @-handles from a string. Returns array of raw handles (without "@").
export function extractMentionHandles(content: string): string[] {
    const handles: string[] = []
    let m: RegExpExecArray | null
    MENTION_TOKEN_REGEX.lastIndex = 0
    while ((m = MENTION_TOKEN_REGEX.exec(content)) !== null) {
        handles.push(m[1])
    }
    return handles
}

// Resolve handles to userIds against a participant list.
// Matches both `username` and `nickname` (case-insensitive). Returns userIds present.
export function resolveMentions(content: string, participants: MentionableUser[]): string[] {
    const handles = extractMentionHandles(content)
    if (handles.length === 0) return []
    const ids = new Set<string>()
    for (const handle of handles) {
        const lh = handle.toLowerCase()
        for (const p of participants) {
            const u = (p.username || '').toLowerCase()
            const n = (p.nickname || '').toLowerCase()
            // Compare against handle and against handle without dots/underscores
            if (u === lh || n === lh) {
                ids.add(p.id)
                break
            }
        }
    }
    return Array.from(ids)
}

// Find the active mention prefix at the cursor position (e.g. user just typed "@joh").
// Returns { token: 'joh', start: index_of_at, end: cursor } or null.
export function findActiveMention(content: string, cursor: number): { token: string; start: number; end: number } | null {
    if (cursor <= 0) return null
    // Walk back from cursor until whitespace or '@'
    let i = cursor - 1
    while (i >= 0) {
        const c = content[i]
        if (c === '@') {
            // Must be at start or preceded by whitespace
            if (i === 0 || /\s/.test(content[i - 1])) {
                const token = content.slice(i + 1, cursor)
                if (/^[a-zA-Z0-9_.\-]*$/.test(token)) {
                    return { token, start: i, end: cursor }
                }
                return null
            }
            return null
        }
        if (/\s/.test(c)) return null
        i--
    }
    return null
}

// Render text with mention pills. Returns React-friendly array of strings + objects.
// Each segment is either { type: 'text', value } or { type: 'mention', handle, userId? }.
export type MentionSegment =
    | { type: 'text'; value: string }
    | { type: 'mention'; handle: string; userId: string | null }

export function splitMentions(content: string, mentionedUsers: MentionableUser[] = []): MentionSegment[] {
    const segments: MentionSegment[] = []
    let lastIndex = 0
    let m: RegExpExecArray | null
    MENTION_TOKEN_REGEX.lastIndex = 0
    while ((m = MENTION_TOKEN_REGEX.exec(content)) !== null) {
        if (m.index > lastIndex) {
            segments.push({ type: 'text', value: content.slice(lastIndex, m.index) })
        }
        const handle = m[1]
        const lh = handle.toLowerCase()
        const matched = mentionedUsers.find(p =>
            (p.username || '').toLowerCase() === lh || (p.nickname || '').toLowerCase() === lh
        )
        segments.push({ type: 'mention', handle, userId: matched?.id || null })
        lastIndex = m.index + m[0].length
    }
    if (lastIndex < content.length) {
        segments.push({ type: 'text', value: content.slice(lastIndex) })
    }
    return segments
}
