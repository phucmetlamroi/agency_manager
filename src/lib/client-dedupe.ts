/**
 * [Canonical Clients 2026-06] Client picker de-duplication.
 *
 * Until the merge migration (scripts/migrate-clients-to-profile-scope.ts) runs,
 * the SAME logical client ("Jacob") still exists as many per-workspace duplicate
 * rows with different ids — so a profile-wide picker shows "Jacob" three times.
 * This collapses those duplicates by their canonical NAME-PATH (the exact key the
 * migration groups on) and keeps the LOWEST id per group — the same survivor the
 * migration would pick — so a task created now attaches to the row the migration
 * will later consolidate everything into. Idempotent: once the migration has run,
 * only one ACTIVE row per path remains and this is a harmless no-op.
 */

// U+0000 — cannot occur inside a client name, so it's a collision-proof segment
// separator. A literal space would WRONGLY merge a name like "Think Fire" with a
// "Think" → "Fire" hierarchy.
export const SEP = String.fromCharCode(0)

export interface DedupeClient {
    id: number
    name: string
    parentId: number | null
}

/** Number of name segments in a canonical key ('' → 0). Use this instead of
 *  `key.split('/').length` so depth ordering agrees with clientPathKey. */
export function clientPathDepth(key: string): number {
    return key === '' ? 0 : key.split(SEP).length
}

/**
 * Canonical key for a client: the root→self chain of ancestor names, each
 * NFC-normalized + trimmed + lowercased, joined by SEP. Using a SEGMENT-joined
 * key — not a "/"-joined string — keeps a single client literally named
 * "Jacob/Unit" distinct from a real Jacob→Unit hierarchy (the same High-finding
 * fix the share-link scope uses). A visited-set guards a corrupt parent cycle
 * without truncating depth.
 */
export function clientPathKey(
    id: number,
    byId: Map<number, { name: string; parentId: number | null }>,
    maxDepth = 12,
): string {
    const names: string[] = []
    const seen = new Set<number>()
    let cur: number | null = id
    let depth = 0
    while (cur != null && !seen.has(cur) && depth < maxDepth) {
        seen.add(cur)
        const c = byId.get(cur)
        if (!c) break
        names.push((c.name ?? '').normalize('NFC').trim().toLowerCase())
        cur = c.parentId
        depth++
    }
    return names.reverse().join(SEP)
}

/**
 * Collapse same-name-path duplicate clients, keeping the lowest id per group.
 * A client with an empty/whitespace-only path keeps its own slot (never merged
 * blind into another nameless row). Result is sorted by name (then id) to match
 * the picker's existing `orderBy: { name: 'asc' }`.
 */
export function dedupeClientsByPath<T extends DedupeClient>(list: T[]): T[] {
    const byId = new Map(list.map((c) => [c.id, { name: c.name, parentId: c.parentId }]))
    const winner = new Map<string, T>()
    for (const c of list) {
        const key = clientPathKey(c.id, byId)
        const groupKey = key.split(SEP).join('').length === 0 ? `__empty__${c.id}` : key
        const cur = winner.get(groupKey)
        if (!cur || c.id < cur.id) winner.set(groupKey, c)
    }
    return Array.from(winner.values()).sort(
        (a, b) => a.name.localeCompare(b.name) || a.id - b.id,
    )
}
