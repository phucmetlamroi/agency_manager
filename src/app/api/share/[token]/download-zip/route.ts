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
/** Bound on how many ids we will even PARSE out of the query string, before any
 *  intersection work. MAX_ZIP_FILES only bounds the result, not the input. */
const MAX_IDS = 500

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

    const sp = new URL(req.url).searchParams
    /** Guard the PARSED id lists too — MAX_ZIP_FILES only bounds the result. */
    const idList = (key: string) =>
        (sp.get(key) ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_IDS)

    const rootId = sp.get('folderId') || null
    // Explicit tick-selection: the client picked individual files and/or whole folders.
    // Ids are only ever INTERSECTED with the authorized snapshot below, never trusted.
    const pickedIds = new Set(idList('assetIds'))
    const pickedFolderIds = idList('folderIds')

    const byId = new Map(snap.folders.map((f) => [f.id, f]))
    if (rootId && !byId.has(rootId)) return NOT_FOUND() // unknown/out-of-scope folder → same bare 404

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

    // THREE EXPLICIT BRANCHES, never a fallthrough.
    //
    // The obvious way to add folderIds — union it into the existing `if (rootId) walk()
    // else everything` — is a trap: with no `folderId` in the query the else-branch adds
    // EVERY folder, so a client ticking three files would silently download the entire
    // multi-GB library. Whole-library must be something the caller asks for by supplying
    // nothing at all, not something they fall into by supplying the wrong thing.
    const hasSelection = pickedIds.size > 0 || pickedFolderIds.length > 0
    if (rootId) {
        walk(rootId)
    } else if (hasSelection) {
        // Only VALIDATED roots. An unknown folder id is ignored rather than walked —
        // walk() would happily seed inScope with an id that is not in the snapshot.
        for (const id of pickedFolderIds) if (byId.has(id)) walk(id)
    } else {
        for (const f of snap.folders) inScope.add(f.id)
    }

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

    // Mixed selection: ticked files PLUS everything inside ticked folders.
    const picked = hasSelection && !rootId
        ? snap.assets.filter((a) => pickedIds.has(a.id) || inScope.has(a.folderId))
        : snap.assets.filter((a) => inScope.has(a.folderId))
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
        pickedIds.size
            ? `${scope.clientName || 'files'} (${entries.length} files)`
            : rootId
              ? byId.get(rootId)?.name || 'files'
              : scope.clientName || 'files',
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
        const included: string[] = []
        const failed: string[] = []
        for (const entry of entries) {
            let body: Readable
            try {
                body = await getObjectStream(entry.r2Key)
            } catch (err) {
                // Do NOT swallow this. Silently dropping a file is how "a lot of stuff is
                // kind of going missing" happens — the client gets a smaller archive and no
                // reason. It is recorded and reported inside the archive instead.
                reviewLog('warn', 'client_zip.skip_missing', { key: entry.r2Key, error: String(err) })
                failed.push(entry.zipPath)
                continue
            }
            const entryDone = new Promise<void>((resolve) => archive.once('entry', () => resolve()))
            archive.append(body, { name: entry.zipPath })
            await entryDone
            included.push(entry.zipPath)
        }

        // The receipt, written LAST and built from what ACTUALLY got packed.
        //
        // Two reasons it is last, and both matter. First, a manifest computed up-front
        // certifies the plan, not the delivery — it would list files the loop above had
        // just skipped, which turns "stuff went missing" into "stuff went missing and we
        // handed them a receipt saying it shipped". Second, this response is chunked with
        // no Content-Length, so a truncated stream arrives at the browser as a COMPLETED
        // download of a corrupt archive; a receipt at the end is the one cheap way for
        // anyone to tell a whole zip from a cut-off one.
        //
        // Plain text, not CSV: every name here is free text (file names, folder names),
        // and a value starting with = + - or @ executes as a formula when a CSV is opened
        // in Excel or Sheets.
        const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
        const lines = [
            `Downloaded from ${scope.clientName || 'your library'} — ${stamp}`,
            '',
            `FILES IN THIS ARCHIVE (${included.length})`,
            ...included.map((p) => `  ${p}`),
        ]
        if (failed.length) {
            lines.push(
                '',
                `COULD NOT BE INCLUDED (${failed.length})`,
                '  These were listed for download but could not be read from storage.',
                '  Nothing has been lost — please tell the studio and they will re-send them.',
                ...failed.map((p) => `  ${p}`),
            )
        }
        if (skipped > 0) {
            lines.push('', `NOT REQUESTED (${skipped})`, `  This download was capped at ${MAX_ZIP_FILES} files. Download the remaining files separately, or a folder at a time.`)
        }
        const receiptDone = new Promise<void>((resolve) => archive.once('entry', () => resolve()))
        archive.append(Buffer.from(lines.join('\r\n'), 'utf8'), { name: '_contents.txt' })
        await receiptDone

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
