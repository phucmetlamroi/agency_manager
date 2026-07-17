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
// re-encode, same bitrate/size, milliseconds of CPU), upload the retagged copy to a sibling R2 key,
// and hand THAT to Mux. The original object is left untouched (downloads still serve it).
//
// SAFETY (this sits on the core upload→Mux path, so it must NEVER break an upload):
//   - Gated by size (REVIEW_RETAG_MAX_BYTES, default 600 MB) so /tmp + the step's wall-clock stay bounded.
//   - Skips anything already tagged, or not H.264/HEVC.
//   - A soft internal deadline kills a slow ffmpeg so the Inngest step can't hang the pipeline.
//   - EVERY failure path returns the ORIGINAL key → worst case === today (untagged original to Mux),
//     never worse. The caller treats a thrown error the same way, but this fn is written not to throw.

import { execFile } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import { getObjectStream, headObject, putObjectFromFile } from './r2'
import { reviewLog } from './logger'

const FFMPEG = ffmpegInstaller.path
/** Only files at/under this size are retagged inline; larger ones fall back to the original
 *  (the download+ffmpeg+upload must fit in one Inngest step's wall-clock + /tmp). Tune per plan. */
const MAX_BYTES = Number(process.env.REVIEW_RETAG_MAX_BYTES) || 600 * 1024 * 1024
/** Soft deadline for the whole download+probe+retag+upload — well under the route maxDuration so a
 *  slow ffmpeg is abandoned (→ original key) instead of getting hard-killed by Vercel mid-step. */
const SOFT_DEADLINE_MS = Number(process.env.REVIEW_RETAG_DEADLINE_MS) || 240_000

/** The sibling R2 key holding the color-retagged Mux input for `key`. Derivable (no schema column),
 *  so the READY webhook can best-effort delete it once Mux has finished ingesting. */
export function retaggedKeyFor(key: string): string {
    return `${key}.bt709.mp4`
}

interface ProbeResult {
    codec: string // 'h264' | 'hevc' | other
    tagged: boolean // true when a real colorspace is already signalled
}

/** Parse `ffmpeg -i FILE` stderr (it prints stream info then exits non-zero for "no output"). */
async function probeColor(file: string): Promise<ProbeResult> {
    const stderr = await new Promise<string>((resolve) => {
        execFile(FFMPEG, ['-hide_banner', '-i', file], { timeout: 30_000 }, (_err, _out, err) => {
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

/** Run ffmpeg with args; reject on non-zero exit. `killRef` lets the deadline abort it. */
function runFfmpeg(args: string[], killRef: { child?: ReturnType<typeof execFile> }): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const child = execFile(FFMPEG, args, { maxBuffer: 8 * 1024 * 1024 }, (err) => {
            if (err) reject(err)
            else resolve()
        })
        killRef.child = child
    })
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
    let dir: string | null = null
    const killRef: { child?: ReturnType<typeof execFile> } = {}
    let timer: NodeJS.Timeout | null = null

    try {
        const head = await headObject(r2Key)
        if (!head) return { ...original, reason: 'no-head' }
        if (head.size > MAX_BYTES) {
            reviewLog('info', 'retag.skip_too_large', { versionId, size: head.size, cap: MAX_BYTES })
            return { ...original, reason: 'too-large' }
        }

        // Soft deadline: abandon (kill ffmpeg) and fall back to the original so the step can't hang.
        const deadline = new Promise<'deadline'>((resolve) => {
            timer = setTimeout(() => {
                try { killRef.child?.kill('SIGKILL') } catch { /* ignore */ }
                resolve('deadline')
            }, SOFT_DEADLINE_MS)
        })

        const work = (async (): Promise<{ inputKey: string; retagged: boolean; reason?: string }> => {
            dir = await mkdtemp(join(tmpdir(), 'review-retag-'))
            const inFile = join(dir, 'in')
            await pipeline(await getObjectStream(r2Key), createWriteStream(inFile))

            const probe = await probeColor(inFile)
            if (probe.tagged) return { ...original, reason: 'already-tagged' }
            if (probe.codec !== 'h264' && probe.codec !== 'hevc') {
                return { ...original, reason: `codec-${probe.codec || 'unknown'}` }
            }

            const bsf = probe.codec === 'hevc' ? 'hevc_metadata' : 'h264_metadata'
            const outFile = join(dir, 'out.mp4')
            // BT.709 + limited (studio) range — matches how VLC renders these files (i.e. the vivid,
            // correct look). colour_primaries=1 transfer=1 matrix=1 => bt709; full_range_flag=0 => tv.
            await runFfmpeg(
                ['-y', '-loglevel', 'error', '-i', inFile, '-map', '0:v:0', '-map', '0:a?', '-c', 'copy',
                 '-bsf:v', `${bsf}=video_full_range_flag=0:colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1`,
                 outFile],
                killRef,
            )
            // Verify the retagged file actually decodes (a corrupt output must NEVER reach Mux).
            await runFfmpeg(['-v', 'error', '-i', outFile, '-frames:v', '1', '-f', 'null', '-'], killRef)
            const outSize = (await stat(outFile)).size
            if (outSize < head.size * 0.5) throw new Error(`retag output too small (${outSize} vs ${head.size})`)

            const outKey = retaggedKeyFor(r2Key)
            await putObjectFromFile(outKey, outFile, outSize, 'video/mp4')
            reviewLog('info', 'retag.applied', { versionId, codec: probe.codec, size: head.size })
            return { inputKey: outKey, retagged: true }
        })()

        // If the deadline wins the race, `work` is left pending and may reject later (killed ffmpeg /
        // aborted upload) — swallow that so it can't surface as an unhandled rejection after we returned.
        work.catch(() => { /* superseded by deadline */ })
        const raced = await Promise.race([work, deadline])
        if (raced === 'deadline') {
            reviewLog('warn', 'retag.deadline', { versionId, size: head.size })
            return { ...original, reason: 'deadline' }
        }
        return raced
    } catch (e) {
        reviewLog('error', 'retag.failed', { versionId, error: e instanceof Error ? e.message : String(e) })
        return { ...original, reason: 'error' }
    } finally {
        if (timer) clearTimeout(timer)
        if (dir) await rm(dir, { recursive: true, force: true }).catch(() => { /* best-effort */ })
    }
}
