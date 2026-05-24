/**
 * [Bulk fix] Parse + repack helpers for legacy packed Task fields.
 *
 * Background: `Task.resources` is a single string column that legacy code
 * packs as "RAW: <url> | BROLL: <url> | SUBMISSION: <url>". Similarly
 * `Task.references` is packed as "REF: <url> | SCRIPT: <url>".
 *
 * Direct overwrite from a single task's state corrupts bulk-selected tasks
 * (all subfields get replaced with current task's values). These helpers
 * support surgical per-task subfield merge:
 *
 *   1. Server fetches each task's current packed string
 *   2. parseResources(s) → { linkRaw, linkBroll, submissionFolder }
 *   3. Merge only the subfield the user actually changed
 *   4. packResources(merged) → save back
 *
 * That way each task keeps its OWN RAW/BROLL/SCRIPT/etc. for fields the
 * user didn't touch.
 */

export interface ResourceSubfields {
    linkRaw: string
    linkBroll: string
    submissionFolder: string
}

export interface ReferenceSubfields {
    /** Reference link (the URL after "REF:") */
    referenceLink: string
    /** Script link (the URL after "SCRIPT:") */
    scriptLink: string
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Resources field — "RAW: ... | BROLL: ... | SUBMISSION: ..."        */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Parse a packed `resources` string into its subfields. Tolerant of legacy
 * format where the string was just a single raw URL (no prefix).
 */
export function parseResources(s: string | null | undefined): ResourceSubfields {
    const out: ResourceSubfields = { linkRaw: '', linkBroll: '', submissionFolder: '' }
    if (!s) return out
    if (s.startsWith('RAW:')) {
        const parts = s.split('|')
        parts.forEach((p) => {
            const t = p.trim()
            if (t.startsWith('RAW:')) out.linkRaw = t.replace('RAW:', '').trim()
            else if (t.startsWith('BROLL:')) out.linkBroll = t.replace('BROLL:', '').trim()
            else if (t.startsWith('SUBMISSION:')) out.submissionFolder = t.replace('SUBMISSION:', '').trim()
        })
    } else {
        // Legacy: pre-packed format — treat the whole string as linkRaw
        out.linkRaw = s
    }
    return out
}

/**
 * Pack ResourceSubfields back into the legacy packed string.
 * Returns empty string if ALL subfields are empty (so DB stays clean).
 */
export function packResources(fields: ResourceSubfields): string {
    const raw = (fields.linkRaw ?? '').trim()
    const broll = (fields.linkBroll ?? '').trim()
    const sub = (fields.submissionFolder ?? '').trim()
    if (!raw && !broll && !sub) return ''
    return `RAW: ${raw} | BROLL: ${broll} | SUBMISSION: ${sub}`
}

/* ──────────────────────────────────────────────────────────────────── */
/*  References field — "REF: ... | SCRIPT: ..."                        */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Parse packed `references` string. Tolerant of legacy plain URL format.
 */
export function parseReferences(s: string | null | undefined): ReferenceSubfields {
    const out: ReferenceSubfields = { referenceLink: '', scriptLink: '' }
    if (!s) return out
    if (s.startsWith('REF:')) {
        const parts = s.split('|')
        parts.forEach((p) => {
            const t = p.trim()
            if (t.startsWith('REF:')) out.referenceLink = t.replace('REF:', '').trim()
            else if (t.startsWith('SCRIPT:')) out.scriptLink = t.replace('SCRIPT:', '').trim()
        })
    } else {
        // Legacy: pre-packed format — treat the whole string as referenceLink
        out.referenceLink = s
    }
    return out
}

/**
 * Pack ReferenceSubfields back into the legacy packed string.
 * If only referenceLink is set (no scriptLink), returns just the plain ref URL
 * to match how the modal originally writes single-field references.
 */
export function packReferences(fields: ReferenceSubfields): string {
    const ref = (fields.referenceLink ?? '').trim()
    const script = (fields.scriptLink ?? '').trim()
    if (!ref && !script) return ''
    if (script) {
        return `REF:${ref} | SCRIPT:${script}`
    }
    return ref
}
