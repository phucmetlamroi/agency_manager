"use client"

// [Giao diện 2 · Mission Control · M6 Lịch] Desktop lịch 2 chế độ.
// Ported từ design "MÀN 6 — LỊCH". DATA-DRIVEN:
//   • Nhân sự (rảnh/bận): READ-ONLY week matrix từ getAdminAvailabilityWeek (server admin-gated) —
//     đếm ca rảnh/ngày mỗi nhân sự; SỬA lịch bắc cầu sang Giao diện 1 (không rebuild editor).
//   • Deadline: week + month view của deadline task thật (assignee + deadline + status) — client-side nav.
import { useState, useMemo } from "react"
import Link from "next/link"
import {
    LayoutDashboard, ListTodo, Inbox, Clapperboard, CalendarDays, Wallet, Building2,
    Users, CalendarClock, ChevronLeft, ChevronRight, Pencil,
} from "lucide-react"
import McBackLink from "./McBackLink"

export interface McCalTask {
    id: string; title: string; client: string | null
    assignee: string; initials: string; avatar: string
    statusHex: string; statusLabel: string
    deadlineKey: string; deadlineTime: string
}
export interface McCalStaff {
    id: string; name: string; initials: string; avatar: string
    perDay: Record<string, number>; maxSlots: number
}
export interface McCalData {
    workspaceId: string; backHref: string
    weekDays: string[]           // 7 date keys của tuần hiện tại (từ availability server)
    tasks: McCalTask[]
    staff: McCalStaff[]
    scheduleHref: string         // bắc cầu sửa lịch rảnh/bận (Giao diện 1)
}

const RAIL: { icon: typeof ListTodo; active?: boolean; href?: string; divider?: boolean }[] = [
    { icon: LayoutDashboard, href: "MC" }, { icon: ListTodo, href: "QUEUE" }, { icon: Inbox, href: "REQ" },
    { icon: Clapperboard }, { icon: CalendarDays, active: true }, { icon: Wallet, href: "TIEN", divider: true }, { icon: Building2 },
]
const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"]

function parseKey(key: string): Date { const [y, m, d] = key.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)) }
function shiftKey(key: string, days: number): string { const dt = parseKey(key); dt.setUTCDate(dt.getUTCDate() + days); return dt.toISOString().slice(0, 10) }
function dow(key: string): number { return parseKey(key).getUTCDay() }
function dm(key: string): string { const dt = parseKey(key); return `${dt.getUTCDate()}/${dt.getUTCMonth() + 1}` }
function monthLabel(key: string): string { const dt = parseKey(key); return `Tháng ${dt.getUTCMonth() + 1}/${dt.getUTCFullYear()}` }
function monthGrid(anchorKey: string): string[] {
    const dt = parseKey(anchorKey)
    const first = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1))
    const off = (first.getUTCDay() + 6) % 7 // Monday-based
    const start = new Date(first); start.setUTCDate(1 - off)
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setUTCDate(start.getUTCDate() + i); return d.toISOString().slice(0, 10) })
}
function heat(n: number, max: number): string {
    if (n <= 0) return "rgba(220,38,38,0.18)"
    const r = max > 0 ? n / max : 0
    return r >= 0.66 ? "rgba(16,185,129,0.22)" : r >= 0.33 ? "rgba(234,179,8,0.18)" : "rgba(245,158,11,0.16)"
}
function heatText(n: number, max: number): string {
    if (n <= 0) return "#F87171"
    const r = max > 0 ? n / max : 0
    return r >= 0.66 ? "#34D399" : "#FBBF24"
}

export default function McCalendarBoard({ data }: { data: McCalData }) {
    const [mode, setMode] = useState<"staff" | "deadline">("staff")
    const [view, setView] = useState<"week" | "month">("week")
    const [offset, setOffset] = useState(0)

    const base = data.weekDays[0] || new Date().toISOString().slice(0, 10)
    const weekKeys = useMemo(() => data.weekDays.map((k) => shiftKey(k, offset * 7)), [data.weekDays, offset])
    const monthAnchor = shiftKey(base, offset * 7)
    const maxSlots = useMemo(() => Math.max(1, ...data.staff.map((s) => s.maxSlots || 0), ...data.staff.flatMap((s) => Object.values(s.perDay))), [data.staff])

    const tasksByDay = useMemo(() => {
        const m = new Map<string, McCalTask[]>()
        for (const t of data.tasks) { const a = m.get(t.deadlineKey) || []; a.push(t); m.set(t.deadlineKey, a) }
        return m
    }, [data.tasks])

    const rangeLabel = mode === "deadline" && view === "month"
        ? monthLabel(monthAnchor)
        : `${dm(weekKeys[0])} – ${dm(weekKeys[6])}`

    const railHref = (h?: string) =>
        h === "MC" ? `/${data.workspaceId}/mc` : h === "QUEUE" ? `/${data.workspaceId}/mc/queue` : h === "REQ" ? `/${data.workspaceId}/admin/requests` : h === "TIEN" ? `/${data.workspaceId}/mc/tien` : undefined

    return (
        <div style={{ minHeight: "100dvh", background: "#050505", color: "#F4F4F5", display: "flex", position: "relative", fontFamily: '"Plus Jakarta Sans", -apple-system, "Segoe UI", system-ui, sans-serif' }}>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(900px 600px at 12% -10%, rgba(99,102,241,0.10), transparent 60%),radial-gradient(800px 600px at 100% 110%, rgba(168,85,247,0.10), transparent 60%)", pointerEvents: "none" }} />

            {/* Rail */}
            <div style={{ position: "relative", width: 64, flexShrink: 0, background: "rgba(10,10,10,0.85)", backdropFilter: "blur(20px)", borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", alignItems: "center", padding: "14px 0", gap: 4 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 18px rgba(139,92,246,0.40)", marginBottom: 12 }}>
                    <span style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>H</span>
                </div>
                {RAIL.map((r, i) => {
                    const Icon = r.icon
                    const href = railHref(r.href)
                    const inner = (
                        <div style={{ position: "relative", width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: r.active ? "#A5B4FC" : "#A1A1AA", background: r.active ? "rgba(99,102,241,0.18)" : "transparent", border: r.active ? "1px solid rgba(99,102,241,0.30)" : "1px solid transparent", boxShadow: r.active ? "0 4px 16px rgba(99,102,241,0.15)" : "none" }}>
                            <Icon style={{ width: 18, height: 18 }} />
                        </div>
                    )
                    return (
                        <div key={i} style={{ display: "contents" }}>
                            {r.divider && <div style={{ width: 28, height: 1, background: "rgba(255,255,255,0.08)", margin: "8px 0" }} />}
                            {href ? <Link href={href}>{inner}</Link> : inner}
                        </div>
                    )
                })}
                <div style={{ flex: 1 }} />
                <McBackLink backHref={data.backHref} />
            </div>

            {/* Main */}
            <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                {/* Header */}
                <div style={{ height: 64, flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "0 24px", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(10,10,10,0.50)", backdropFilter: "blur(10px)" }}>
                    {/* mode */}
                    <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        {([["staff", "Nhân sự (rảnh/bận)", Users], ["deadline", "Deadline", CalendarClock]] as const).map(([k, lbl, Ic]) => (
                            <button key={k} type="button" onClick={() => { setMode(k); setOffset(0) }}
                                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, padding: "7px 14px", borderRadius: 9, cursor: "pointer", border: mode === k ? "1px solid rgba(99,102,241,0.35)" : "1px solid transparent", background: mode === k ? "rgba(99,102,241,0.20)" : "transparent", color: mode === k ? "#C7D2FE" : "#A1A1AA", whiteSpace: "nowrap" }}>
                                <Ic style={{ width: 13, height: 13 }} />{lbl}
                            </button>
                        ))}
                    </div>
                    {mode === "deadline" && (
                        <div style={{ display: "flex", padding: 3, borderRadius: 999, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            {(["week", "month"] as const).map((v) => (
                                <button key={v} type="button" onClick={() => setView(v)}
                                    style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 999, cursor: "pointer", border: "none", background: view === v ? "rgba(99,102,241,0.20)" : "transparent", color: view === v ? "#C7D2FE" : "#71717A" }}>{v === "week" ? "Tuần" : "Tháng"}</button>
                            ))}
                        </div>
                    )}
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#F4F4F5" }}>{rangeLabel}</span>
                    {(mode === "deadline" || offset !== 0) && (
                        <div style={{ display: "flex", gap: 4 }}>
                            <button type="button" onClick={() => setOffset((o) => o - 1)} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#A1A1AA", background: "transparent", cursor: "pointer" }}><ChevronLeft style={{ width: 14, height: 14 }} /></button>
                            <button type="button" onClick={() => setOffset(0)} style={{ fontSize: 11, fontWeight: 700, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", color: offset === 0 ? "#71717A" : "#A5B4FC", background: "transparent", cursor: "pointer" }}>Hôm nay</button>
                            <button type="button" onClick={() => setOffset((o) => o + 1)} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#A1A1AA", background: "transparent", cursor: "pointer" }}><ChevronRight style={{ width: 14, height: 14 }} /></button>
                        </div>
                    )}
                </div>

                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, padding: "18px 24px", minHeight: 0, overflow: "hidden" }}>
                    {mode === "staff" ? (
                        <>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontSize: 11, color: "#A1A1AA" }}>Số <b style={{ color: "#34D399" }}>ca rảnh</b> mỗi nhân sự theo ngày (tuần hiện tại). Sửa lịch rảnh/bận:</span>
                                <Link href={data.scheduleHref} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#A5B4FC", padding: "5px 11px", borderRadius: 8, border: "1px solid rgba(99,102,241,0.30)", background: "rgba(99,102,241,0.08)", textDecoration: "none" }}><Pencil style={{ width: 12, height: 12 }} />Mở trình sửa lịch ▸</Link>
                                {offset !== 0 && <span style={{ fontSize: 11, color: "#71717A" }}>· dữ liệu rảnh/bận chỉ hiển thị tuần hiện tại — bấm “Hôm nay”.</span>}
                            </div>
                            {/* Matrix */}
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", minHeight: 0 }}>
                                <div style={{ display: "flex", gap: 8, padding: "0 8px" }}>
                                    <span style={{ width: 180, flexShrink: 0 }} />
                                    {data.weekDays.map((k) => (
                                        <span key={k} style={{ flex: 1, textAlign: "center", fontSize: 10, fontWeight: 700, color: "#71717A" }}>{WD[dow(k)]} {dm(k)}</span>
                                    ))}
                                </div>
                                {data.staff.length === 0 && <div style={{ textAlign: "center", fontSize: 12, color: "#52525B", padding: "24px 8px" }}>Chưa có nhân sự.</div>}
                                {data.staff.map((s) => (
                                    <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 8px", borderRadius: 12, background: "rgba(24,24,27,0.45)", border: "1px solid rgba(255,255,255,0.05)" }}>
                                        <div style={{ width: 180, flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
                                            <span style={{ width: 28, height: 28, borderRadius: 999, background: s.avatar, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{s.initials}</span>
                                            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#F4F4F5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                                        </div>
                                        {data.weekDays.map((k) => {
                                            const n = s.perDay[k] ?? 0
                                            return (
                                                <div key={k} style={{ flex: 1, height: 34, borderRadius: 8, background: heat(n, maxSlots), border: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: heatText(n, maxSlots) }} title={`${n} ca rảnh`}>{n > 0 ? `${n} ca` : "bận"}</div>
                                            )
                                        })}
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : view === "week" ? (
                        /* Deadline — week */
                        <div style={{ display: "flex", gap: 8, flex: 1, minHeight: 0 }}>
                            {weekKeys.map((k) => {
                                const list = (tasksByDay.get(k) || []).slice().sort((a, b) => a.deadlineTime.localeCompare(b.deadlineTime))
                                return (
                                    <div key={k} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 14, padding: 8, minWidth: 0 }}>
                                        <div style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "2px 4px" }}>
                                            <span style={{ fontSize: 11, fontWeight: 800, color: "#D4D4D8" }}>{WD[dow(k)]}</span>
                                            <span style={{ fontSize: 10, color: "#71717A" }}>{dm(k)}</span>
                                            {list.length > 0 && <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 800, color: "#A5B4FC", background: "rgba(99,102,241,0.14)", borderRadius: 999, padding: "0 6px" }}>{list.length}</span>}
                                        </div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", minHeight: 0 }}>
                                            {list.map((t) => (
                                                <Link key={t.id} href={`/${data.workspaceId}/mc/task/${t.id}`} title={t.title}
                                                    style={{ display: "flex", flexDirection: "column", gap: 4, padding: "7px 8px", borderRadius: 9, background: "rgba(24,24,27,0.70)", border: `1px solid ${t.statusHex}44`, borderLeft: `2px solid ${t.statusHex}`, textDecoration: "none" }}>
                                                    <span style={{ fontSize: 11, fontWeight: 700, color: "#F4F4F5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                                        <span style={{ width: 16, height: 16, borderRadius: 999, background: t.avatar, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 800, color: "#fff" }}>{t.initials}</span>
                                                        <span style={{ fontSize: 9.5, color: "#71717A" }}>{t.deadlineTime}</span>
                                                        <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: 999, background: t.statusHex }} title={t.statusLabel} />
                                                    </div>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        /* Deadline — month */
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minHeight: 0 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
                                {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((w) => <span key={w} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "#71717A" }}>{w}</span>)}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gridAutoRows: "1fr", gap: 6, flex: 1, minHeight: 0 }}>
                                {monthGrid(monthAnchor).map((k) => {
                                    const inMonth = parseKey(k).getUTCMonth() === parseKey(monthAnchor).getUTCMonth()
                                    const list = tasksByDay.get(k) || []
                                    return (
                                        <div key={k} style={{ display: "flex", flexDirection: "column", gap: 3, background: inMonth ? "rgba(24,24,27,0.45)" : "rgba(24,24,27,0.20)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 6, minHeight: 0, opacity: inMonth ? 1 : 0.5, overflow: "hidden" }}>
                                            <div style={{ display: "flex", alignItems: "center" }}>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: inMonth ? "#D4D4D8" : "#52525B" }}>{parseKey(k).getUTCDate()}</span>
                                                {list.length > 0 && <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 800, color: "#A5B4FC" }}>{list.length}</span>}
                                            </div>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 2, overflow: "hidden" }}>
                                                {list.slice(0, 3).map((t) => (
                                                    <Link key={t.id} href={`/${data.workspaceId}/mc/task/${t.id}`} title={t.title} style={{ display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
                                                        <span style={{ width: 5, height: 5, borderRadius: 999, background: t.statusHex, flexShrink: 0 }} />
                                                        <span style={{ fontSize: 9.5, color: "#A1A1AA", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                                                    </Link>
                                                ))}
                                                {list.length > 3 && <span style={{ fontSize: 9, color: "#52525B" }}>+{list.length - 3} nữa</span>}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
