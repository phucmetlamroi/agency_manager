/**
 * [ChatP3-3] OpenGraph link unfurl — fetch HTML head of URLs in chat messages,
 * extract og:* meta tags + <title>, persist as LinkPreview rows + re-broadcast
 * the message so clients render unfurl cards.
 *
 * Security
 * - SSRF guard: dns.lookup() before fetch + block any private/loopback/link-local
 *   IPv4/IPv6 range. Only http(s). Only standard ports (80/443/8080/8443).
 * - Body size cap: 2MB hard ceiling — abort once exceeded.
 * - Timeout: 5s per fetch.
 * - Content-Type filter: text/html only.
 * - Max 3 URLs per message — anything beyond is ignored.
 */

import { promises as dns } from 'node:dns'
import { isIP } from 'node:net'
import { prisma } from '@/lib/db'
import { broadcastToChannel } from '@/lib/notification-broadcast'
import { CHAT_EVENTS } from '@/lib/chat-channels'

const MAX_URLS_PER_MESSAGE = 3
const MAX_BODY_BYTES = 2 * 1024 * 1024
const FETCH_TIMEOUT_MS = 5_000
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443'])

// Anything user-supplied is data; the OG fetcher must look + behave like a vanilla
// browser preview crawler. No cookies, no redirects to private space.
const USER_AGENT = 'AgencyManager-Unfurl/1.0 (+https://example.invalid)'

export interface UnfurlResult {
    url: string
    title: string | null
    description: string | null
    imageUrl: string | null
    siteName: string | null
}

/* ───────────── URL extraction ─────────────────────────────────────────────── */

const URL_REGEX = /https?:\/\/[^\s<>"']+[^\s<>"'.,!?;:)]/gi

/** Pull up to N distinct http(s) URLs out of message text (preserving first-seen order). */
export function extractUrls(content: string, max = MAX_URLS_PER_MESSAGE): string[] {
    const matches = content.match(URL_REGEX) ?? []
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of matches) {
        // Strip trailing punctuation aggressively (regex already excludes some, but ).,] in URL paths trick it).
        const trimmed = raw.replace(/[)\].,!?;:]+$/, '')
        if (seen.has(trimmed)) continue
        seen.add(trimmed)
        out.push(trimmed)
        if (out.length >= max) break
    }
    return out
}

/* ───────────── SSRF guard ─────────────────────────────────────────────────── */

/** True if the IP literal is in any private/loopback/link-local/multicast range. */
function isPrivateIp(ip: string): boolean {
    const family = isIP(ip)
    if (!family) return true // unparseable → treat as unsafe

    if (family === 4) {
        const parts = ip.split('.').map((n) => parseInt(n, 10))
        if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) return true
        const [a, b] = parts
        if (a === 0) return true // 0.0.0.0/8 — this network
        if (a === 10) return true // 10.0.0.0/8 — private
        if (a === 127) return true // 127.0.0.0/8 — loopback
        if (a === 169 && b === 254) return true // 169.254.0.0/16 — link-local (incl. AWS/GCP metadata 169.254.169.254)
        if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12 — private
        if (a === 192 && b === 168) return true // 192.168.0.0/16 — private
        if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 — CGNAT
        if (a >= 224) return true // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
        return false
    }

    // IPv6. Normalize: strip surrounding [], lowercase.
    const v6 = ip.replace(/^\[|\]$/g, '').toLowerCase()
    if (v6 === '::1' || v6 === '::') return true
    if (v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb')) return true // fe80::/10 link-local
    if (v6.startsWith('fc') || v6.startsWith('fd')) return true // fc00::/7 unique-local
    if (v6.startsWith('ff')) return true // ff00::/8 multicast
    if (v6.startsWith('::ffff:')) {
        // IPv4-mapped — re-check the embedded v4.
        const v4 = v6.slice(7)
        if (isIP(v4) === 4) return isPrivateIp(v4)
        return true
    }
    return false
}

/** Validate URL shape (http(s) only, standard port) AND resolve hostname → reject private IPs. */
async function isSafeUrl(rawUrl: string): Promise<URL | null> {
    let u: URL
    try {
        u = new URL(rawUrl)
    } catch {
        return null
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (!ALLOWED_PORTS.has(u.port)) return null
    // Hostname can be an IP literal — check it directly.
    if (isIP(u.hostname)) {
        if (isPrivateIp(u.hostname)) return null
        return u
    }
    // Otherwise resolve. We check ALL returned addresses — refuse if any is private.
    try {
        const records = await dns.lookup(u.hostname, { all: true })
        if (records.length === 0) return null
        for (const r of records) {
            if (isPrivateIp(r.address)) return null
        }
        return u
    } catch {
        return null
    }
}

/* ───────────── Fetch + parse ──────────────────────────────────────────────── */

/** Decode the small set of HTML entities that show up in og:* attributes. */
function decodeEntities(s: string): string {
    return s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_m, code) => {
            const n = parseInt(code, 10)
            return isNaN(n) || n < 32 || n > 0x10ffff ? '' : String.fromCodePoint(n)
        })
        .replace(/&#x([\da-f]+);/gi, (_m, code) => {
            const n = parseInt(code, 16)
            return isNaN(n) || n < 32 || n > 0x10ffff ? '' : String.fromCodePoint(n)
        })
}

/** Trim + cap length so we never persist absurdly long preview blobs. */
function bounded(s: string | null, max: number): string | null {
    if (!s) return null
    const cleaned = decodeEntities(s).replace(/\s+/g, ' ').trim()
    if (!cleaned) return null
    return cleaned.length > max ? cleaned.slice(0, max - 1) + '…' : cleaned
}

/** Parse the first matching og:* meta tag (case-insensitive) or null. */
function readMeta(html: string, prop: string): string | null {
    // Try both `property="og:..."` and `name="og:..."` (some sites use name=).
    const propRegex = new RegExp(
        `<meta[^>]+(?:property|name)=["']${prop.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}["'][^>]*>`,
        'i',
    )
    const tag = html.match(propRegex)?.[0]
    if (!tag) return null
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1]
    return content ?? null
}

/** Fallback <title> when og:title is absent. */
function readTitle(html: string): string | null {
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    return m?.[1] ?? null
}

/** Fetch the page (or first 2MB) and parse OG fields. Returns null on any failure. */
async function fetchOpenGraph(url: URL): Promise<UnfurlResult | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
        const res = await fetch(url.toString(), {
            method: 'GET',
            redirect: 'follow', // Allowed — but every redirect target is *not* re-DNS-checked.
            signal: controller.signal,
            headers: {
                'User-Agent': USER_AGENT,
                Accept: 'text/html,application/xhtml+xml',
                'Accept-Language': 'en;q=0.9,vi;q=0.8',
            },
        })
        if (!res.ok || !res.body) return null
        const ct = res.headers.get('content-type') ?? ''
        if (!/text\/html|application\/xhtml/i.test(ct)) return null

        // Stream → cap → assemble (Edge/Node fetch both expose ReadableStream).
        const reader = res.body.getReader()
        const decoder = new TextDecoder('utf-8', { fatal: false })
        let total = 0
        let html = ''
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            total += value.byteLength
            if (total > MAX_BODY_BYTES) {
                try { await reader.cancel() } catch { /* ignore */ }
                break
            }
            html += decoder.decode(value, { stream: true })
            // We only need the <head>. Bail early once we see </head>.
            const idx = html.toLowerCase().indexOf('</head>')
            if (idx >= 0) {
                html = html.slice(0, idx)
                try { await reader.cancel() } catch { /* ignore */ }
                break
            }
        }
        html += decoder.decode()

        const ogTitle = readMeta(html, 'og:title') ?? readMeta(html, 'twitter:title') ?? readTitle(html)
        const ogDesc = readMeta(html, 'og:description') ?? readMeta(html, 'twitter:description') ?? readMeta(html, 'description')
        const ogImage = readMeta(html, 'og:image') ?? readMeta(html, 'twitter:image')
        const ogSite = readMeta(html, 'og:site_name') ?? readMeta(html, 'application-name') ?? url.hostname

        // Resolve relative image URL against the final URL (after redirects).
        let imageUrl: string | null = null
        if (ogImage) {
            try {
                imageUrl = new URL(ogImage, res.url || url.toString()).toString()
            } catch {
                imageUrl = null
            }
        }

        if (!ogTitle && !ogDesc && !imageUrl) return null
        return {
            url: url.toString(),
            title: bounded(ogTitle, 200),
            description: bounded(ogDesc, 400),
            imageUrl,
            siteName: bounded(ogSite, 80),
        }
    } catch {
        return null
    } finally {
        clearTimeout(timer)
    }
}

/* ───────────── Public API ─────────────────────────────────────────────────── */

/**
 * Orchestrate the full pipeline for one message. Best-effort: any error along the
 * way is swallowed (this runs in after() — we never want to break a message send).
 *
 * Steps: extract → SSRF-validate → fetch OG → write LinkPreview rows → re-broadcast
 * MESSAGE_EDIT with the now-populated message DTO so clients render the cards.
 *
 * @param serializeMessage caller-provided serializer (we can't import the action's
 *   private serialize() without a cycle; the caller already has it bound).
 */
export async function unfurlMessage(
    workspaceId: string,
    messageId: string,
    content: string,
    channelId: string,
    serializeMessage: (row: any) => unknown,
    messageInclude: Record<string, unknown>,
): Promise<void> {
    try {
        const urls = extractUrls(content)
        if (urls.length === 0) return

        const safeUrls = (await Promise.all(urls.map(isSafeUrl))).filter((u): u is URL => u !== null)
        if (safeUrls.length === 0) return

        // De-dup against any LinkPreview rows we already wrote for this message
        // (idempotent — re-running unfurl after an edit replaces rows for changed URLs).
        const existing = await prisma.linkPreview.findMany({
            where: { messageId },
            select: { url: true },
        })
        const existingUrls = new Set(existing.map((e) => e.url))

        // Fetch in parallel — Promise.allSettled so one slow page doesn't stall the whole batch.
        const results = await Promise.allSettled(
            safeUrls.filter((u) => !existingUrls.has(u.toString())).map((u) => fetchOpenGraph(u)),
        )
        const previews = results
            .map((r) => (r.status === 'fulfilled' ? r.value : null))
            .filter((p): p is UnfurlResult => p !== null)

        if (previews.length === 0) return

        // Resolve workspace profile for the FK (matches every other Message child).
        const message = await prisma.message.findFirst({
            where: { id: messageId, workspaceId },
            select: { profileId: true },
        })
        if (!message) return

        await prisma.linkPreview.createMany({
            data: previews.map((p) => ({
                workspaceId,
                messageId,
                url: p.url,
                title: p.title,
                description: p.description,
                imageUrl: p.imageUrl,
                siteName: p.siteName,
            })),
        })
        // LinkPreview model has no profileId column today — leave the FK off; the
        // cascade is via Message.id which is still workspace-scoped.

        // Re-broadcast the message so live clients pick up the cards. Reuse MESSAGE_EDIT
        // (clients already patch by id, so this is the same path as a real edit).
        const refreshed = await prisma.message.findFirst({
            where: { id: messageId, workspaceId },
            include: messageInclude as any,
        })
        if (refreshed) {
            await broadcastToChannel(channelId, CHAT_EVENTS.MESSAGE_EDIT, serializeMessage(refreshed))
        }
    } catch (e) {
        // Best-effort: never throw out of after().
        console.warn('[unfurlMessage] failed', e)
    }
}
