/**
 * [Review module P0 — DoD] Verify provisioning credentials ACTUALLY work.
 * Read-only against Mux/Inngest; R2 gets one 1MB probe object (deleted after).
 *
 *   1. All env vars present (.env).
 *   2. MUX_SIGNING_PRIVATE_KEY base64 → parseable RSA private key.
 *   3. Mux Access Token valid (GET /video/v1/assets?limit=1).
 *   4. MUX_SIGNING_KEY_ID exists on the account (GET /system/v1/signing-keys/{id}).
 *   5. R2: bucket reachable (HeadBucket), CORS has ExposeHeaders ETag,
 *      presigned PUT 1MB → ETag readable from response, presigned GET round-trips,
 *      DeleteObject cleanup.  (= DoD item "presign PUT + read ETag")
 *   6. Inngest event key accepted by inn.gs (sends one no-op event no function
 *      subscribes to); signing key format sanity.
 *
 * Run: npx tsx scripts/probe-review-provisioning.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import crypto from 'crypto'
import {
    S3Client, HeadBucketCommand, GetBucketCorsCommand,
    PutObjectCommand, GetObjectCommand, DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Load .env (repo pattern — no dotenv dep).
try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8')
    for (const line of env.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
} catch { /* ignore */ }

let ok = 0, fail = 0
const check = (name: string, cond: boolean, extra = '') => {
    (cond ? ok++ : fail++)
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`)
}

async function main() {
    console.log('=== Review module provisioning probe ===\n')

    // ── 1. Presence ──────────────────────────────────────────────
    console.log('[1] Env vars')
    const REQUIRED = [
        'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET',
        'MUX_TOKEN_ID', 'MUX_TOKEN_SECRET', 'MUX_WEBHOOK_SECRET',
        'MUX_SIGNING_KEY_ID', 'MUX_SIGNING_PRIVATE_KEY',
        'INNGEST_EVENT_KEY', 'INNGEST_SIGNING_KEY', 'REVIEW_COOKIE_SECRET',
    ]
    for (const k of REQUIRED) check(`${k} set`, Boolean(process.env[k]))

    // ── 2. Mux signing private key parses ────────────────────────
    console.log('\n[2] Mux signing private key')
    try {
        const pem = Buffer.from(process.env.MUX_SIGNING_PRIVATE_KEY || '', 'base64').toString('utf8')
        check('base64 decodes to PEM', pem.includes('BEGIN RSA PRIVATE KEY') || pem.includes('BEGIN PRIVATE KEY'))
        const keyObj = crypto.createPrivateKey(pem)
        const bits = (keyObj.asymmetricKeyDetails?.modulusLength ?? 0)
        check('parses as RSA private key', keyObj.asymmetricKeyType === 'rsa', `${bits}-bit`)
        // Sign/verify round-trip = key is usable for RS256 playback JWTs (P3).
        const sig = crypto.sign('sha256', Buffer.from('probe'), keyObj)
        const pub = crypto.createPublicKey(keyObj)
        check('RS256 sign/verify round-trip', crypto.verify('sha256', Buffer.from('probe'), pub, sig))
    } catch (e) {
        check('private key parse', false, (e as Error).message)
    }

    // ── 3+4. Mux API ──────────────────────────────────────────────
    console.log('\n[3] Mux Access Token')
    const muxAuth = 'Basic ' + Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString('base64')
    try {
        const r = await fetch('https://api.mux.com/video/v1/assets?limit=1', { headers: { Authorization: muxAuth } })
        check('GET /video/v1/assets authorized', r.ok, `HTTP ${r.status}`)
    } catch (e) { check('Mux API reachable', false, (e as Error).message) }

    console.log('\n[4] Mux signing key id')
    try {
        const r = await fetch(`https://api.mux.com/system/v1/signing-keys/${process.env.MUX_SIGNING_KEY_ID}`, { headers: { Authorization: muxAuth } })
        check('signing key exists on account', r.ok, `HTTP ${r.status}`)
    } catch (e) { check('signing key lookup', false, (e as Error).message) }

    // ── 5. R2 ─────────────────────────────────────────────────────
    console.log('\n[5] Cloudflare R2')
    const bucket = process.env.R2_BUCKET || 'hustly-review'
    const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
        },
    })
    let bucketOk = false
    try {
        await s3.send(new HeadBucketCommand({ Bucket: bucket }))
        bucketOk = true
        check(`bucket "${bucket}" exists + credentials valid`, true)
    } catch (e) {
        const err = e as { name?: string; $metadata?: { httpStatusCode?: number } }
        check(`bucket "${bucket}" exists + credentials valid`, false, `${err.name} (HTTP ${err.$metadata?.httpStatusCode})`)
    }

    if (bucketOk) {
        try {
            const cors = await s3.send(new GetBucketCorsCommand({ Bucket: bucket }))
            const rules = cors.CORSRules || []
            const hasEtag = rules.some(r => (r.ExposeHeaders || []).some(h => h.toLowerCase() === 'etag'))
            const hasPut = rules.some(r => (r.AllowedMethods || []).includes('PUT'))
            const origins = rules.flatMap(r => r.AllowedOrigins || [])
            check('CORS rule present', rules.length > 0, `${rules.length} rule(s), origins: ${origins.join(', ') || '(none)'}`)
            check('CORS ExposeHeaders includes ETag (BẮT BUỘC cho multipart)', hasEtag)
            check('CORS AllowedMethods includes PUT', hasPut)
        } catch (e) {
            const err = e as { name?: string }
            check('CORS configured', false, `${err.name} — chưa dán CORS JSON vào bucket`)
        }

        // Presigned PUT 1MB → read ETag → presigned GET → delete (DoD item).
        const key = `_probe/p0-dod-${crypto.randomBytes(6).toString('hex')}.bin`
        const body = crypto.randomBytes(1024 * 1024)
        try {
            const putUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 300 })
            const putRes = await fetch(putUrl, { method: 'PUT', body })
            const etag = putRes.headers.get('etag')
            check('presigned PUT 1MB succeeds', putRes.ok, `HTTP ${putRes.status}`)
            check('ETag readable from PUT response', Boolean(etag), etag || 'missing')
            const md5 = crypto.createHash('md5').update(body).digest('hex')
            check('ETag = MD5 of body (single-part)', etag === `"${md5}"`)

            const getUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 300 })
            const getRes = await fetch(getUrl)
            const got = Buffer.from(await getRes.arrayBuffer())
            check('presigned GET round-trips 1MB', getRes.ok && got.length === body.length && got.equals(body))

            await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
            console.log(`  (cleanup: deleted ${key})`)
        } catch (e) {
            check('presign PUT/GET flow', false, (e as Error).message)
        }
    }

    // ── 6. Inngest ────────────────────────────────────────────────
    console.log('\n[6] Inngest')
    check('INNGEST_SIGNING_KEY format (signkey-prod-<64 hex>)',
        /^signkey-(prod|test)-[0-9a-f]{64}$/.test(process.env.INNGEST_SIGNING_KEY || ''))
    try {
        // No function subscribes to this event name — harmless key validation.
        const r = await fetch(`https://inn.gs/e/${process.env.INNGEST_EVENT_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'review/provision.check', data: { at: new Date().toISOString() } }),
        })
        const bodyJson = await r.json().catch(() => null) as { ids?: string[] } | null
        check('event key accepted by inn.gs', r.ok && Boolean(bodyJson?.ids?.length), `HTTP ${r.status}`)
    } catch (e) { check('Inngest event send', false, (e as Error).message) }

    console.log(`\nRESULT: ${ok} passed, ${fail} failed`)
    process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
