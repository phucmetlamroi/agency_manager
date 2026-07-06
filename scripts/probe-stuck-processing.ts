/**
 * READ-ONLY diagnostic: why is a review video stuck at "Phiên bản đang được xử lý…"?
 *
 * Walks the pipeline evidence chain on the LIVE DB (no writes):
 *   1. Recent ReviewVersions (status / muxAssetId / timestamps / error).
 *   2. UploadSessions for those versions (did complete land?).
 *   3. WebhookEvent ledger (did ANY Mux webhook ever arrive? unprocessed rows?).
 *   4. ReviewActivity trail for the stuck versions.
 *   5. If a version has muxAssetId → ask Mux directly what the asset status is.
 *   6. If NO version ever got muxAssetId → the Inngest create-asset function never
 *      ran → points at Inngest sync/env, not Mux.
 *
 * Run: npx tsx scripts/probe-stuck-processing.ts
 */

import { readFileSync } from 'fs'
import { join } from 'path'

// Load .env (repo pattern — no dotenv dep).
try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8')
    for (const line of env.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
} catch {
    /* ignore */
}

async function main() {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()

    console.log('=== Stuck-processing diagnostic (READ-ONLY) ===\n')
    const dbHost = (process.env.DATABASE_URL ?? '').match(/@([^/]+)\//)?.[1] ?? '?'
    console.log(`DB host: ${dbHost}\n`)

    // 1. Recent versions (7 days)
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000)
    const versions = await prisma.reviewVersion.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
            id: true,
            fileName: true,
            mediaKind: true,
            pipelineStatus: true,
            muxAssetId: true,
            muxPlaybackId: true,
            errorMessage: true,
            sizeBytes: true,
            createdAt: true,
            updatedAt: true,
            readyAt: true,
        },
    })
    console.log(`[1] ReviewVersions last 7d: ${versions.length}`)
    for (const v of versions) {
        const mb = (Number(v.sizeBytes) / 1024 / 1024).toFixed(1)
        console.log(
            `  ${v.pipelineStatus.padEnd(10)} ${v.mediaKind.padEnd(5)} ${mb.padStart(7)}MB  mux=${v.muxAssetId ? 'SET' : '—'}  play=${v.muxPlaybackId ? 'SET' : '—'}  created=${v.createdAt.toISOString()}  updated=${v.updatedAt.toISOString()}${v.errorMessage ? `  ERR="${v.errorMessage}"` : ''}`,
        )
        console.log(`      ${v.id}  ${v.fileName}`)
    }

    const stuck = versions.filter(
        (v) => v.pipelineStatus === 'PROCESSING' || v.pipelineStatus === 'UPLOADED',
    )
    console.log(`\n  → stuck (PROCESSING/UPLOADED): ${stuck.length}`)

    // 2. Upload sessions for the stuck ones
    if (stuck.length) {
        const sessions = await prisma.uploadSession.findMany({
            where: { versionId: { in: stuck.map((v) => v.id) } },
            select: { versionId: true, completedAt: true, abortedAt: true, expiresAt: true, createdAt: true },
        })
        console.log(`\n[2] UploadSessions for stuck versions: ${sessions.length}`)
        for (const s of sessions) {
            console.log(
                `  version=${s.versionId}  completed=${s.completedAt?.toISOString() ?? '—'}  aborted=${s.abortedAt?.toISOString() ?? '—'}`,
            )
        }
    }

    // 3. Webhook ledger — did Mux EVER call us?
    const totalWebhooks = await prisma.webhookEvent.count()
    const recentWebhooks = await prisma.webhookEvent.findMany({
        where: { receivedAt: { gte: since } },
        orderBy: { receivedAt: 'desc' },
        take: 20,
        select: { id: true, type: true, receivedAt: true, processedAt: true },
    })
    const unprocessed = await prisma.webhookEvent.count({ where: { processedAt: null } })
    console.log(`\n[3] WebhookEvent ledger: total=${totalWebhooks}, last-7d=${recentWebhooks.length}, UNPROCESSED=${unprocessed}`)
    for (const w of recentWebhooks) {
        console.log(`  ${w.type.padEnd(24)} received=${w.receivedAt.toISOString()}  processed=${w.processedAt?.toISOString() ?? 'NULL ← chưa consume'}`)
    }

    // 4. Activity trail (7d)
    const acts = await prisma.reviewActivity.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: { type: true, versionId: true, createdAt: true },
    })
    console.log(`\n[4] ReviewActivity last 7d: ${acts.length}`)
    for (const a of acts) console.log(`  ${a.type.padEnd(22)} v=${a.versionId ?? '—'}  ${a.createdAt.toISOString()}`)

    // 5. Ask Mux directly about any stuck version that HAS a mux asset — and also
    //    list Mux's most recent assets to see whether ANY asset was ever created.
    const tokenId = process.env.MUX_TOKEN_ID
    const tokenSecret = process.env.MUX_TOKEN_SECRET
    if (tokenId && tokenSecret) {
        const auth = 'Basic ' + Buffer.from(`${tokenId}:${tokenSecret}`).toString('base64')
        for (const v of stuck.filter((x) => x.muxAssetId)) {
            const res = await fetch(`https://api.mux.com/video/v1/assets/${v.muxAssetId}`, {
                headers: { Authorization: auth },
            })
            const body = (await res.json()) as { data?: { status?: string; errors?: unknown } }
            console.log(`\n[5] Mux asset for version ${v.id}: http=${res.status} status=${body.data?.status ?? '?'}`)
            if (body.data?.errors) console.log(`    errors: ${JSON.stringify(body.data.errors)}`)
        }
        const list = await fetch('https://api.mux.com/video/v1/assets?limit=10', { headers: { Authorization: auth } })
        const listBody = (await list.json()) as { data?: { id: string; status: string; created_at: string; passthrough?: string }[] }
        console.log(`\n[5b] Mux 10 assets mới nhất (toàn account): ${listBody.data?.length ?? 0}`)
        for (const a of listBody.data ?? []) {
            console.log(`  ${a.id}  status=${a.status}  created=${new Date(Number(a.created_at) * 1000).toISOString()}  passthrough=${a.passthrough ?? '—'}`)
        }
    } else {
        console.log('\n[5] SKIP Mux API — thiếu MUX_TOKEN_ID/SECRET trong .env local')
    }

    await prisma.$disconnect()
    console.log('\n=== DONE (không ghi gì vào DB) ===')
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
