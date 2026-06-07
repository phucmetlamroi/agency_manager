// Verification script for Client Portal security fixes (M4 sanitize + M5 ranges).
// Run: node scripts/verify-portal-fixes.mjs
//
// Pure logic tests — no DB calls.

import DOMPurify from 'isomorphic-dompurify'

const FEEDBACK_MAX_LEN = 4000
const RATING_FEEDBACK_MAX_LEN = 2000

function sanitizeClientText(raw, maxLen) {
    const stripped = DOMPurify.sanitize(raw, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
    return stripped.trim().slice(0, maxLen)
}

const isValidStar = (n) => Number.isInteger(n) && n >= 1 && n <= 5

let passed = 0, failed = 0
function assert(name, actual, expected) {
    if (actual === expected) {
        console.log('  PASS', name)
        passed++
    } else {
        console.log('  FAIL', name, '\n     got:', JSON.stringify(actual), '\n     exp:', JSON.stringify(expected))
        failed++
    }
}

console.log('\n=== M4 sanitizeClientText ===')
assert('strips <script>', sanitizeClientText('<script>alert(1)</script>OK', 100), 'OK')
assert('strips <img onerror>', sanitizeClientText('<img src=x onerror=alert(1)>hi', 100), 'hi')
assert('strips <style>', sanitizeClientText('<style>body{display:none}</style>visible', 100), 'visible')
assert('preserves newlines', sanitizeClientText('line1\nline2', 100), 'line1\nline2')
assert('preserves unicode', sanitizeClientText('Khách yêu cầu sửa cảnh 0:15 → 0:20', 100), 'Khách yêu cầu sửa cảnh 0:15 → 0:20')
assert('strips iframe', sanitizeClientText('<iframe src="x"></iframe>after', 100), 'after')
assert('cap at maxLen', sanitizeClientText('a'.repeat(10000), 100).length, 100)
assert('trims whitespace', sanitizeClientText('  hello  ', 100), 'hello')
assert('empty stays empty', sanitizeClientText('', 100), '')
assert('only-html stays empty', sanitizeClientText('<script></script>', 100), '')

console.log('\n=== M5 isValidStar (1-5 integer) ===')
assert('5 ok', isValidStar(5), true)
assert('1 ok', isValidStar(1), true)
assert('3 ok', isValidStar(3), true)
assert('0 reject', isValidStar(0), false)
assert('6 reject', isValidStar(6), false)
assert('-1 reject', isValidStar(-1), false)
assert('999 reject', isValidStar(999), false)
assert('NaN reject', isValidStar(NaN), false)
assert('Infinity reject', isValidStar(Infinity), false)
assert('2.5 reject (non-integer)', isValidStar(2.5), false)
assert('"3" reject (string)', isValidStar('3'), false)
assert('null reject', isValidStar(null), false)
assert('undefined reject', isValidStar(undefined), false)

console.log('\n=== M9 name match skip when nickname empty ===')
const names1 = ['realuser', ''].filter(n => n.length > 0)
const names2 = ['', ''].filter(n => n.length > 0)
const names3 = ['user', 'nick'].filter(n => n.length > 0)
assert('username present, nickname empty → 1 name', names1.length, 1)
assert('both empty → 0 names (skip)', names2.length, 0)
assert('both present → 2 names', names3.length, 2)

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
