/**
 * READ-ONLY diagnostic: does SIGNED PLAYBACK actually work end-to-end for the
 * ready Mux asset? Mints the same RS256 playback JWT the app mints (same code
 * path: src/lib/review/mux-jwt), then fetches:
 *   1. the HLS master playlist  https://stream.mux.com/{playbackId}.m3u8?token=…
 *   2. one media playlist + one segment from it
 *   3. (control) the signed thumbnail — known to WORK per the user's report
 * If (1)/(2) fail while (3) passes, the playback token/policy is the root cause.
 *
 * Run: npx tsx scripts/probe-signed-playback.ts <playbackId>
 */

import { readFileSync } from 'fs'
import { join } from 'path'

try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8')
    for (const line of env.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
} catch {
    /* ignore */
}

const playbackId = process.argv[2] || 'pUKmSV9KeD1gogSSkk00IRNSKFat00idBq3Hq9WnPBJfQ'

async function main() {
    const { mintPlaybackTokens } = await import('../src/lib/review/mux-jwt')
    const { tokens } = mintPlaybackTokens(playbackId)

    console.log('=== Signed playback probe (READ-ONLY) ===')
    console.log(`playbackId: ${playbackId}`)
    console.log(`token lengths: playback=${tokens.playback.length} thumb=${tokens.thumbnail.length} story=${tokens.storyboard.length}\n`)

    // 3 (control): thumbnail — the user's UI shows this WORKS.
    const thumbUrl = `https://image.mux.com/${playbackId}/thumbnail.webp?width=64&token=${tokens.thumbnail}`
    const thumb = await fetch(thumbUrl)
    console.log(`[control] thumbnail: HTTP ${thumb.status} (${thumb.headers.get('content-type')})`)

    // 1: master playlist
    const masterUrl = `https://stream.mux.com/${playbackId}.m3u8?token=${tokens.playback}`
    const master = await fetch(masterUrl)
    const masterBody = await master.text()
    console.log(`\n[1] master m3u8: HTTP ${master.status} (${master.headers.get('content-type')})`)
    console.log(masterBody.slice(0, 700))

    if (!master.ok) {
        console.log('\n→ MASTER PLAYLIST FAILED — playback token/policy is the problem.')
        return
    }

    // 2: first media playlist (rendition), then first segment
    const mediaLine = masterBody.split('\n').find((l) => l.trim() && !l.startsWith('#'))
    if (!mediaLine) {
        console.log('\n→ master has no rendition lines?!')
        return
    }
    const mediaUrl = new URL(mediaLine.trim(), `https://stream.mux.com/`).toString()
    const media = await fetch(mediaUrl)
    const mediaBody = await media.text()
    console.log(`\n[2a] media playlist: HTTP ${media.status}`)
    console.log(mediaBody.slice(0, 500))

    const segLine = mediaBody.split('\n').find((l) => l.trim() && !l.startsWith('#'))
    if (segLine) {
        const segUrl = new URL(segLine.trim(), mediaUrl).toString()
        const seg = await fetch(segUrl, { headers: { Range: 'bytes=0-1023' } })
        console.log(`\n[2b] first segment (${segUrl.split('/').pop()?.slice(0, 40)}…): HTTP ${seg.status} len=${seg.headers.get('content-length')}`)
    }

    console.log('\n=== DONE ===')
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
