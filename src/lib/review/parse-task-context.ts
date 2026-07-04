// [Review module P1.5] Parse a task title into the auto-folder tree context.
// Convention (API-SPEC §6.1): "Khách / Brand · Video N – Tên video".
// The client/brand/video separators are '/' and '·' (or '-'); the video name may
// itself contain an en-dash '–'. On no match we fall back to the task's client
// name + the whole title as the video name.

export interface ParsedTaskVideo {
    client: string
    brand: string | null
    video: string
    /** true = the "Khách / Brand · Video" convention matched; false = fell back to the
     *  task's client name + whole title. Drives the confirm-strip "unrecognized" warning. */
    matched: boolean
}

// client = up to the first '/' or '·'; brand = optional, between '/' and '·'/'-';
// video = everything after the '·'/'-' separator. (Numbered groups: ES2017 target
// forbids named groups — [1]=client, [2]=brand, [3]=video.)
const TITLE_RE = /^([^/·]+?)\s*(?:\/\s*([^·]+?))?\s*[·\-]\s*(.+)$/

export function parseVideoTitle(title: string, fallbackClient: string): ParsedTaskVideo {
    const t = (title || '').trim()
    const fb = (fallbackClient || '').trim() || 'Khách'
    const m = t.match(TITLE_RE)
    if (m) {
        return {
            client: m[1]?.trim() || fb,
            brand: m[2]?.trim() || null,
            video: m[3]?.trim() || t || 'Video',
            matched: true,
        }
    }
    return { client: fb, brand: null, video: t || 'Video', matched: false }
}
