import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

// Chạy module TypeScript thật (không mock gì — nó không import gì cả).
function loadModule(path) {
    const filename = new URL(`../../${path}`, import.meta.url)
    const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    })
    const exports = {}
    runInNewContext(outputText, { exports, Date }, { filename: filename.pathname })
    return exports
}

const { isMaintenanceNoticeActive, MAINTENANCE_NOTICE_END } = loadModule('src/lib/maintenance-notice.ts')
const at = iso => Date.parse(iso)

test('mốc kết thúc là 3:00 sáng 01/11/2026 giờ Việt Nam (= 20:00 UTC ngày 31/10)', () => {
    assert.equal(at(MAINTENANCE_NOTICE_END), at('2026-10-31T20:00:00Z'))
})

test('hiện ngay từ bây giờ và suốt khung 22:00 → 3:00', () => {
    assert.equal(isMaintenanceNoticeActive(at('2026-10-31T09:00:00+07:00')), true)
    assert.equal(isMaintenanceNoticeActive(at('2026-10-31T22:00:00+07:00')), true)
    assert.equal(isMaintenanceNoticeActive(at('2026-11-01T02:59:59+07:00')), true)
})

test('tự ẩn từ đúng 3:00 sáng 01/11', () => {
    assert.equal(isMaintenanceNoticeActive(at('2026-11-01T03:00:00+07:00')), false)
    assert.equal(isMaintenanceNoticeActive(at('2026-11-02T10:00:00+07:00')), false)
})
