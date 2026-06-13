/* Pure formatting + mapping helpers for the Calm-Dark client portal.
   Currency stays the app's real USD (NOT the design mock's GBP). */

export function fmtMoney(n: number | string | null | undefined): string {
    const v = Number(n ?? 0)
    return '$' + (isNaN(v) ? 0 : v).toLocaleString('en-US')
}

export function fmtDate(iso: string | Date | null | undefined, withYear = true): string {
    if (!iso) return '—'
    const d = iso instanceof Date ? iso : new Date(iso)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
}

export function daysUntil(iso: string | Date): number {
    const d = iso instanceof Date ? iso : new Date(iso)
    const today = new Date()
    const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
    const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
    return Math.round((a - b) / 86400000)
}

export function relDeadline(iso: string | Date | null | undefined): { text: string; urgent: boolean } {
    if (!iso) return { text: '', urgent: false }
    const n = daysUntil(iso)
    if (n < 0) return { text: 'Overdue', urgent: true }
    if (n === 0) return { text: 'Due today', urgent: true }
    if (n === 1) return { text: 'Due tomorrow', urgent: true }
    if (n <= 7) return { text: `Due in ${n} days`, urgent: false }
    return { text: 'Due ' + fmtDate(iso, false), urgent: false }
}

/* Deterministic earthy/warm tint for a sub-brand avatar tile (Atelier palette). */
const TINTS = ['#E0A458', '#E0875B', '#84B98C', '#D2735B', '#D8B45E', '#D98AA0', '#B0A857', '#C8855A', '#6FAE9E']
export function brandTint(key: string | number): string {
    const s = String(key)
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
    return TINTS[h % TINTS.length]
}

export function initials(name: string): string {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/* Invoice status enum (DRAFT/SENT/PAID/OVERDUE/VOID) → client ledger label. */
export type InvoiceLedgerStatus = 'Paid' | 'Due' | 'Overdue' | 'Void'
export function mapInvoiceStatus(raw: string): InvoiceLedgerStatus {
    switch (raw) {
        case 'PAID': return 'Paid'
        case 'OVERDUE': return 'Overdue'
        case 'VOID': return 'Void'
        default: return 'Due' // DRAFT, SENT
    }
}

/* Client-facing deliverable pipeline (matches the clientStatus buckets). */
export const PIPELINE = ['Pending', 'In Progress', 'Action Required', 'Revising', 'Completed'] as const

/* Pick a deliverable's type icon name (resolved to a lucide component in ui.tsx). */
export function deliverableIcon(type?: string | null): 'mic' | 'film' | 'smartphone' {
    const t = (type || '').toLowerCase()
    if (t.includes('podcast')) return 'mic'
    if (t.includes('long')) return 'film'
    return 'smartphone'
}
