/**
 * [review-fixes P1 / FR-03] Folder-scope path-logic unit test.
 *
 * Pins the PURE prefix logic (isPathVisible / isPathMutable / dedupePrefixes) that decides
 * what an editor may SEE vs WRITE. No DB, no env — safe anywhere. The getFolderScope()
 * query (assigned tasks → folders) is DB-backed and covered by manual QA on the Neon test
 * branch; this harness locks the algorithm that turns allowedPrefixes into access decisions.
 *
 * Materialized paths always end with "/" and segments are UUIDs delimited by "/", so a naive
 * startsWith is safe (…/video1/ is NOT a prefix of …/video10/). The cases below assert that.
 *
 * Usage:  npm run test:folder-scope   (or: npx tsx scripts/test-folder-scope.ts)
 */

import { isPathVisible, isPathMutable, dedupePrefixes, type FolderScope } from '../src/lib/review/folder-scope'

let failCount = 0
function check(name: string, pass: boolean, detail = '') {
  if (pass) console.log(`  ✅ ${name}`)
  else { failCount++; console.error(`  ❌ ${name}${detail ? ' — ' + detail : ''}`) }
}

const R = '/root/'
const A = '/root/clientA/'
const V1 = '/root/clientA/video1/'
const V1SUB = '/root/clientA/video1/sub/'
const V10 = '/root/clientA/video10/' // adversarial: shares the "video1" text prefix but is a sibling
const V2 = '/root/clientA/video2/'
const B = '/root/clientB/'

const editor: FolderScope = { unrestricted: false, allowedPrefixes: [V1] }
const admin: FolderScope = { unrestricted: true, allowedPrefixes: [] }
const noAssignment: FolderScope = { unrestricted: false, allowedPrefixes: [] }

console.log('\n[1] VISIBLE — editor may see ancestors, self, descendants of an allowed folder')
check('root ancestor visible', isPathVisible(editor, R))
check('client ancestor visible', isPathVisible(editor, A))
check('allowed folder itself visible', isPathVisible(editor, V1))
check('descendant visible', isPathVisible(editor, V1SUB))

console.log('\n[2] VISIBLE — siblings / unrelated are HIDDEN (incl. text-prefix trap video1 vs video10)')
check('sibling video2 NOT visible', !isPathVisible(editor, V2))
check('sibling video10 NOT visible (trailing-slash guard)', !isPathVisible(editor, V10))
check('sibling clientB NOT visible', !isPathVisible(editor, B))

console.log('\n[3] MUTABLE — only the allowed folder + descendants; ancestors are read-only')
check('allowed folder mutable', isPathMutable(editor, V1))
check('descendant mutable', isPathMutable(editor, V1SUB))
check('client ancestor NOT mutable', !isPathMutable(editor, A))
check('root ancestor NOT mutable', !isPathMutable(editor, R))
check('sibling NOT mutable', !isPathMutable(editor, V2))
check('sibling video10 NOT mutable', !isPathMutable(editor, V10))

console.log('\n[4] ADMIN — unrestricted sees & writes everything')
check('admin visible anywhere', isPathVisible(admin, B))
check('admin mutable anywhere', isPathMutable(admin, B))

console.log('\n[5] NO ASSIGNMENT — empty scope sees & writes nothing')
check('no-assignment sees nothing', !isPathVisible(noAssignment, R))
check('no-assignment writes nothing', !isPathMutable(noAssignment, V1))

console.log('\n[6] MULTI-PREFIX + dedupe')
const multi: FolderScope = { unrestricted: false, allowedPrefixes: [V1, B] }
check('multi: video1 mutable', isPathMutable(multi, V1SUB))
check('multi: clientB mutable', isPathMutable(multi, B + 'videoX/'))
check('multi: clientA video2 still hidden', !isPathVisible(multi, V2))
const deduped = dedupePrefixes([A, V1, V1SUB, B])
check('dedupe keeps only highest ancestors', deduped.length === 2 && deduped.includes(A) && deduped.includes(B), `got [${deduped.join(', ')}]`)
check('dedupe: video1 folded under clientA', !deduped.includes(V1))

console.log(`\nRESULT: ${failCount === 0 ? 'PASS' : 'FAIL'} — ${failCount} failed check(s)\n`)
process.exit(failCount > 0 ? 1 : 0)
