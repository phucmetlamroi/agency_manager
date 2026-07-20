// [Client bulk download 2026-07] GET /api/share/{token}/download-zip?folderId=<id>
//
// WHY THIS EXISTS — verbatim from a paying client who asked to go back to Frame.io:
//   "we're also not able to download like every project as one … you have to click on
//    the individual reel and download everything in there. So it's a little bit tricky."
// They were right. The portal Library only ever offered per-asset checkboxes, and even
// then it fired ONE presigned <a download> per file (Library.tsx) — which browsers
// throttle or block outright past a handful. Staff have had a real streaming zip since
// the review module shipped (/api/review/download-zip); the client simply had no door
// to it, because collectZipFiles() gates on requireReviewAccess(), which rejects
// role CLIENT outright. This route is that door.
//
// AUTHORIZATION — no session; the token IS the credential, same as every other
// /api/share/[token]/* route:
//   1. resolveShareToken() is the chokepoint (hash-at-rest, revocation, expiry, per-IP
//      limit, uniform null on failure).
//   2. The file set is NOT re-derived here. It is taken from getDocumentsViaToken(),
//      the exact snapshot the client is already looking at in Files & masters — which
//      has already applied isClientDeliveredPhase, client scoping, workspace scoping,
//      READY-only and r2Key-present. So this route can only ever emit bytes the client
//      could already have fetched one click at a time; it widens no data boundary.
//   3. r2Keys are resolved by id from THAT authorized set, never from user input.
//
// LOSSLESS: archiver runs in STORE mode — nothing is re-encoded. A 4K master comes out
// of the zip byte-identical to the one staff uploaded.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Long enough to stream a whole production; Vercel clamps to the plan's ceiling.
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'node:stream'
import archiver from 'archiver'
import { prisma } from '@/lib/db'
import { resolveShareToken } from '@/lib/share-link-auth'
import { limitDb } from '@/lib/review/rate-limit-db'
import { getDocumentsViaToken } from '@/actions/share-document-actions'
import { getObjectStream } from '@/lib/review/r2'
import { reviewLog } from '@/lib/review/logger'
import { audit } from '@/lib/audit-log'

/** Mirrors MAX_ZIP_FILES on the staff route — a bulk download of thousands is a mistake. */
const MAX_ZIP_FILES = 1000

const NOT_FOUND = () => new NextResponse('Not found', { status: 404 })

/** Strip characters unsafe for a zip entry path segment, and neutralise `.`/`..` (zip-slip). */
function sanitizeSegment(name: string): string {
    const s = (name || '').replace(/[/\\:*?"<>|\x00-\x1f]+/g, '_').trim()
    if (!s || s === '.' || s === '..') return '_'
    return s
}

/** A duplicate zip path gets " (2)" etc. before its extension. */
function dedupe(entries: { r2Key: string; zipPath: string }[]): void {
    const seen = new Map<string, number>()
    for (const e of entries) {
        const lower = e.zipPath.toLowerCase()
        const n = seen.get(lower) ?? 0
        seen.set(lower, n + 1)
        if (n > 0) {
            const dot = e.zipPath.lastIndexOf('.')
            const slash = e.zipPath.lastIndexOf('/')
            e.zipPath = dot > slash ? `${e.zipPath.slice(0, dot)} (${n + 1})${e.zipPath.slice(dot)}` : `${e.zipPath} (${n + 1})`
        }
    }
}

/** Next 16 auto-implements HEAD by running GET — which would spin up a whole zip for a
 *  link-checker that never reads the body. Answer it explicitly instead. */
export async function HEAD() {
    return new NextResponse(null, { status: 405, headers: { Allow: 'GET' } })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params

    // Resolve FIRST so an anonymous caller can never spend a real link's allowance.
    const scope = await resolveShareToken(token)
    if (!scope) return NOT_FOUND()

    // Streaming many GB is the most expensive thing a client can ask for, and the
    // in-memory rateLimit() helper is a per-process Map (useless on serverless).
    // DB-backed, keyed on the share link — stable, and unspoofable via X-Forwarded-For.
    // failClosed: a limiter outage must not open the floodgate on a bandwidth route.
    const rl = await limitDb(`share-zip:${scope.shareLinkId}`, 12, 600, { failClosed: true })
    if (!rl.success) {
        return new NextResponse('Too many requests', {
            status: 429,
            headers: { 'Retry-After': String(rl.retryAfterSec) },
        })
    }

    // THE authorization boundary: the client's own library, already fully gated.
    const snap = await getDocumentsViaToken(token)
    if (!snap) return NOT_FOUND()

    const rootId = new URL(req.url).searchParams.get('folderId') || null
    const byId = new Map(snap.folders.map((f) => [f.id, f]))
    if (rootId && !byId.has(rootId)) return NOT_FOUND() // unknown/out-of-scope folder → same bare 404

    // Collect the selected folder and every descendant (null root = the whole library).
    const childrenOf = new Map<string | null, string[]>()
    for (const f of snap.folders) {
        const list = childrenOf.get(f.parentId) ?? []
        list.push(f.id)
        childrenOf.set(f.parentId, list)
    }
    const inScope = new Set<string>()
    const walk = (id: string) => {
        if (inScope.has(id)) return
        inScope.add(id)
        for (const child of childrenOf.get(id) ?? []) walk(child)
    }
    if (rootId) walk(rootId)
    else for (const f of snap.folders) inScope.add(f.id)

    // Relative zip path of a folder, measured from the selected root (root itself = '').
    const relPathOf = (folderId: string): string => {
        const segs: string[] = []
        let cur: string | null = folderId
        let guard = 0
        while (cur && cur !== rootId && guard++ < 32) {
            const f = byId.get(cur)
            if (!f) break
            segs.unshift(sanitizeSegment(f.name))
            cur = f.parentId
        }
        return segs.join('/')
    }

    const picked = snap.assets.filter((a) => inScope.has(a.folderId))
    if (picked.length === 0) return new NextResponse('Nothing to download', { status: 409 })

    const wanted = picked.slice(0, MAX_ZIP_FILES)
    const skipped = picked.length - wanted.length

    // r2Keys come from the DB by id — but only for versions already present in the
    // authorized snapshot, so no id supplied by the caller ever reaches this query.
    const versionIds = wanted.map((a) => a.currentVersion.id)
    const rows = await prisma.reviewVersion.findMany({
        where: { id: { in: versionIds }, pipelineStatus: 'READY', deletedAt: null },
        select: { id: true, r2Key: true, fileName: true },
    })
    const keyById = new Map(rows.map((r) => [r.id, r]))

    const entries: { r2Key: string; zipPath: string }[] = []
    for (const a of wanted) {
        const row = keyById.get(a.currentVersion.id)
        if (!row?.r2Key) continue
        const dir = relPathOf(a.folderId)
        const file = sanitizeSegment(row.fileName || a.currentVersion.fileName || a.title)
        entries.push({ r2Key: row.r2Key, zipPath: dir ? `${dir}/${file}` : file })
    }
    if (entries.length === 0) return new NextResponse('Nothing to download', { status: 409 })
    dedupe(entries)

    const archiveName = sanitizeSegment(
        rootId ? byId.get(rootId)?.name || 'files' : scope.clientName || 'files',
    ) + '.zip'

    void audit({
        workspaceId: null,
        actorUserId: null,
        action: 'share_link.accessed',
        targetType: 'ClientShareLink',
        targetId: scope.shareLinkId,
        after: {
            kind: 'document_zip',
            folderId: rootId,
            fileCount: entries.length,
            skipped,
            clientId: scope.clientId,
            profileId: scope.profileId,
        },
    })

    const archive = archiver('zip', { store: true }) // STORE = no recompress → lossless + fast
    archive.on('warning', (err) => reviewLog('warn', 'client_zip.warning', { error: String(err) }))

    // One entry at a time: open each R2 stream only after the previous finished, so we never
    // hold many open connections and archiver's backpressure paces us to the client's speed
    // (bounded memory even for a multi-GB production).
    const pump = async () => {
        for (const entry of entries) {
            let body: Readable
            try {
                body = await getObjectStream(entry.r2Key)
            } catch (err) {
                reviewLog('warn', 'client_zip.skip_missing', { key: entry.r2Key, error: String(err) })
                continue
            }
            const entryDone = new Promise<void>((resolve) => archive.once('entry', () => resolve()))
            archive.append(body, { name: entry.zipPath })
            await entryDone
        }
        await archive.finalize()
    }
    pump().catch((err: unknown) => {
        reviewLog('error', 'client_zip.pump_failed', { error: err instanceof Error ? err.message : String(err) })
        archive.destroy(err instanceof Error ? err : new Error(String(err)))
    })

    const webStream = Readable.toWeb(archive) as unknown as ReadableStream<Uint8Array>
    return new NextResponse(webStream, {
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${archiveName.replace(/"/g, '')}"`,
            'Cache-Control': 'no-store',
        },
    })
}
