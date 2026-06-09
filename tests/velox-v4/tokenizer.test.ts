/**
 * [Velox v4 — Tokenizer tests]
 *
 * Run with `npx tsx tests/velox-v4/tokenizer.test.ts` (no jest).
 * Lightweight assertions — print FAIL/PASS per case, exit 1 on any failure.
 */

import { tokenizeFilename, RX } from '../../src/lib/velox/v4-tokenizer'

let pass = 0
let fail = 0

function ok(name: string, cond: boolean, detail?: string) {
    if (cond) {
        pass++
        console.log(`  ✓ ${name}`)
    } else {
        fail++
        console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
    }
}

console.log('\n=== tokenizer.test.ts ===')

// CRITICAL: duration vs index collision (§3.5 warning)
{
    const t = tokenizeFilename('Body 2 20 seconds.mp4')
    ok('duration extracted from "Body 2 20 seconds"',
        t.modifiers.durationSec === 20,
        `got ${t.modifiers.durationSec}`)
    const idx = t.normalized.match(RX.TRAIL_INDEX)?.[1]
    ok('index = 2 (NOT 20) after duration stripped',
        idx === '2',
        `got "${idx}"`)
}

// CamelCase split
{
    const t = tokenizeFilename('ProblemSolution.mp4')
    ok('camelCase split → "problem solution"',
        t.normalized === 'problem solution',
        `normalized="${t.normalized}"`)
}

// Part extraction
{
    const t = tokenizeFilename('Hook 1 (part 2).mov')
    ok('part stripped, "hook 1" remains',
        t.tokens.join(' ').includes('hook 1') && !t.tokens.join(' ').includes('part'),
        `tokens=[${t.tokens.join(',')}]`)
}

// Audience extraction
{
    const t = tokenizeFilename('A&W Care Ad 1 (Kitchener Homeowners).mp4')
    ok('audience extracted from parens',
        t.modifiers.audience === 'kitchener homeowners',
        `got "${t.modifiers.audience}"`)
}

// Hook letter form
{
    const t = tokenizeFilename('H2 NO Use.mov')
    const m = t.normalized.match(RX.HOOK_LETTER)
    ok('HOOK_LETTER captures index from "H2"',
        m?.[1] === '2',
        `got "${m?.[1]}"`)
    ok('ST_EXCLUDE detects "no use"',
        RX.ST_EXCLUDE.test(t.normalized),
        `normalized="${t.normalized}"`)
}

// CALLOUT
{
    const t = tokenizeFilename('Audience callout 1.mp4')
    ok('CALLOUT regex matches "audience callout"',
        RX.CALLOUT.test(t.normalized),
        `normalized="${t.normalized}"`)
}

// CTA's
{
    const t = tokenizeFilename(`Glenesk CTA's!.mov`)
    ok('CTA regex tolerates punctuation', RX.CTA.test(t.normalized))
}

// Raw dump regex — spec §3.5 applies on the basename (extension stripped),
// since the classifier tokenizes ext separately.
{
    const cases: [string, boolean][] = [
        ['Nested Sequence 247.mp4', true],
        ['sequence 12.mp4', true],
        ['DSC0419.MOV', true],
        ['C0017.MP4', true],
        ['12345.mp4', true],         // pure-digit basename
        ['Hook 1.mov', false],
        ['Body.mov', false],
        ['comp 03.mp4', true],
    ]
    for (const [name, expected] of cases) {
        const base = name.replace(/\.[^.]+$/, '')
        const got = RX.RAW_DUMP.test(base)
        ok(`RAW_DUMP "${name}" = ${expected}`, got === expected, `got ${got}`)
    }
}

// Named-angle hook
{
    const t = tokenizeFilename('Glenesk open day hook.mov')
    ok('named-angle hook keeps "open day hook"',
        t.normalized.includes('open day hook'),
        `normalized="${t.normalized}"`)
    ok('HOOK_WORD matches the named hook',
        RX.HOOK_WORD.test(t.normalized))
}

// SCRIPT via .pdf
{
    const t = tokenizeFilename('W&A Care Ad Script.pdf')
    ok('ext extracted as "pdf"', t.ext === 'pdf', `got "${t.ext}"`)
}

// VERSION
{
    const t = tokenizeFilename('Body v2.mp4')
    ok('VERSION extracted = "v2"',
        t.modifiers.version === 'v2',
        `got "${t.modifiers.version}"`)
}

// Status: replacement
{
    const t = tokenizeFilename('H2 Replacement.mov')
    ok('ST_REPLACE matches "replacement"',
        RX.ST_REPLACE.test(t.normalized))
}

// Hook letter w/ leading zero
{
    const t = tokenizeFilename('h03.mp4')
    const m = t.normalized.match(RX.HOOK_LETTER)
    ok('HOOK_LETTER strips leading zero "h03" → 3',
        m?.[1] === '3',
        `got "${m?.[1]}"`)
}

// Hyphen normalization
{
    const t = tokenizeFilename('Hook-1.mov')
    ok('hyphen split keeps "hook" + "1"',
        t.tokens.includes('hook') && t.tokens.includes('1'),
        `tokens=[${t.tokens.join(',')}]`)
}

console.log(`\n=== ${pass} passed · ${fail} failed ===`)
if (fail > 0) process.exit(1)
