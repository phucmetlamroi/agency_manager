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
/** Byte ceiling for ONE archive. STORE mode streams masters uncompressed, so the file COUNT
 *  says nothing about the work: 40 4K masters is ~200 GB through a 300-second function.
 *  Sized against the clock, not against generosity — the stream is paced to the browser, so
 *  even a sustained 100 MB/s moves only ~30 GB inside maxDuration, and a function killed
 *  mid-stream hands the client a truncated zip with no receipt (the exact failure the receipt
 *  exists to make visible). 20 GB leaves real headroom on an ordinary connection; bigger
 *  libraries come down a folder at a time, and the receipt says so. */
const MAX_ZIP_BYTES = 20 * 1024 * 1024 * 1024

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

    /* [Báo cáo chủ sản phẩm 2026-08-03] "giải nén ra thì nó đệ quy file rất là sâu."
       Khi khách tải CẢ THƯ MỤC thì `rootId` có mặt và đường dẫn đã đo từ thư mục đó — đúng.
       Khi khách TICK CHỌN file thì `rootId` là null, nên vòng lặp dưới leo tận nóc thư viện và
       mọi file mang theo cả cây `July 2026/Harrison/Alpine/…`. Với một lựa chọn nằm gọn trong
       một thư mục thì toàn bộ cây đó là nhiễu — nó giống nhau ở mọi file nên chẳng phân biệt gì.

       Đo từ TỔ TIÊN CHUNG SÂU NHẤT của những gì thực sự được đóng gói. Chọn trong một thư mục
       => phẳng. Chọn vắt qua nhiều thư mục => phần cây còn KHÁC NHAU vẫn được giữ, vì lúc đó nó
       mới là thứ tách bạch các file trùng tên. Đây thuần là cách ĐẶT TÊN trong zip; không đụng
       tới tập file được phép tải. */
    let zipBaseId: string | null = rootId
    /** Chuỗi tổ tiên từ gốc thư viện xuống tới `folderId` (kể cả chính nó). */
    const chainOf = (folderId: string): string[] => {
        const out: string[] = []
        let cur: string | null = folderId
        let guard = 0
        while (cur && guard++ < 32) {
            out.unshift(cur)
            cur = byId.get(cur)?.parentId ?? null
        }
        return out
    }

    // Relative zip path of a folder, measured from the zip base (base itself = '').
    const relPathOf = (folderId: string): string => {
        const segs: string[] = []
        let cur: string | null = folderId
        let guard = 0
        while (cur && cur !== zipBaseId && guard++ < 32) {
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

    // Tổ tiên chung sâu nhất của tập đã chọn → gốc đo đường dẫn trong zip (xem chú thích ở
    // relPathOf). Chỉ áp dụng cho nhánh tick-chọn; nhánh `folderId` đã có gốc rõ ràng rồi.
    if (!rootId) {
        let common: string[] | null = null
        for (const a of picked) {
            const chain = chainOf(a.folderId)
            if (common === null) { common = chain; continue }
            let i = 0
            while (i < common.length && i < chain.length && common[i] === chain[i]) i++
            common = common.slice(0, i)
            if (common.length === 0) break
        }
        zipBaseId = common && common.length ? common[common.length - 1] : null
    }

    // [Authz 2026-07] Two ceilings, not one. MAX_ZIP_FILES bounded the COUNT; nothing bounded
    // the BYTES, and archiver runs in STORE mode — so 40 untouched 4K masters is a ~200 GB read
    // streamed out of R2 inside one 300-second function, repeatable 12× per 10 minutes per
    // link, forever, with egress billed every time. Cut at whichever ceiling comes first, and
    // name that ceiling in the receipt so a short archive is never read as a lost file.
    const capped: typeof picked = []
    let plannedBytes = 0
    for (const a of picked) {
        if (capped.length >= MAX_ZIP_FILES) break
        const size = Number(a.currentVersion?.sizeBytes ?? 0)
        // The first entry always goes in: a single master larger than the whole budget must
        // still be downloadable, or the client is locked out of their own file.
        if (capped.length > 0 && Number.isFinite(size) && plannedBytes + size > MAX_ZIP_BYTES) break
        if (Number.isFinite(size)) plannedBytes += size
        capped.push(a)
    }
    const wanted = capped
    const skipped = picked.length - wanted.length
    const hitByteCap = skipped > 0 && wanted.length < MAX_ZIP_FILES

    // r2Keys come from the DB by id — but only for versions already present in the
    // authorized snapshot, so no id supplied by the caller ever reaches this query.
    const versionIds = wanted.map((a) => a.currentVersion.id)
    const rows = await prisma.reviewVersion.findMany({
        where: { id: { in: versionIds }, pipelineStatus: 'READY', deletedAt: null },
        select: { id: true, r2Key: true, fileName: true },
    })
    const keyById = new Map(rows.map((r) => [r.id, r]))

    const entries: { r2Key: string; zipPath: string }[] = []
    // Files the client asked for that disappeared between the snapshot and this query — staff
    // soft-deleted the version, or a re-transcode flipped it out of READY. They landed in
    // NEITHER of the receipt's lists before, so the archive just came back short with no
    // explanation: the exact "stuff is going missing" experience, produced by its own fix.
    const vanished: string[] = []
    for (const a of wanted) {
        const row = keyById.get(a.currentVersion.id)
        const dir = relPathOf(a.folderId)
        if (!row?.r2Key) {
            const missing = sanitizeSegment(a.currentVersion.fileName || a.title)
            vanished.push(dir ? `${dir}/${missing}` : missing)
            continue
        }
        const file = sanitizeSegment(row.fileName || a.currentVersion.fileName || a.title)
        entries.push({ r2Key: row.r2Key, zipPath: dir ? `${dir}/${file}` : file })
    }
    // Only a BARE 409 when nothing was ever eligible. If files WERE requested and every one of
    // them vanished between the snapshot and this lookup, the client gets the archive anyway —
    // holding just the receipt, which names each file and says who to ask. "Nothing to download"
    // on a selection the client watched themselves make is the disappearance complaint restated.
    if (entries.length === 0 && vanished.length === 0) {
        return new NextResponse('Nothing to download', { status: 409 })
    }
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

    // [Authz 2026-07] There was NO 'error' listener, and that turned a recoverable failure into
    // a hang. The try/catch below covers only getObjectStream(), which resolves as soon as R2
    // returns headers — if the body then dies mid-transfer (connection reset on a multi-GB
    // master, or the object removed while being read) archiver aborts that entry and emits
    // 'error'. The pump sits on `await entryDone`, a promise resolved ONLY by the matching
    // 'entry' event, which will now never fire and has no timeout: pump() neither resolves nor
    // rejects, finalize() is never reached, and _contents.txt is never written. The client's
    // browser, already holding a 200 with no Content-Length, shows a COMPLETED download of a
    // truncated zip. Racing every wait against this makes the failure loud instead of silent.
    const fatalSignal = new Promise<never>((_, reject) => {
        archive.on('error', (err) => reject(err instanceof Error ? err : new Error(String(err))))
    })
    // Keep an always-attached handler so a late error (after pump has finished) can never
    // surface as an unhandled rejection. Promise.race still observes the rejection below.
    fatalSignal.catch(() => { /* observed by the races below */ })

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
            // Surface a source-stream failure as an archive error rather than letting the
            // append stall silently.
            body.on('error', (err) => archive.emit('error', err))
            const entryDone = new Promise<void>((resolve) => archive.once('entry', () => resolve()))
            archive.append(body, { name: entry.zipPath })
            await Promise.race([entryDone, fatalSignal])
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
        // Requested, but gone by the time we looked up the storage key. Previously counted
        // nowhere at all — the archive was simply short.
        if (vanished.length) {
            lines.push(
                '',
                `NO LONGER AVAILABLE (${vanished.length})`,
                '  These were in your library when this download started but were changed or',
                '  removed while it ran. Ask the studio and they will re-send them.',
                ...vanished.map((p) => `  ${p}`),
            )
        }
        if (skipped > 0) {
            lines.push(
                '',
                `NOT INCLUDED THIS TIME (${skipped})`,
                hitByteCap
                    ? `  One archive is capped at ${Math.round(MAX_ZIP_BYTES / 1024 / 1024 / 1024)} GB. Download the rest separately, or a folder at a time.`
                    : `  This download was capped at ${MAX_ZIP_FILES} files. Download the remaining files separately, or a folder at a time.`,
            )
        }
        const receiptDone = new Promise<void>((resolve) => archive.once('entry', () => resolve()))
        archive.append(Buffer.from(lines.join('\r\n'), 'utf8'), { name: '_contents.txt' })
        await Promise.race([receiptDone, fatalSignal])

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
