// [Review module P2.7] Headless DoD invariants for the Team browser (P2.1–P2.6).
// Static source checks that need NO DB/session (the routes are session-gated, so
// e2e is a manual checklist). Catches the two regressions that matter most —
// finance leakage into review DTOs, and context-menu scope creep — plus route/page
// wiring and the P2.5 privilege-escalation fix. Run: `npx tsx scripts/probe-review-p2-dod.ts`.

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const ROOT = process.cwd()
let pass = 0
let fail = 0
const rows: { ok: boolean; name: string; detail?: string }[] = []
function check(name: string, ok: boolean, detail?: string) {
    rows.push({ ok, name, detail })
    ok ? pass++ : fail++
}
/** Strip block + line comments so doc text ("no jobPriceUSD leak", the excluded-items
 *  list) isn't mistaken for real code/labels. The `[^:]` guard leaves `://` in URLs alone. */
function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}
function read(rel: string): string {
    return stripComments(readFileSync(join(ROOT, rel), 'utf8'))
}
/** Raw (comments intact) — for structural counts where comments don't interfere. */
function readRaw(rel: string): string {
    return readFileSync(join(ROOT, rel), 'utf8')
}

// ── 1. Finance-leak discipline: review serialization must never carry agency finance fields.
const FINANCE = ['jobPriceUSD', 'priceUSD', 'jobPrice', 'wage', 'netSalary', 'salary', 'profit', 'bonusAmount', 'commission']
for (const f of ['src/lib/review/dto.ts', 'src/lib/review/task-assets.ts', 'src/lib/review/folders.ts']) {
    const src = read(f)
    const hits = FINANCE.filter((t) => new RegExp(`\\b${t}\\b`).test(src))
    check(`no finance fields in ${f}`, hits.length === 0, hits.join(', '))
}

// ── 2. Context menu scope (PHAM-VI-LOAI-BO Nhóm 1): excluded items must NEVER appear; counts exact.
const cm = read('src/components/review/TeamContextMenu.tsx')
const EXCLUDED = ['Manage Access', 'Make Restricted', 'Open on Desktop', 'Compare Versions', 'Generate Transcripts', 'Upload Caption']
for (const e of EXCLUDED) check(`context menu excludes "${e}"`, !cm.includes(e))

function bodyOf(src: string, fn: string): string {
    const start = src.indexOf(`export function ${fn}`)
    if (start < 0) return ''
    const after = src.indexOf('export function ', start + 1)
    return after < 0 ? src.slice(start) : src.slice(start, after)
}
const countItems = (body: string): number => (body.match(/<Item\b/g) || []).length
check('FolderMenuContent = 9 items (FR-B07)', countItems(bodyOf(cm, 'FolderMenuContent')) === 9, String(countItems(bodyOf(cm, 'FolderMenuContent'))))
check('AssetMenuContent = 10 items (FR-B08)', countItems(bodyOf(cm, 'AssetMenuContent')) === 10, String(countItems(bodyOf(cm, 'AssetMenuContent'))))
check('CanvasMenuContent = 3 items (FR-B02)', countItems(bodyOf(cm, 'CanvasMenuContent')) === 3, String(countItems(bodyOf(cm, 'CanvasMenuContent'))))

// ── 3. Route + page wiring exists.
const routes = [
    'src/app/api/review/items/copy/route.ts',
    'src/app/api/review/items/move/route.ts',
    'src/app/api/review/items/delete/route.ts',
    'src/app/api/review/assets/[id]/route.ts',
    'src/app/api/review/folders/[id]/manifest/route.ts',
    'src/app/api/review/trash/route.ts',
    'src/app/api/review/trash/restore/route.ts',
]
for (const r of routes) check(`route exists: ${r}`, existsSync(join(ROOT, r)))
const pages = [
    'src/app/[workspaceId]/admin/team/page.tsx',
    'src/app/[workspaceId]/admin/team/folder/[folderId]/page.tsx',
    'src/app/[workspaceId]/admin/team/trash/page.tsx',
]
for (const p of pages) check(`page exists: ${p}`, existsSync(join(ROOT, p)))

// ── 4. P2.5 privilege-escalation fix: isAdmin is WORKSPACE-scoped, no-workspace branch fails closed.
const access = read('src/lib/review/access.ts')
check(
    'access.ts isAdmin derives from workspaceRole/profileRole (not global role)',
    /auth\.workspaceRole === 'OWNER'/.test(access) && /auth\.profileRole === 'OWNER'/.test(access),
)
check('access.ts no-workspace branch → isAdmin: false', /isAdmin: false/.test(access))

// ── 5. FR-B07 server-side folder-delete permission enforced in deleteItems.
const folders = read('src/lib/review/folders.ts')
check(
    'deleteItems enforces folder-creator permission (!access.isAdmin → createdById guard)',
    /if \(!access\.isAdmin\)/.test(folders) && /createdById !== access\.userId/.test(folders),
)
// copy-on-reference: the copy must leave muxAssetId null (schema @unique) — never share it.
check('copyItems leaves muxAssetId null on the copy', /muxAssetId: null/.test(folders))

// ── report ──
console.log('── P2 DoD static invariants ──')
for (const r of rows) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${!r.ok && r.detail ? `  → ${r.detail}` : ''}`)
console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
