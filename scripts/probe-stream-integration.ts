/**
 * [Video Review] End-to-end probe of the Cloudflare Stream layer using the
 * real account credentials in .env. Proves: direct upload → transcode →
 * signed playback → manifest fetch. Uploads a tiny ffmpeg-generated test clip
 * and deletes it afterwards. Does NOT touch the DB or any client data.
 *
 * Run:  npx tsx scripts/probe-stream-integration.ts
 */

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

// Load .env manually (tsx doesn't auto-load it).
for (const line of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const ACC = process.env.CLOUDFLARE_ACCOUNT_ID!
const TOK = process.env.CLOUDFLARE_STREAM_API_TOKEN!
const SUB = process.env.CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN!
const API = `https://api.cloudflare.com/client/v4/accounts/${ACC}/stream`
const H = { Authorization: `Bearer ${TOK}` }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
    // Import the ACTUAL app lib (after env is loaded) so we test real code.
    const cf = await import('../src/lib/cloudflare-stream')
    console.log('configured=', cf.isStreamConfigured(), 'canSign=', cf.canSignPlayback(), 'subdomain=', cf.getCustomerSubdomain())
    if (!cf.isStreamConfigured() || !cf.canSignPlayback()) { console.error('Missing env — aborting'); process.exit(1) }

    // 1) tiny test clip via bundled ffmpeg
    const clip = resolve(process.cwd(), 'scratch-stream-test.mp4')
    if (!existsSync(clip)) {
        const ffmpeg = require('@ffmpeg-installer/ffmpeg').path as string
        console.log('• generating 3s test clip…')
        execFileSync(ffmpeg, ['-f', 'lavfi', '-i', 'testsrc=duration=3:size=320x240:rate=15', '-pix_fmt', 'yuv420p', '-y', clip], { stdio: 'ignore' })
    }

    // 2) mint direct upload (private / requireSignedURLs)
    console.log('• minting direct upload…')
    const up = await cf.createDirectUpload({ maxDurationSeconds: 60, meta: { probe: '1' } })
    console.log('  uid=', up.uid)

    // 3) upload the clip straight to Stream
    console.log('• uploading clip…')
    const fd = new FormData()
    fd.append('file', new Blob([readFileSync(clip)]), 'test.mp4')
    const upRes = await fetch(up.uploadURL, { method: 'POST', body: fd })
    console.log('  upload status=', upRes.status)
    if (!upRes.ok) { console.error('  upload FAILED'); process.exit(1) }

    // 4) poll until ready (transcode)
    console.log('• waiting for transcode…')
    let ready = false
    for (let i = 0; i < 40; i++) {
        const d = await cf.getStreamVideo(up.uid)
        if (d?.readyToStream) { ready = true; console.log('  ready! duration=', d.durationSec, 'dims=', d.width + 'x' + d.height); break }
        await sleep(3000)
    }
    if (!ready) console.log('  (not ready after ~2min — Stream may still be encoding; signed URL test below may 404 until then)')

    // 5) signed playback token → fetch manifest
    console.log('• minting signed token + fetching manifest…')
    const token = await cf.mintSignedPlaybackToken(up.uid, { expSeconds: 600 })
    const manifest = cf.streamManifestUrl(token)!
    const mRes = await fetch(manifest)
    const body = await mRes.text().catch(() => '')
    console.log('  manifest status=', mRes.status, 'isHLS=', body.startsWith('#EXTM3U'))

    // 6) prove requireSignedURLs — fetching by RAW uid must FAIL
    const rawManifest = `https://${SUB}/${up.uid}/manifest/video.m3u8`
    const rawRes = await fetch(rawManifest)
    console.log('  raw-uid manifest status=', rawRes.status, '(expect 401/403 — signed-only)')

    // 7) cleanup — delete the probe video
    console.log('• deleting probe video…')
    const del = await fetch(`${API}/${up.uid}`, { method: 'DELETE', headers: H })
    console.log('  delete status=', del.status)
    try { rmSync(clip) } catch { /* noop */ }

    console.log('\nRESULT:',
        ready && mRes.status === 200 && body.startsWith('#EXTM3U') && (rawRes.status === 401 || rawRes.status === 403)
            ? '✅ PASS — upload + transcode + signed playback + signed-only enforcement all work.'
            : '⚠️  Check the statuses above (encode may still be in progress).')
}

main().catch((e) => { console.error(e); process.exit(1) })
