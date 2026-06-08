/**
 * [Velox v4 — Role Classifier tests]
 * Run: `npx tsx tests/velox-v4/role-classifier.test.ts`
 */

import {
    classifyFile,
    applySiblingCorroboration,
    type CorroborationBucket,
} from '../../src/lib/velox/v4-role-classifier'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail?: string) {
    if (cond) { pass++; console.log(`  ✓ ${name}`) }
    else      { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

console.log('\n=== role-classifier.test.ts ===')

// — Word-level matches → base 0.95
{
    const v = classifyFile('Body.mov')
    ok('Body.mov → BODY, conf=0.95',
        v.role === 'BODY' && v.confidence === 0.95,
        `role=${v.role} conf=${v.confidence}`)
    ok('Body.mov band HIGH', v.band === 'HIGH')
}

// — HOOK_LETTER → base 0.65 (REVIEW band)
{
    const v = classifyFile('H1.mp4')
    ok('H1.mp4 → HOOK, conf=0.65 (positionFactor=1.0 because nothing after)',
        v.role === 'HOOK' && v.confidence === 0.65,
        `role=${v.role} conf=${v.confidence}`)
    ok('H1.mp4 index=1', v.index === 1, `idx=${v.index}`)
    ok('H1.mp4 band REVIEW (0.65 < 0.85)', v.band === 'REVIEW')
}

// — CTA punctuation tolerance
{
    const v = classifyFile(`Glenesk CTA's!.mov`)
    ok('Glenesk CTA\'s! → CTA',
        v.role === 'CTA',
        `role=${v.role}`)
}

// — Callout
{
    const v = classifyFile('Audience callout 1.mp4')
    ok('Audience callout 1 → CALLOUT idx=1',
        v.role === 'CALLOUT' && v.index === 1,
        `role=${v.role} idx=${v.index}`)
}

// — Named-angle hook keeps freeform label
{
    const v = classifyFile('Glenesk open day hook.mov')
    ok('named-angle hook → HOOK with no index',
        v.role === 'HOOK' && v.index === undefined,
        `role=${v.role} idx=${v.index}`)
    ok('label includes "open day"',
        v.label.toLowerCase().includes('open day'),
        `label="${v.label}"`)
}

// — SCRIPT via .pdf
{
    const v = classifyFile('W&A Care Ad Script.pdf')
    ok('W&A Care Script.pdf → SCRIPT',
        v.role === 'SCRIPT',
        `role=${v.role}`)
}

// — CAPTION via .srt
{
    const v = classifyFile('subs.srt')
    ok('subs.srt → CAPTION',
        v.role === 'CAPTION',
        `role=${v.role}`)
}

// — Status detection
{
    const v = classifyFile('H2 NO Use.mov')
    ok('H2 NO Use → EXCLUDED status',
        v.role === 'HOOK' && v.status === 'EXCLUDED' && v.index === 2,
        `role=${v.role} status=${v.status} idx=${v.index}`)
}
{
    const v = classifyFile('H4 Future edits.mov')
    ok('H4 Future edits → PENDING status',
        v.status === 'PENDING' && v.index === 4,
        `status=${v.status} idx=${v.index}`)
}
{
    const v = classifyFile('H2 Replacement.mov')
    ok('H2 Replacement → ACTIVE status (grouper handles SUPERSEDE)',
        v.role === 'HOOK' && v.status === 'ACTIVE' && v.index === 2,
        `role=${v.role} status=${v.status} idx=${v.index}`)
}

// — Compilation flag
{
    const v = classifyFile('LGR Video 1 Hooks.mov')
    ok('"Video 1 Hooks" → HOOK + isCompilation true',
        v.role === 'HOOK' && v.isCompilation === true,
        `role=${v.role} isCompilation=${v.isCompilation}`)
    ok('no index for plural "Hooks"', v.index === undefined, `idx=${v.index}`)
}

// — Duration extracted, role kept
{
    const v = classifyFile('CTA 20 seconds.mp4')
    ok('CTA 20 seconds → CTA',
        v.role === 'CTA',
        `role=${v.role}`)
    ok('duration extracted = 20',
        v.tokenized.modifiers.durationSec === 20,
        `dur=${v.tokenized.modifiers.durationSec}`)
}

// — UNKNOWN fallback
{
    const v = classifyFile('weird-filename.mp4')
    ok('weird-filename → UNKNOWN', v.role === 'UNKNOWN', `role=${v.role}`)
}

// — FINAL fallback via "Video N"
{
    const v = classifyFile('LGR Video 2.mov')
    ok('LGR Video 2 → FINAL fallback (no other role)',
        v.role === 'FINAL',
        `role=${v.role}`)
}

// — Sibling corroboration: H1 alone vs H1 next to Body
{
    const lone: CorroborationBucket = {
        key: 'lone',
        items: [classifyFile('H1.mp4')],
    }
    applySiblingCorroboration([lone])
    ok('H1 alone stays REVIEW (0.65)',
        lone.items[0].band === 'REVIEW' && lone.items[0].confidence === 0.65,
        `conf=${lone.items[0].confidence} band=${lone.items[0].band}`)

    const sibling: CorroborationBucket = {
        key: 'sibling',
        items: [
            classifyFile('H1.mp4'),
            classifyFile('Body.mov'),
            classifyFile('CTA.mp4'),
        ],
    }
    applySiblingCorroboration([sibling])
    const h1 = sibling.items.find(i => i.role === 'HOOK')!
    ok('H1 with Body sibling: confidence boosted 0.65→0.90',
        h1.confidence === 0.9 && h1.band === 'HIGH',
        `conf=${h1.confidence} band=${h1.band}`)
    ok('reasons mention sibling corroboration',
        h1.reasons.some(r => r.includes('sibling corroboration')),
        `reasons=[${h1.reasons.join('; ')}]`)
}

// — Sibling corroboration: only boosts HOOK_LETTER, not word-hooks
{
    const b: CorroborationBucket = {
        key: 'b',
        items: [
            classifyFile('Hook 1.mov'),  // word hook
            classifyFile('Body.mov'),
        ],
    }
    const before = b.items[0].confidence
    applySiblingCorroboration([b])
    ok('Word "Hook 1" NOT boosted (already 0.95)',
        b.items[0].confidence === before,
        `before=${before} after=${b.items[0].confidence}`)
}

// — Multi-bucket independence
{
    const b1: CorroborationBucket = {
        key: 'b1',
        items: [classifyFile('H1.mp4'), classifyFile('Body.mov')],
    }
    const b2: CorroborationBucket = {
        key: 'b2',
        items: [classifyFile('H1.mp4')],
    }
    applySiblingCorroboration([b1, b2])
    const h1b1 = b1.items.find(i => i.role === 'HOOK')!
    const h1b2 = b2.items[0]
    ok('b1.H1 boosted (sibling Body)', h1b1.confidence === 0.9)
    ok('b2.H1 NOT boosted (no sibling)', h1b2.confidence === 0.65)
}

console.log(`\n=== ${pass} passed · ${fail} failed ===`)
if (fail > 0) process.exit(1)
