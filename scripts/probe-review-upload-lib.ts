/**
 * [Review module P1.1] Prove the shared upload lib works.
 *   1. Pure helpers: part size / count / single-part, sanitizeFileName,
 *      buildR2Key, slugifyBrand, buildSystemKey, looksLikeMedia, parseFps.
 *   2. R2 multipart roundtrip against the real hustly-review bucket:
 *      createMultipart → presign 2 parts → PUT (2×6MB) → listParts →
 *      completeMultipart → getObjectRange → deleteObject.
 *   3. Mux wrapper: createMuxAsset (from the public demo URL) → poll getMuxAsset
 *      to ready → extractReadyMeta → deleteMuxAsset.
 *
 * Run: npx tsx scripts/probe-review-upload-lib.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import crypto from 'crypto'
import {
    computePartSize, computePartCount, isSinglePart, sanitizeFileName,
    buildR2Key, slugifyBrand, buildSystemKey, looksLikeMedia, parseFps,
} from '../src/lib/review/upload-helpers'
import { mediaKindFromMime } from '../src/lib/review/media-constants'
import {
    createMultipart, presignUploadPart, completeMultipart, listParts,
    getObjectRange, deleteObject,
} from '../src/lib/review/r2'
import { createMuxAsset, getMuxAsset, extractReadyMeta, deleteMuxAsset } from '../src/lib/review/mux'

// Load .env (repo pattern).
try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8')
    for (const line of env.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
} catch { /* ignore */ }

const DEMO_VIDEO = 'https://storage.googleapis.com/muxdemofiles/mux-video-intro.mp4'
const MB = 1024 * 1024
let ok = 0, fail = 0
const check = (name: string, cond: boolean, extra = '') => {
    (cond ? ok++ : fail++); console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
    console.log('=== P1.1 upload-lib probe ===\n')

    // ── 1. Pure helpers ───────────────────────────────────────────
    console.log('[1] Pure helpers')
    check('partSize ≤500MB → 10MB', computePartSize(400n * BigInt(MB)) === 10 * MB)
    check('partSize ≤2GB → 20MB', computePartSize(1500n * BigInt(MB)) === 20 * MB)
    check('partSize >2GB → 50MB', computePartSize(3n * 1024n * BigInt(MB)) === 50 * MB)
    check('partCount 2GB/20MB = 103', computePartCount(2n * 1024n * BigInt(MB), 20 * MB) === 103)
    check('isSinglePart small image true', isSinglePart(2n * BigInt(MB), 10 * MB) === true)
    check('isSinglePart big video false', isSinglePart(200n * BigInt(MB), 10 * MB) === false)
    check('sanitize keeps ext, strips unsafe',
        sanitizeFileName('Vidéo 6 — Cons/ult\\ation *v4?.MP4') === 'Vid_o_6_Cons_ult_ation_v4.MP4',
        sanitizeFileName('Vidéo 6 — Cons/ult\\ation *v4?.MP4'))
    check('sanitize never empty', sanitizeFileName('***.???').length > 0, sanitizeFileName('***.???'))
    check('buildR2Key shape',
        buildR2Key('ws1', 'a1', 4, 'My Video.mp4') === 'review/ws1/a1/v4/My_Video.mp4',
        buildR2Key('ws1', 'a1', 4, 'My Video.mp4'))
    check('slugifyBrand ascii', slugifyBrand('Michael Đặng / Bắc Ninh!') === 'michael-dang-bac-ninh', slugifyBrand('Michael Đặng / Bắc Ninh!'))
    check('slugifyBrand fallback', slugifyBrand('***') === 'brand')
    check('systemKey full chain',
        buildSystemKey({ workspaceId: 'w', clientId: 'c', brandKey: 'b', taskId: 't' }) === 'ws:w:client:c:brand:b:task:t')
    check('systemKey brand-skipped',
        buildSystemKey({ workspaceId: 'w', clientId: 'c', taskId: 't' }) === 'ws:w:client:c:task:t')
    check('mediaKind mp4 → VIDEO', mediaKindFromMime('video/mp4', 'a.mp4') === 'VIDEO')
    check('mediaKind empty-mime .mkv → VIDEO', mediaKindFromMime('', 'a.mkv') === 'VIDEO')
    check('mediaKind png → IMAGE', mediaKindFromMime('image/png', 'a.png') === 'IMAGE')
    check('mediaKind docx → null (415)', mediaKindFromMime('application/vnd.openxmlformats', 'a.docx') === null)
    // magic bytes
    const ftyp = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32])
    const textBuf = new TextEncoder().encode('Hello this is not a video at all!!')
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    check('looksLikeMedia VIDEO ftyp true', looksLikeMedia('VIDEO', ftyp) === true)
    check('looksLikeMedia VIDEO text false', looksLikeMedia('VIDEO', textBuf) === false)
    check('looksLikeMedia IMAGE png true', looksLikeMedia('IMAGE', png) === true)
    check('parseFps 30000/1001', JSON.stringify(parseFps('30000/1001')) === JSON.stringify({ num: 30000, den: 1001 }))
    check('parseFps 29.97 → rational', JSON.stringify(parseFps(29.97)) === JSON.stringify({ num: 30000, den: 1001 }))
    check('parseFps 25 → 25/1', JSON.stringify(parseFps('25')) === JSON.stringify({ num: 25, den: 1 }))

    // ── 2. R2 multipart roundtrip ─────────────────────────────────
    console.log('\n[2] R2 multipart roundtrip (real bucket)')
    const key = `_probe/p1-lib-${crypto.randomBytes(6).toString('hex')}.bin`
    try {
        const uploadId = await createMultipart(key, 'application/octet-stream')
        check('createMultipart → uploadId', Boolean(uploadId))
        const part1 = crypto.randomBytes(6 * MB)
        const part2 = crypto.randomBytes(6 * MB)
        const parts: { partNumber: number; etag: string }[] = []
        for (const [i, buf] of [part1, part2].entries()) {
            const url = await presignUploadPart(key, uploadId, i + 1)
            const put = await fetch(url, { method: 'PUT', body: buf })
            const etag = put.headers.get('etag') || ''
            check(`PUT part ${i + 1}`, put.ok && Boolean(etag), `HTTP ${put.status}`)
            parts.push({ partNumber: i + 1, etag })
        }
        const staged = await listParts(key, uploadId)
        check('listParts sees 2 staged', staged.length === 2, `${staged.length}`)
        await completeMultipart(key, uploadId, parts)
        const head = await getObjectRange(key, 0, 15)
        check('completeMultipart + getObjectRange 16B', head.length === 16, `${head.length} bytes`)
        // first 16 bytes must equal part1's first 16 bytes
        check('object bytes match part1 head', Buffer.from(head).equals(part1.subarray(0, 16)))
        await deleteObject(key)
        console.log(`  (cleanup: deleted ${key})`)
    } catch (e) {
        check('R2 multipart flow', false, (e as Error).message)
    }

    // ── 3. Mux wrapper ────────────────────────────────────────────
    console.log('\n[3] Mux wrapper (create demo asset → ready → delete)')
    let assetId = ''
    try {
        const asset = await createMuxAsset({ inputUrl: DEMO_VIDEO, passthrough: 'p1-lib-probe' })
        assetId = asset.id
        check('createMuxAsset → id + passthrough', Boolean(assetId) && asset.passthrough === 'p1-lib-probe', assetId)
        let ready = null as Awaited<ReturnType<typeof getMuxAsset>> | null
        for (let i = 0; i < 24; i++) { // up to ~4 min
            const a = await getMuxAsset(assetId)
            if (a.status === 'ready') { ready = a; break }
            if (a.status === 'errored') { check('asset not errored', false, JSON.stringify(a.errors)); break }
            await sleep(10000)
        }
        check('getMuxAsset reached ready', ready?.status === 'ready', ready?.status || 'timeout')
        if (ready) {
            const meta = extractReadyMeta(ready)
            check('extractReadyMeta playbackId (signed)', Boolean(meta.muxPlaybackId), meta.muxPlaybackId || '')
            check('extractReadyMeta duration+dims', Boolean(meta.durationMs && meta.width && meta.height),
                `${meta.durationMs}ms ${meta.width}x${meta.height} fps ${meta.fpsNumerator}/${meta.fpsDenominator}`)
        }
    } catch (e) {
        check('Mux wrapper flow', false, (e as Error).message)
    } finally {
        if (assetId) { await deleteMuxAsset(assetId); console.log(`  (cleanup: deleted Mux asset ${assetId})`) }
    }

    console.log(`\nRESULT: ${ok} passed, ${fail} failed`)
    process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
