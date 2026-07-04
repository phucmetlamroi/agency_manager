/**
 * [Review module P1.9] Verify the PURE logic of the client upload engine + the
 * observable store. Network/XHR/window paths need a browser (Browser DoD), so
 * here we cover: part planning, backoff, retry classification, byte accounting,
 * speed EMA, client validation, and the store's snapshot/subscription contract.
 * Run: npx tsx scripts/probe-review-upload-engine.ts
 */
import {
    planParts,
    computeBackoffMs,
    isRetryableStatus,
    computeBytesUploaded,
    nextSpeedEma,
    validateFileMeta,
    validateFileContent,
    BACKOFF_CAP_MS,
} from '../src/lib/review/upload-engine'
import {
    createUploadStore,
    aggregateProgress,
    etaSeconds,
    hasBlockingUploads,
    isActiveStatus,
    formatBytes,
    formatDuration,
    type UploadItem,
    type UploadTarget,
} from '../src/lib/review/upload-store'

let ok = 0
let fail = 0
const check = (name: string, pass: boolean, detail = '') => {
    pass ? ok++ : fail++
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${pass || !detail ? '' : ` — ${detail}`}`)
}

const MB = 1024 * 1024
const GB = 1024 * MB

// ── planParts ─────────────────────────────────────────────────────────────────
console.log('\nplanParts')
{
    // 2GiB @ 20MiB parts = ceil(2147483648 / 20971520) = 103 parts.
    const p = planParts(2 * GB, 20 * MB)
    const expectParts = Math.ceil((2 * GB) / (20 * MB))
    check(`2GB/20MB → ${expectParts} parts`, p.length === expectParts, String(p.length))
    check('parts contiguous + cover file', p[0].start === 0 && p[p.length - 1].end === 2 * GB)
    check('sizes sum to fileSize', p.reduce((s, x) => s + x.size, 0) === 2 * GB)
    check('partNumbers 1..N ascending', p.every((x, i) => x.partNumber === i + 1))

    // 25MB @ 10MB → 3 parts, last 5MB.
    const q = planParts(25 * MB, 10 * MB)
    check('25MB/10MB → 3 parts', q.length === 3, String(q.length))
    check('last part smaller (5MB)', q[2].size === 5 * MB, String(q[2].size))

    // single part (image ≤ partSize).
    const s = planParts(3 * MB, 10 * MB)
    check('3MB/10MB → 1 part', s.length === 1 && s[0].size === 3 * MB)

    // 0-byte / degenerate → still 1 part (never empty plan).
    check('0 bytes → 1 part', planParts(0, 10 * MB).length === 1)
    check('exact multiple (20MB/10MB) → 2 parts', planParts(20 * MB, 10 * MB).length === 2)
}

// ── computeBackoffMs ──────────────────────────────────────────────────────────
console.log('\ncomputeBackoffMs')
{
    check('attempt 1 base 2000 + jitter', computeBackoffMs(1, () => 0) === 2000)
    check('attempt 1 max jitter', computeBackoffMs(1, () => 0.999) === 2000 + 499)
    check('attempt 3 = 8000', computeBackoffMs(3, () => 0) === 8000)
    check('capped at 30s (attempt 20)', computeBackoffMs(20, () => 0) === BACKOFF_CAP_MS)
    check('attempt 0 = 1000', computeBackoffMs(0, () => 0) === 1000)
    check('monotonic up to cap', computeBackoffMs(2, () => 0) < computeBackoffMs(4, () => 0))
}

// ── isRetryableStatus ─────────────────────────────────────────────────────────
console.log('\nisRetryableStatus')
{
    for (const s of [429, 500, 502, 503, 504]) check(`${s} retryable`, isRetryableStatus(s))
    for (const s of [200, 204, 400, 403, 404, 409, 410, 413, 415]) check(`${s} NOT retryable`, !isRetryableStatus(s))
}

// ── computeBytesUploaded ──────────────────────────────────────────────────────
console.log('\ncomputeBytesUploaded')
{
    const plan = planParts(25 * MB, 10 * MB) // [10,10,5]
    // part1 done, part2 in-flight 4MB, part3 pending.
    const done = new Set([1])
    const inflight = new Map([[2, 4 * MB]])
    check('done + inflight', computeBytesUploaded(plan, done, inflight, 25 * MB) === 10 * MB + 4 * MB)
    // all done → full size (clamped).
    check(
        'all done → fileSize',
        computeBytesUploaded(plan, new Set([1, 2, 3]), new Map(), 25 * MB) === 25 * MB,
    )
    // over-report clamps to size.
    check(
        'clamp to fileSize',
        computeBytesUploaded(plan, new Set([1, 2, 3]), new Map([[3, 99 * MB]]), 25 * MB) === 25 * MB,
    )
    check('nothing → 0', computeBytesUploaded(plan, new Set(), new Map(), 25 * MB) === 0)
}

// ── nextSpeedEma ──────────────────────────────────────────────────────────────
console.log('\nnextSpeedEma')
{
    check('first sample = instantaneous', nextSpeedEma(null, 1000, 1000) === 1000)
    check('dt<=0 keeps prev', nextSpeedEma(500, 1000, 0) === 500)
    check('negative bytes keeps prev', nextSpeedEma(500, -10, 1000) === 500)
    const blended = nextSpeedEma(1000, 2000, 1000) // inst=2000 → 0.7*1000+0.3*2000=1300
    check('EMA blend 0.7/0.3', Math.abs(blended! - 1300) < 1e-6, String(blended))
}

// ── validateFileMeta ──────────────────────────────────────────────────────────
console.log('\nvalidateFileMeta')
{
    const empty = validateFileMeta('a.mp4', 0, 'video/mp4')
    check('0-byte → EMPTY', !empty.ok && empty.code === 'EMPTY')
    const pdf = validateFileMeta('doc.pdf', 100, 'application/pdf')
    check('pdf → UNSUPPORTED_TYPE', !pdf.ok && pdf.code === 'UNSUPPORTED_TYPE')
    const vid = validateFileMeta('clip.mp4', 500 * MB, 'video/mp4')
    check('valid video → ok VIDEO', vid.ok && vid.kind === 'VIDEO')
    const mkv = validateFileMeta('movie.mkv', 10 * MB, '') // empty mime → ext fallback
    check('empty-mime .mkv → VIDEO', mkv.ok && mkv.kind === 'VIDEO')
    // The engine coerces empty MIME → 'application/octet-stream' before initiate (server min(1)).
    // That coerced value must still classify the .mkv as VIDEO both client- and server-side.
    const octet = validateFileMeta('movie.mkv', 10 * MB, 'application/octet-stream')
    check('octet-stream .mkv → VIDEO (coercion path)', octet.ok && octet.kind === 'VIDEO')
    const img = validateFileMeta('p.jpg', 2 * MB, 'image/jpeg')
    check('valid image → ok IMAGE', img.ok && img.kind === 'IMAGE')
    const bigVid = validateFileMeta('huge.mp4', 5 * GB + 1, 'video/mp4')
    check('video >5GB → TOO_LARGE', !bigVid.ok && bigVid.code === 'TOO_LARGE')
    const bigImg = validateFileMeta('huge.png', 100 * MB + 1, 'image/png')
    check('image >100MB → TOO_LARGE', !bigImg.ok && bigImg.code === 'TOO_LARGE')
    const okImg = validateFileMeta('ok.png', 100 * MB, 'image/png')
    check('image exactly 100MB → ok', okImg.ok)
}

// ── validateFileContent (magic bytes) ─────────────────────────────────────────
console.log('\nvalidateFileContent')
{
    const mp4 = new Uint8Array(16)
    mp4.set([0x66, 0x74, 0x79, 0x70], 4) // 'ftyp' at offset 4
    check('mp4 ftyp → video ok', validateFileContent('VIDEO', mp4).ok)
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
    check('jpeg magic → image ok', validateFileContent('IMAGE', jpeg).ok)
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    check('png magic → image ok', validateFileContent('IMAGE', png).ok)
    const junk = new Uint8Array(16) // all zero
    const jv = validateFileContent('VIDEO', junk)
    check('junk → video BAD_CONTENT', !jv.ok && jv.code === 'BAD_CONTENT')
    check('jpeg-as-video → BAD_CONTENT', !validateFileContent('VIDEO', jpeg).ok)
}

// ── store: snapshot + subscription contract ───────────────────────────────────
console.log('\nuploadStore')
{
    const store = createUploadStore()
    const target: UploadTarget = { kind: 'folder', folderId: null, workspaceId: 'ws1' }
    const mk = (id: string, over: Partial<UploadItem> = {}): UploadItem => ({
        id,
        name: `${id}.mp4`,
        sizeBytes: 100,
        kind: 'VIDEO',
        status: 'queued',
        pausedReason: null,
        bytesUploaded: 0,
        speedBps: null,
        error: null,
        errorCode: null,
        targetLabel: 'x',
        target,
        uploadSessionId: null,
        versionId: null,
        assetId: null,
        versionNumber: null,
        folderPath: null,
        createdNewAsset: null,
        version: null,
        serverStatus: null,
        createdAt: 0,
        updatedAt: 0,
        ...over,
    })

    const s0 = store.getSnapshot()
    check('initial snapshot empty', s0.items.length === 0)
    check('snapshot ref stable (no mutation)', store.getSnapshot() === s0)
    check('server snapshot stable + empty', store.getServerSnapshot() === store.getServerSnapshot())

    let notified = 0
    const unsub = store.subscribe(() => notified++)

    store.add(mk('a'))
    const s1 = store.getSnapshot()
    check('add → new snapshot ref', s1 !== s0)
    check('add → notified', notified === 1)
    check('add → item present + byId', s1.items.length === 1 && s1.byId['a']?.id === 'a')

    store.add(mk('b'))
    const sAB = store.getSnapshot()
    const bRef = sAB.byId['b']
    check('order preserved (a,b)', sAB.items.map((i) => i.id).join(',') === 'a,b')

    store.patch('a', { status: 'uploading', bytesUploaded: 50 })
    const s2 = store.getSnapshot()
    check('patch → new ref', s2 !== sAB)
    check('patch applied', s2.byId['a']?.status === 'uploading' && s2.byId['a']?.bytesUploaded === 50)
    check('patch other item untouched (same ref)', s2.byId['b'] === bRef)
    check('patch updates updatedAt', s2.byId['a']!.updatedAt >= 0)

    const beforeMissing = store.getSnapshot()
    store.patch('zzz', { status: 'done' }) // missing id
    check('patch missing id → no new ref', store.getSnapshot() === beforeMissing)

    store.patch('a', (prev) => ({ bytesUploaded: prev.bytesUploaded + 10 }))
    check('updater patch', store.getSnapshot().byId['a']?.bytesUploaded === 60)

    store.remove('a')
    check('remove works', !store.getSnapshot().byId['a'] && store.getSnapshot().items.length === 1)

    store.add(mk('c', { status: 'done' }))
    store.add(mk('d', { status: 'failed' }))
    store.clear((it) => it.status === 'done' || it.status === 'failed')
    check('clear predicate', store.getSnapshot().items.map((i) => i.id).join(',') === 'b')

    unsub()
    const nBefore = notified
    store.add(mk('e'))
    check('unsubscribe stops notifications', notified === nBefore)

    store.reset()
    check('reset → empty', store.getSnapshot().items.length === 0)
}

// ── selectors / formatters ────────────────────────────────────────────────────
console.log('\nselectors + formatters')
{
    const target: UploadTarget = { kind: 'task', taskId: 't1' }
    const mk = (over: Partial<UploadItem>): UploadItem => ({
        id: Math.random().toString(36),
        name: 'f.mp4',
        sizeBytes: 1000,
        kind: 'VIDEO',
        status: 'uploading',
        pausedReason: null,
        bytesUploaded: 0,
        speedBps: null,
        error: null,
        errorCode: null,
        targetLabel: 'x',
        target,
        uploadSessionId: null,
        versionId: null,
        assetId: null,
        versionNumber: null,
        folderPath: null,
        createdNewAsset: null,
        version: null,
        serverStatus: null,
        createdAt: 0,
        updatedAt: 0,
        ...over,
    })

    const items = [
        mk({ status: 'uploading', bytesUploaded: 500, sizeBytes: 1000 }),
        mk({ status: 'done', bytesUploaded: 1000, sizeBytes: 1000 }),
        mk({ status: 'failed' }),
        mk({ status: 'queued', bytesUploaded: 0, sizeBytes: 1000 }),
    ]
    const agg = aggregateProgress(items)
    check('aggregate active count', agg.active === 1, String(agg.active))
    check('aggregate done/failed counts', agg.done === 1 && agg.failed === 1)
    check('aggregate percent (500/2000=25)', agg.percent === 25, String(agg.percent))
    check('aggregate excludes done from bar', agg.totalBytes === 2000, String(agg.totalBytes))

    check('isActiveStatus', isActiveStatus('uploading') && isActiveStatus('processing') && !isActiveStatus('queued'))
    check(
        'hasBlockingUploads (uploading)',
        hasBlockingUploads([mk({ status: 'uploading' })]) && !hasBlockingUploads([mk({ status: 'processing' })]),
    )

    const eta = etaSeconds(mk({ status: 'uploading', bytesUploaded: 500, sizeBytes: 1500, speedBps: 100 }))
    check('etaSeconds = remaining/speed', eta === 10, String(eta))
    check('etaSeconds null when no speed', etaSeconds(mk({ status: 'uploading', speedBps: null })) === null)
    check('etaSeconds null when not uploading', etaSeconds(mk({ status: 'processing', speedBps: 100 })) === null)

    check('formatBytes < 1KB', formatBytes(512) === '512 B')
    check('formatBytes MB', formatBytes(5 * MB) === '5.0 MB', formatBytes(5 * MB))
    check('formatBytes GB', formatBytes(2 * GB) === '2.0 GB', formatBytes(2 * GB))
    check('formatDuration secs', formatDuration(45) === '45s')
    check('formatDuration mins', formatDuration(125) === '2m 05s', formatDuration(125))
    check('formatDuration hours', formatDuration(3900) === '1h 05m', formatDuration(3900))
}

console.log(`\nRESULT: ${ok} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
