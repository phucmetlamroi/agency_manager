// [Review module] GET /api/review/download-zip?folders=<ids>&assets=<ids>
// Streams a single .zip of the selected Team "Tệp" items straight from R2 — no server buffering,
// nothing re-encoded (STORE method → lossless; a zip never reduces video quality, it just bundles
// many files into one download). Replaces the old "download each file one-by-one" behaviour.
//   • a folder → the whole subtree, relative paths preserved
//   • assets   → each asset's current READY version
// Auth + FR-03 folder scope are enforced by collectZipFiles (reuses getFolderManifest / assertAssetInScope).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Long enough to stream a large folder; Vercel clamps to the plan's ceiling.
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'node:stream'
import archiver from 'archiver'
import { withReviewRoute } from '@/lib/review/route-auth'
import { collectZipFiles } from '@/lib/review/download-zip'
import { getObjectStream } from '@/lib/review/r2'
import { reviewLog } from '@/lib/review/logger'

function idList(sp: URLSearchParams, key: string): string[] {
    return (sp.get(key) ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
}

export const GET = withReviewRoute(async (req: NextRequest) => {
    const sp = new URL(req.url).searchParams
    // Resolve + authorize BEFORE returning the stream, so access errors map to a clean 4xx envelope
    // (not a corrupt half-zip). collectZipFiles throws the standard review error on any failure.
    const plan = await collectZipFiles({ folderIds: idList(sp, 'folders'), assetIds: idList(sp, 'assets') })

    const archive = archiver('zip', { store: true }) // STORE = no recompress → lossless + fast for video
    archive.on('warning', (err) => reviewLog('warn', 'zip.warning', { error: String(err) }))

    // Append entries ONE AT A TIME: open each R2 stream only after the previous entry finished, so we
    // never hold many open R2 connections, and archiver's backpressure paces us to the client's speed
    // (bounded memory even for multi-GB folders).
    const pump = async () => {
        for (const entry of plan.entries) {
            let body: Readable
            try {
                body = await getObjectStream(entry.r2Key)
            } catch (err) {
                reviewLog('warn', 'zip.skip_missing', { key: entry.r2Key, error: String(err) })
                continue
            }
            const entryDone = new Promise<void>((resolve) => archive.once('entry', () => resolve()))
            archive.append(body, { name: entry.zipPath })
            await entryDone
        }
        await archive.finalize()
    }
    pump().catch((err: unknown) => {
        reviewLog('error', 'zip.pump_failed', { error: err instanceof Error ? err.message : String(err) })
        archive.destroy(err instanceof Error ? err : new Error(String(err)))
    })

    const webStream = Readable.toWeb(archive) as unknown as ReadableStream<Uint8Array>
    return new NextResponse(webStream, {
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${plan.archiveName.replace(/"/g, '')}"`,
            'Cache-Control': 'no-store',
        },
    })
})
