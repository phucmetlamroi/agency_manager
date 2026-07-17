// [Review module — color-fix 2026-07] Auto-tag a video's colorspace BEFORE Mux ingests it.
//
// WHY: editors' talking-head exports frequently ship with NO colorspace metadata (VUI) —
// `yuv420p(progressive)` with color_range/primaries/transfer/matrix all "unknown". When a video
// carries no color tags, every player must GUESS the color space, and they disagree: VLC guesses
// BT.709 (vivid, correct) while Mux's transcode + the browser <video> guess differently → the review
// preview looks grayer / desaturated than the original. Mux's own guidance: ALWAYS tag colorspace.
//
// WHAT: for an UNTAGGED H.264/HEVC source we losslessly write BT.709 (limited-range) tags into the
// bitstream via ffmpeg's `-c copy -bsf:v h264_metadata/hevc_metadata` (a header rewrite — NO
// re-encode, same bitrate, milliseconds of CPU), and hand the retagged copy to Mux. The original R2
// object is left untouched (downloads still serve it).
//
// HOW (no /tmp → any size): ffmpeg reads the source straight from a presigned R2 GET URL (HTTP range
// reads — it never lands the whole file on disk) and writes a fragmented MP4 to stdout, which we
// stream to a sibling R2 key via multipart. Vercel's /tmp is capped at 500 MB, so a download-to-disk
// approach would cap us at ~230 MB; streaming lifts that entirely (bounded only by the route's 800s).
//
// SAFETY (this sits on the core upload→Mux path, so it must NEVER break an upload or feed Mux a bad
// file):
//   - Skips anything already tagged, or not H.264/HEVC, or over a (generous) size guard.
//   - A soft deadline SIGKILLs a stuck ffmpeg so the Inngest step can't hang the pipeline.
//   - ffmpeg's stdout is destroyed-with-error on a non-zero exit → the multipart is ABORTED, so a
//     truncated object is never completed. We ONLY use the retagged key when ffmpeg exited 0 AND a
//     post-upload probe confirms it decodes.
//   - EVERY failure path returns the ORIGINAL key → worst case === today (untagged original to Mux),
//     never worse. This fn is written not to throw.

import { spawn, execFile } from 'node:child_process'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import { headObject, presignGetObject, putObjectFromStream, deleteObject } from './r2'
import { reviewLog } from './logger'

const FFMPEG = ffmpegInstaller.path
/** Sanity ceiling (no /tmp limit anymore; this just bounds one step's wall-clock). Env-tunable. */
const MAX_BYTES = Number(process.env.REVIEW_RETAG_MAX_BYTES) || 5 * 1024 * 1024 * 1024 // 5 GB
/** Soft deadline for the whole probe+retag+verify, kept under the route's maxDuration (800s). */
const SOFT_DEADLINE_MS = Number(process.env.REVIEW_RETAG_DEADLINE_MS) || 700_000

/** The sibling R2 key holding the color-retagged Mux input for `key`. Derivable (no schema column),
 *  so the READY webhook can best-effort delete it once Mux has finished ingesting. */
export function retaggedKeyFor(key: string): string {
    return `${key}.bt709.mp4`
}

interface ProbeResult {
    codec: string // 'h264' | 'hevc' | other
    tagged: boolean // true when a real colorspace is already signalled
}

/** Parse `ffmpeg -i URL` stderr (it prints stream info then exits non-zero for "no output file"). */
async function probeColor(url: string): Promise<ProbeResult> {
    const stderr = await new Promise<string>((resolve) => {
        execFile(FFMPEG, ['-hide_banner', '-i', url], { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 }, (_e, _o, err) => {
            resolve(err || '')
        })
    })
    const line = stderr.split('\n').find((l) => /Video:/.test(l)) || ''
    const codec = (line.match(/Video:\s*([A-Za-z0-9]+)/)?.[1] || '').toLowerCase()
    // Untagged prints e.g. `yuv420p(progressive)`. Tagged prints a real colour token:
    // `yuv420p(tv, bt709, progressive)` / bt2020 / smpte170m / arib-std-b67 (HLG) / smpte2084 (PQ).
    const tagged = /\b(bt709|bt470|bt601|bt2020|smpte170m|smpte240m|smpte2084|arib-std-b67|iec61966)\b/i.test(line)
    return { codec, tagged }
}

/** Confirm an R2 object is a decodable MP4 (decode the first frame over its presigned URL). */
async function decodesOk(url: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        execFile(FFMPEG, ['-v', 'error', '-i', url, '-frames:v', '1', '-f', 'null', '-'], { timeout: 120_000 }, (err) => {
            resolve(!err)
        })
    })
}

/**
 * Stream-retag `srcUrl` → the R2 object `outKey` (ffmpeg URL-in → fragmented-mp4 stdout → multipart).
 * Resolves only when ffmpeg exits 0 AND the upload completed; rejects (and the multipart is aborted)
 * otherwise. A deadline SIGKILLs ffmpeg. Never leaves a completed truncated object.
 */
async function streamRetag(srcUrl: string, bsf: string, outKey: string): Promise<void> {
    const child = spawn(FFMPEG, [
        '-hide_banner', '-loglevel', 'error',
        '-i', srcUrl,
        '-map', '0:v:0', '-map', '0:a?', '-c', 'copy',
        '-bsf:v', `${bsf}=video_full_range_flag=0:colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1`,
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1',
    ])
    let stderr = ''
    child.stderr.on('data', (d) => { stderr += String(d) })

    const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch { /* ignore */ } }, SOFT_DEADLINE_MS)
    // On a non-zero / killed exit, destroy stdout WITH an error so the multipart consumer throws +
    // aborts instead of completing a truncated object. On success (code 0) stdout ends normally.
    const exit = new Promise<void>((resolve, reject) => {
        child.on('error', (e) => { try { child.stdout.destroy(e) } catch { /* ignore */ }; reject(e) })
        child.on('close', (code) => {
            if (code === 0) resolve()
            else {
                const e = new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 500)}`)
                try { child.stdout.destroy(e) } catch { /* ignore */ }
                reject(e)
            }
        })
    })

    try {
        // Both must succeed: the upload (drains stdout) AND a clean ffmpeg exit.
        await Promise.all([putObjectFromStream(outKey, child.stdout, 'video/mp4'), exit])
    } finally {
        clearTimeout(timer)
    }
}

/**
 * Ensure the video handed to Mux carries colorspace tags. Returns the R2 key Mux should ingest:
 * the retagged sibling when we fixed an untagged file, else the original. NEVER throws.
 */
export async function ensureColorTaggedInput(
    r2Key: string,
    versionId: string,
): Promise<{ inputKey: string; retagged: boolean; reason?: string }> {
    const original = { inputKey: r2Key, retagged: false as const }
    try {
        const head = await headObject(r2Key)
        if (!head) return { ...original, reason: 'no-head' }
        if (head.size > MAX_BYTES) {
            reviewLog('info', 'retag.skip_too_large', { versionId, size: head.size, cap: MAX_BYTES })
            return { ...original, reason: 'too-large' }
        }

        const srcUrl = await presignGetObject(r2Key, { expiresIn: 6 * 60 * 60 })
        const probe = await probeColor(srcUrl)
        if (probe.tagged) return { ...original, reason: 'already-tagged' }
        if (probe.codec !== 'h264' && probe.codec !== 'hevc') {
            return { ...original, reason: `codec-${probe.codec || 'unknown'}` }
        }

        const bsf = probe.codec === 'hevc' ? 'hevc_metadata' : 'h264_metadata'
        const outKey = retaggedKeyFor(r2Key)
        try {
            await streamRetag(srcUrl, bsf, outKey)
        } catch (e) {
            reviewLog('warn', 'retag.stream_failed', { versionId, error: e instanceof Error ? e.message : String(e) })
            await deleteObject(outKey).catch(() => { /* best-effort */ })
            return { ...original, reason: 'stream-error' }
        }

        // ffmpeg exited 0 + upload completed → still confirm it decodes before trusting it with Mux.
        const outUrl = await presignGetObject(outKey, { expiresIn: 6 * 60 * 60 })
        if (!(await decodesOk(outUrl))) {
            reviewLog('warn', 'retag.verify_failed', { versionId })
            await deleteObject(outKey).catch(() => { /* best-effort */ })
            return { ...original, reason: 'verify-failed' }
        }

        reviewLog('info', 'retag.applied', { versionId, codec: probe.codec, size: head.size })
        return { inputKey: outKey, retagged: true }
    } catch (e) {
        reviewLog('error', 'retag.failed', { versionId, error: e instanceof Error ? e.message : String(e) })
        return { ...original, reason: 'error' }
    }
}
