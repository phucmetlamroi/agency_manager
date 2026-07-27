/**
 * [Review module P1.5] Unit-assert parseVideoTitle (pure, no DB/session).
 * Run: npx tsx scripts/probe-review-parse.ts
 */
import { parseVideoTitle } from '../src/lib/review/parse-task-context'

let ok = 0, fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
    const pass = JSON.stringify(got) === JSON.stringify(want);
    (pass ? ok++ : fail++)
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : ` — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`)
}

// NOTE: every expectation carries `matched` — the field was added to ParsedTaskVideo after this
// file was written, so all six cases had been failing on the deep-equal ever since. Fixed here.

// Full "Khách / Brand · Video – Tên" (middot separator; en-dash stays in the video)
eq('client / brand · video',
    parseVideoTitle('Michael / NPB · Bathroom 1 – Structure', 'Fallback'),
    { client: 'Michael', brand: 'NPB', video: 'Bathroom 1 – Structure', matched: true })

// No brand, middot separator
eq('client · video',
    parseVideoTitle('Michael · Kitchen Reveal', 'Fallback'),
    { client: 'Michael', brand: null, video: 'Kitchen Reveal', matched: true })

// No separator → fallback client + whole title as video
eq('no separator → fallback',
    parseVideoTitle('Just A Plain Title', 'Acme Co'),
    { client: 'Acme Co', brand: null, video: 'Just A Plain Title', matched: false })

// Empty title → fallback + 'Video'
eq('empty title', parseVideoTitle('', 'Acme Co'), { client: 'Acme Co', brand: null, video: 'Video', matched: false })

// Empty fallback → 'Khách'
eq('empty fallback', parseVideoTitle('', ''), { client: 'Khách', brand: null, video: 'Video', matched: false })

// [audit 2026-07-27] A hyphen is NOT a separator any more. It is ordinary punctuation in real
// task titles, and treating it as one minted a bogus client folder ("Michael") while reporting
// matched:true, which suppressed the warning. Now it falls back to the task's real client.
eq('hyphen is NOT a separator',
    parseVideoTitle('Michael - Kitchen', 'Fallback'),
    { client: 'Fallback', brand: null, video: 'Michael - Kitchen', matched: false })

// The case from the owner's own data: "Video 8 - final" must not invent a client called "Video 8".
eq('hyphen in an ordinary title keeps the real client',
    parseVideoTitle('Video 8 - final', 'Dr. Marwan'),
    { client: 'Dr. Marwan', brand: null, video: 'Video 8 - final', matched: false })

console.log(`\nRESULT: ${ok} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
