/** Summarise sweep-routes.json into the Phase 3 access matrix + anomaly list. */
import { readFileSync } from 'fs'
import { join } from 'path'

const OUT = process.env.AUDIT_OUT_DIR!
type Row = {
    role: string; roleLabel: string; path: string; group: string; name: string
    status: number | null; finalPath: string; redirected: boolean
    title: string; h1: string; navItems: string[]; buttons: string[]
    consoleErrors: string[]; visibleError: string | null
}
const rows: Row[] = JSON.parse(readFileSync(join(OUT, 'sweep-routes.json'), 'utf8'))
const ROLES = ['owner', 'admin', 'staff', 'guest', 'anon']
const names = [...new Map(rows.map((r) => [r.path, r])).values()]

/** What the user effectively got. */
function verdict(r: Row): string {
    if (r.status === null) return 'LỖI'
    if (r.finalPath === '/login') return 'đăng nhập'
    if (r.redirected) return 'đá về'
    if (r.visibleError === 'ĐỌC TRANG THẤT BẠI') return 'KHÔNG ĐỌC ĐƯỢC'
    if (r.visibleError) return `chặn(${r.visibleError})`
    if (r.status !== 200) return `HTTP${r.status}`
    return 'VÀO ĐƯỢC'
}

console.log('MA TRẬN TRUY CẬP — 26 màn × 5 vai trò (dữ liệu thật, môi trường thật)\n')
console.log('màn hình'.padEnd(28) + ROLES.map((x) => x.padEnd(16)).join(''))
console.log('-'.repeat(28 + 16 * 5))
for (const n of names) {
    const line = ROLES.map((role) => {
        const r = rows.find((x) => x.role === role && x.path === n.path)
        return (r ? verdict(r) : '—').padEnd(16)
    }).join('')
    console.log(n.name.padEnd(28) + line)
}

console.log('\n\nBẤT THƯỜNG CẦN ĐIỀU TRA')
const bad = rows.filter((r) => verdict(r) === 'KHÔNG ĐỌC ĐƯỢC' || verdict(r) === 'LỖI' || (r.status !== null && r.status >= 400))
const byKey = new Map<string, Row[]>()
for (const r of bad) {
    const k = `${r.role}|${verdict(r)}`
    byKey.set(k, [...(byKey.get(k) ?? []), r])
}
for (const [k, list] of byKey) {
    const [role, v] = k.split('|')
    console.log(`\n  ${role} — ${v} (${list.length} màn): ${list.map((x) => x.name).join(', ')}`)
    const errs = [...new Set(list.flatMap((x) => x.consoleErrors))].slice(0, 3)
    if (errs.length) errs.forEach((e) => console.log(`      lỗi trình duyệt: ${e}`))
    console.log(`      HTTP: ${[...new Set(list.map((x) => String(x.status)))].join(', ')} · URL cuối: ${[...new Set(list.map((x) => x.finalPath))].slice(0, 2).join(', ')}`)
}

console.log('\n\nĐIỀU HƯỚNG THẤY ĐƯỢC theo vai trò (trang Bảng điều khiển)')
for (const role of ROLES) {
    const r = rows.find((x) => x.role === role && x.path.endsWith('/dashboard'))
    console.log(`  ${role.padEnd(6)} ${r?.navItems.length ?? 0} mục: ${(r?.navItems ?? []).join(' · ').slice(0, 190)}`)
}

console.log('\n\nSỐ NÚT trên mỗi màn VÀO ĐƯỢC (đo mật độ hành động)')
const okRows = rows.filter((r) => verdict(r) === 'VÀO ĐƯỢC')
const top = okRows.sort((a, b) => b.buttons.length - a.buttons.length).slice(0, 8)
for (const r of top) console.log(`  ${r.role.padEnd(6)} ${r.name.padEnd(26)} ${String(r.buttons.length).padStart(3)} nút · tiêu đề="${r.title.slice(0, 40)}" h1="${r.h1.slice(0, 40)}"`)
const noH1 = okRows.filter((r) => !r.h1)
console.log(`\n  Màn VÀO ĐƯỢC nhưng KHÔNG có tiêu đề chính (h1): ${noH1.length}/${okRows.length}`)
if (noH1.length) console.log(`    ${[...new Set(noH1.map((r) => r.name))].join(', ')}`)
