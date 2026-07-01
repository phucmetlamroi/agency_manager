/**
 * [Video Review] One-shot Cloudflare Stream provisioning.
 *
 * PREREQUISITE — put these two in .env yourself first (from the Cloudflare
 * dashboard; the API token needs Account → Stream → Edit):
 *     CLOUDFLARE_ACCOUNT_ID=...
 *     CLOUDFLARE_STREAM_API_TOKEN=...
 *
 * Then run:
 *     npx tsx scripts/setup-cloudflare-stream.ts https://your-prod-domain.com
 *
 * It (1) creates a signing key (for signed playback), (2) registers the
 * "video ready" webhook at <domain>/api/integrations/stream-webhook, and
 * appends the resulting secrets to .env. Copy ALL the CLOUDFLARE_* vars into
 * Vercel afterwards. Idempotent-ish: it refuses to overwrite keys already in
 * .env (delete them first to re-provision).
 *
 * NOTE: CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN is NOT auto-derivable from the API;
 * grab it from the dashboard (any video → "Embed" shows
 * customer-<code>.cloudflarestream.com) and add it to .env manually.
 */

import { readFileSync, appendFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ENV_PATH = resolve(process.cwd(), '.env')

function readEnv(): Record<string, string> {
    const out: Record<string, string> = {}
    let raw = ''
    try { raw = readFileSync(ENV_PATH, 'utf8') } catch { return out }
    for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
    return out
}

async function main() {
    const appUrl = process.argv[2] || process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl || !/^https?:\/\//.test(appUrl)) {
        console.error('Usage: npx tsx scripts/setup-cloudflare-stream.ts https://your-prod-domain.com')
        process.exit(1)
    }
    const env = readEnv()
    const accountId = env.CLOUDFLARE_ACCOUNT_ID
    const apiToken = env.CLOUDFLARE_STREAM_API_TOKEN
    if (!accountId || !apiToken) {
        console.error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_STREAM_API_TOKEN in .env — add them first.')
        process.exit(1)
    }
    const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`
    const headers = { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' }
    const toAppend: string[] = []

    // 1) Signing key --------------------------------------------------------
    if (env.CLOUDFLARE_STREAM_KEY_ID && env.CLOUDFLARE_STREAM_KEY_PEM) {
        console.log('• Signing key already in .env — skipping.')
    } else {
        console.log('• Creating Stream signing key…')
        const r = await fetch(`${base}/keys`, { method: 'POST', headers })
        const j: any = await r.json().catch(() => null)
        if (!r.ok || !j?.success) { console.error('  failed:', JSON.stringify(j?.errors ?? j)); process.exit(1) }
        toAppend.push(`CLOUDFLARE_STREAM_KEY_ID=${j.result.id}`)
        toAppend.push(`CLOUDFLARE_STREAM_KEY_PEM=${j.result.pem}`) // already base64 of the PKCS8 PEM
        console.log(`  ✓ key ${j.result.id}`)
    }

    // 2) Webhook ------------------------------------------------------------
    if (env.CLOUDFLARE_STREAM_WEBHOOK_SECRET) {
        console.log('• Webhook secret already in .env — skipping webhook setup.')
    } else {
        const notificationUrl = `${appUrl.replace(/\/$/, '')}/api/integrations/stream-webhook`
        console.log(`• Registering webhook → ${notificationUrl}`)
        const r = await fetch(`${base}/webhook`, { method: 'PUT', headers, body: JSON.stringify({ notificationUrl }) })
        const j: any = await r.json().catch(() => null)
        if (!r.ok || !j?.success) { console.error('  failed:', JSON.stringify(j?.errors ?? j)); process.exit(1) }
        toAppend.push(`CLOUDFLARE_STREAM_WEBHOOK_SECRET=${j.result.secret}`)
        console.log('  ✓ webhook registered')
    }

    if (toAppend.length) {
        appendFileSync(ENV_PATH, `\n# [Video Review] Cloudflare Stream (auto-provisioned)\n${toAppend.join('\n')}\n`)
        console.log(`\nAppended ${toAppend.length} var(s) to .env.`)
    }
    console.log('\nStill TODO manually in .env: CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN=customer-<code>.cloudflarestream.com')
    console.log('Then copy every CLOUDFLARE_* var into Vercel → Project → Settings → Environment Variables.')
}

main().catch((e) => { console.error(e); process.exit(1) })
