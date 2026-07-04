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

// Full "Khách / Brand · Video – Tên" (middot separator; en-dash stays in the video)
eq('client / brand · video',
    parseVideoTitle('Michael / NPB · Bathroom 1 – Structure', 'Fallback'),
    { client: 'Michael', brand: 'NPB', video: 'Bathroom 1 – Structure' })

// No brand, middot separator
eq('client · video',
    parseVideoTitle('Michael · Kitchen Reveal', 'Fallback'),
    { client: 'Michael', brand: null, video: 'Kitchen Reveal' })

// No separator → fallback client + whole title as video
eq('no separator → fallback',
    parseVideoTitle('Just A Plain Title', 'Acme Co'),
    { client: 'Acme Co', brand: null, video: 'Just A Plain Title' })

// Empty title → fallback + 'Video'
eq('empty title', parseVideoTitle('', 'Acme Co'), { client: 'Acme Co', brand: null, video: 'Video' })

// Empty fallback → 'Khách'
eq('empty fallback', parseVideoTitle('', ''), { client: 'Khách', brand: null, video: 'Video' })

// Hyphen separator (spec allows [·\-])
eq('hyphen separator',
    parseVideoTitle('Michael - Kitchen', 'Fallback'),
    { client: 'Michael', brand: null, video: 'Kitchen' })

console.log(`\nRESULT: ${ok} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
