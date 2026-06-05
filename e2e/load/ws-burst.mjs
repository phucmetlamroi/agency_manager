#!/usr/bin/env node
/**
 * [Playbook P7.1 — lightweight k6 substitute]
 *
 * Opens N concurrent WebSocket connections, measures connect latency, reports
 * success rate + p50 + p95. Default target: `ws://localhost:3000` (handshakes
 * against the Next.js dev server — useful even without a real Supabase WS).
 *
 * Usage:  node e2e/load/ws-burst.mjs --conns 100 --url ws://localhost:3000
 */
import WebSocket from 'ws'
import { performance } from 'node:perf_hooks'

function arg(name, def) {
    const i = process.argv.indexOf(name)
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def
}

const CONNS = parseInt(arg('--conns', '100'), 10)
const URL = arg('--url', 'ws://localhost:3000')

const results = await Promise.all(
    Array.from({ length: CONNS }, () => new Promise((resolve) => {
        const t0 = performance.now()
        let ws
        try { ws = new WebSocket(URL) } catch (e) { return resolve({ ok: false, ms: 0, err: String(e) }) }
        const tmr = setTimeout(() => { try { ws.close() } catch {}; resolve({ ok: false, ms: 5000, err: 'timeout' }) }, 5000)
        ws.on('open', () => {
            const ms = performance.now() - t0
            clearTimeout(tmr)
            try { ws.close() } catch {}
            resolve({ ok: true, ms })
        })
        ws.on('error', (e) => {
            const ms = performance.now() - t0
            clearTimeout(tmr)
            resolve({ ok: false, ms, err: String(e?.message ?? e) })
        })
    })),
)

const ok = results.filter((r) => r.ok)
const failed = results.filter((r) => !r.ok)
const times = ok.map((r) => r.ms).sort((a, b) => a - b)
const p50 = times[Math.floor(times.length * 0.5)] ?? 0
const p95 = times[Math.floor(times.length * 0.95)] ?? 0

const successRate = (ok.length / results.length) * 100

console.log(`\n[ws-burst] target: ${URL}`)
console.log(`  conns:     ${CONNS}`)
console.log(`  ok:        ${ok.length} (${successRate.toFixed(1)}%)`)
console.log(`  failed:    ${failed.length}`)
console.log(`  p50 connect: ${p50.toFixed(0)} ms`)
console.log(`  p95 connect: ${p95.toFixed(0)} ms`)
console.log(`  benchmark:   p95 < 500 ms target (Discord-class single-node)`)
if (failed.length > 0) {
    const sample = failed.slice(0, 3).map((r) => r.err).join(', ')
    console.log(`  failure sample: ${sample}`)
}

// Exit code: 0 if at least 99% succeeded AND p95 < 500ms.
const ok99 = successRate >= 99
const fast = p95 < 500
process.exit(ok99 && fast ? 0 : 1)
