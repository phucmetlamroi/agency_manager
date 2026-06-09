/**
 * [Velox v4 — Roles Loader]
 *
 * Loads `src/config/velox.roles.json` and optionally merges per-client
 * overrides on top. See spec §3.4 + Appendix A + §8 (P5 polish).
 *
 * Design:
 *   - The base config is statically imported (Turbopack-safe, no
 *     "Failed to load external" surprise on Vercel).
 *   - Per-client overrides go through a small lookup map registered at
 *     boot via `registerClientOverride()`. P5 will surface a UI for
 *     editors; for now overrides are opt-in via code.
 *   - Merge strategy: deep-merge with array UNION for aliases and
 *     status tokens. Per-client config can extend the dictionary but
 *     cannot REMOVE entries from the base — keeps the engine
 *     deterministic.
 */

import baseRoles from '@/config/velox.roles.json'

// ────────────────────────────────────────────────────────────────────────────
//  Shape — narrower than the raw JSON (the file has `_comment` decorations
//  for human readers that we strip in code).
// ────────────────────────────────────────────────────────────────────────────

export interface VeloxRolesConfig {
    schemaVersion: 'velox-4.0'
    separators: string[]
    roles: VeloxRoleEntry[]
    sourceBuckets: string[]
    status: VeloxStatusConfig
    rawDumpPatterns: string[]
    videoExt: string[]
    audioExt: string[]
    imageExt: string[]
}

export interface VeloxRoleEntry {
    role: 'HOOK' | 'BODY' | 'CTA' | 'CALLOUT' | 'SCRIPT' | 'CAPTION' | 'FINAL'
    priority: number
    isSource: boolean
    isFinal: boolean
    aliases: string[]
    /** Single-letter shortcut forms, e.g. ["h"] → matches "H1", "h03" */
    letterForms?: string[]
    /** Doc extensions that count as this role even without a name match
     *  (e.g. ".pdf" → SCRIPT). */
    docExt?: string[]
}

export interface VeloxStatusConfig {
    EXCLUDED: string[]
    REPLACEMENT: string[]
    PENDING: string[]
    FINAL: string[]
}

// ────────────────────────────────────────────────────────────────────────────
//  Per-client override registry — process-local cache. Server actions can
//  call registerClientOverride at boot; the loader merges automatically.
// ────────────────────────────────────────────────────────────────────────────

const clientOverrides = new Map<number, Partial<VeloxRolesConfig>>()

/**
 * Attach (or replace) a per-client roles override. Pass `null` to clear.
 * The override is merged with array-union on every `loadRolesConfig` call
 * — there's no caching at this layer because configs are tiny and editor
 * latency is dominated by the Cloud API.
 */
export function registerClientOverride(
    clientId: number,
    config: Partial<VeloxRolesConfig> | null,
): void {
    if (config === null) clientOverrides.delete(clientId)
    else clientOverrides.set(clientId, config)
}

/** Return the raw base config object — kept for tests + diagnostics. */
export function getBaseRolesConfig(): VeloxRolesConfig {
    return sanitize(baseRoles as unknown as VeloxRolesConfig)
}

/**
 * Return the effective Velox roles config for the given client. If `clientId`
 * is `undefined` or no override exists, the base config is returned as-is.
 */
export function loadRolesConfig(clientId?: number): VeloxRolesConfig {
    const base = sanitize(baseRoles as unknown as VeloxRolesConfig)
    if (clientId == null) return base
    const override = clientOverrides.get(clientId)
    if (!override) return base
    return mergeConfig(base, override)
}

// ────────────────────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Strip the `_comment` and `_*Note` decorations the JSON file uses for
 *  reader-facing prose, returning a clean typed object. */
function sanitize(raw: any): VeloxRolesConfig {
    const out: any = {}
    for (const k of Object.keys(raw)) {
        if (k.startsWith('_')) continue
        out[k] = raw[k]
    }
    return out as VeloxRolesConfig
}

/**
 * Deep-merge an override onto the base. Per-client overrides are ADDITIVE:
 * aliases / sourceBuckets / status tokens UNION the base. Role priority
 * and flags can be overridden per-role (matched by `role` string).
 */
function mergeConfig(base: VeloxRolesConfig, ov: Partial<VeloxRolesConfig>): VeloxRolesConfig {
    const merged: VeloxRolesConfig = {
        ...base,
        // Union string-array fields
        separators: union(base.separators, ov.separators),
        sourceBuckets: union(base.sourceBuckets, ov.sourceBuckets),
        rawDumpPatterns: union(base.rawDumpPatterns, ov.rawDumpPatterns),
        videoExt: union(base.videoExt, ov.videoExt),
        audioExt: union(base.audioExt, ov.audioExt),
        imageExt: union(base.imageExt, ov.imageExt),
        status: mergeStatus(base.status, ov.status),
        roles: mergeRoles(base.roles, ov.roles),
    }
    return merged
}

function union(a: string[], b?: string[]): string[] {
    if (!b) return a
    const set = new Set<string>()
    for (const v of a) set.add(v.toLowerCase())
    for (const v of b) set.add(v.toLowerCase())
    return [...set]
}

function mergeStatus(a: VeloxStatusConfig, b?: VeloxStatusConfig): VeloxStatusConfig {
    if (!b) return a
    return {
        EXCLUDED: union(a.EXCLUDED, b.EXCLUDED),
        REPLACEMENT: union(a.REPLACEMENT, b.REPLACEMENT),
        PENDING: union(a.PENDING, b.PENDING),
        FINAL: union(a.FINAL, b.FINAL),
    }
}

function mergeRoles(
    base: VeloxRoleEntry[],
    ov?: VeloxRoleEntry[],
): VeloxRoleEntry[] {
    if (!ov || ov.length === 0) return base
    const byRole = new Map<string, VeloxRoleEntry>()
    for (const r of base) byRole.set(r.role, structuredClone(r))
    for (const r of ov) {
        const existing = byRole.get(r.role)
        if (!existing) {
            byRole.set(r.role, structuredClone(r))
            continue
        }
        // Per-role merge: union aliases + letterForms + docExt; honour ov for
        // priority/flags if present.
        existing.aliases = union(existing.aliases, r.aliases)
        if (r.letterForms) existing.letterForms = union(existing.letterForms ?? [], r.letterForms)
        if (r.docExt) existing.docExt = union(existing.docExt ?? [], r.docExt)
        if (typeof r.priority === 'number') existing.priority = r.priority
        if (typeof r.isSource === 'boolean') existing.isSource = r.isSource
        if (typeof r.isFinal === 'boolean') existing.isFinal = r.isFinal
    }
    return [...byRole.values()]
}
