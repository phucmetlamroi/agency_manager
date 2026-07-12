"use client"

// [Giao diện 2 · Mission Control · M5 Finance] Desktop tab Tài chính (cùng shell với M4 Payroll).
// Ported từ design "MÀN 5 — FINANCE TAB". DATA-DRIVEN, money-safe:
//   • THỰC TẾ (task 'Hoàn tất') vs DỰ KIẾN (mọi task chưa lưu trữ) — cùng nguồn computeWorkspaceFinance
//   • 3 KPI Doanh thu/Chi phí/Lợi nhuận (+biên%) mỗi khối; nhật ký giao dịch per-task (filter + search + phân trang)
//   • toggle VND/USD = thuần client (USD = ÷ exchangeRate); route admin-gated nên tiền không lộ non-admin
// Công nợ khách nằm ở Sổ thu tiền (M12/M25) — không thuộc màn này.
import { useState, useMemo, type ReactNode } from "react"
import Link from "next/link"
import {
    LayoutDashboard, ListTodo, Inbox, Clapperboard, CalendarDays, Wallet, Building2,
    CalendarDays as CalIcon, ChevronDown, TrendingUp, Sigma, Search, ChevronLeft, ChevronRight,
} from "lucide-react"
import McBackLink from "./McBackLink"

export interface McFinanceTxn {
    id: string; title: string; status: string; statusHex: string; statusLabel: string
    isCompleted: boolean
    assignee: string; initials: string; avatar: string
    revenueVND: number; wageVND: number; profitVND: number
}
export interface McFinanceData {
    workspaceId: string; backHref: string
    periodLabel: string; currentUserInitials: string
    actual: { revenueVND: number; wageVND: number; profitVND: number; marginPct: number; count: number }
    projected: { revenueVND: number; wageVND: number; profitVND: number; marginPct: number; count: number }
    txns: McFinanceTxn[]
    exchangeRate: number
    payrollHref: string
}

const RAIL: { icon: typeof ListTodo; active?: boolean; href?: string; divider?: boolean }[] = [
    { icon: LayoutDashboard, href: "MC" }, { icon: ListTodo, href: "QUEUE" }, { icon: Inbox, href: "REQ" },
    { icon: Clapperboard }, { icon: CalendarDays, href: "LICH" }, { icon: Wallet, active: true, divider: true }, { icon: Building2 },
]

type Cur = "VND" | "USD"
const PAGE = 8

export default function McFinanceBoard({ data }: { data: McFinanceData }) {
    const [cur, setCur] = useState<Cur>("VND")
    const [filter, setFilter] = useState<"all" | "done" | "pending">("all")
    const [q, setQ] = useState("")
    const [page, setPage] = useState(0)

    const fmt = (vnd: number): string => {
        if (cur === "USD") {
            const usd = data.exchangeRate > 0 ? vnd / data.exchangeRate : 0
            return `$${usd.toLocaleString("en-US", { maximumFractionDigits: usd >= 100 ? 0 : 1 })}`
        }
        return `${Math.round(vnd).toLocaleString("vi-VN")} đ`
    }
    // Compact delta (frame: "+56tr vs thực tế").
    const fmtDelta = (vnd: number): string => {
        if (cur === "USD") { const u = data.exchangeRate > 0 ? vnd / data.exchangeRate : 0; return `${u >= 0 ? "+" : ""}$${Math.abs(u) >= 1000 ? (u / 1000).toFixed(1) + "k" : u.toFixed(0)}` }
        const tr = vnd / 1e6
        return `${tr >= 0 ? "+" : ""}${tr.toFixed(1)}tr`
    }

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase()
        return data.txns.filter((t) => {
            if (filter === "done" && !t.isCompleted) return false
            if (filter === "pending" && t.isCompleted) return false
            if (s && !(t.title.toLowerCase().includes(s) || t.assignee.toLowerCase().includes(s))) return false
            return true
        })
    }, [data.txns, filter, q])

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE))
    const curPage = Math.min(page, pageCount - 1)
    const rows = filtered.slice(curPage * PAGE, curPage * PAGE + PAGE)
    const dRev = data.projected.revenueVND - data.actual.revenueVND
    const dCost = data.projected.wageVND - data.actual.wageVND

    const railHref = (h?: string) =>
        h === "MC" ? `/${data.workspaceId}/mc` : h === "QUEUE" ? `/${data.workspaceId}/mc/queue` : h === "REQ" ? `/${data.workspaceId}/admin/requests` : h === "LICH" ? `/${data.workspaceId}/mc/lich` : undefined

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
                    <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <Link href={data.payrollHref} style={{ fontSize: 12, fontWeight: 700, padding: "7px 16px", borderRadius: 9, color: "#A1A1AA", whiteSpace: "nowrap", textDecoration: "none" }}>Payroll — Bảng lương</Link>
                        <span style={{ fontSize: 12, fontWeight: 700, padding: "7px 16px", borderRadius: 9, background: "rgba(99,102,241,0.20)", border: "1px solid rgba(99,102,241,0.35)", color: "#C7D2FE", whiteSpace: "nowrap" }}>Finance — Tài chính</span>
                    </div>
                    <div style={{ flex: 1 }} />
                    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} title="Kỳ = tháng của workspace">
                        <CalIcon style={{ width: 14, height: 14, color: "#A5B4FC" }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#F4F4F5" }}>{data.periodLabel} — workspace</span>
                        <ChevronDown style={{ width: 13, height: 13, color: "#71717A" }} />
                    </div>
                    <div style={{ display: "flex", padding: 3, borderRadius: 999, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        {(["VND", "USD"] as Cur[]).map((c) => (
                            <button key={c} type="button" onClick={() => setCur(c)}
                                style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 999, cursor: "pointer", border: "none", background: cur === c ? "rgba(99,102,241,0.20)" : "transparent", color: cur === c ? "#C7D2FE" : "#71717A" }}>{c}</button>
                        ))}
                    </div>
                    <div style={{ width: 34, height: 34, borderRadius: 999, background: "linear-gradient(135deg,#A855F7,#6366F1)", border: "2px solid rgba(99,102,241,0.6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 12 }}>{data.currentUserInitials}</div>
                </div>

                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, padding: "18px 24px", minHeight: 0, overflow: "hidden" }}>
                    {/* THỰC TẾ */}
                    <Divider color="#34D399" bg="rgba(16,185,129,0.15)" label={`Thực tế — ${data.actual.count} task hoàn tất`} />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
                        <ActualCard glow="rgba(16,185,129,0.07)" label="Doanh thu" value={fmt(data.actual.revenueVND)} sub="Σ giá khách ($) × tỷ giá per-task"
                            icon={<TrendingUp style={{ width: 14, height: 14 }} />} iconBg="rgba(16,185,129,0.10)" iconBd="rgba(16,185,129,0.2)" iconCol="#34D399" />
                        <ActualCard glow="transparent" label="Chi phí" value={fmt(data.actual.wageVND)} sub="Σ thù lao editor (wageVND)"
                            icon={<Wallet style={{ width: 14, height: 14 }} />} iconBg="rgba(245,158,11,0.10)" iconBd="rgba(245,158,11,0.2)" iconCol="#FBBF24" />
                        <ActualCard glow="rgba(16,185,129,0.09)" label="Lợi nhuận ròng" value={fmt(data.actual.profitVND)} sub="= doanh thu − chi phí" valueColor="#34D399"
                            border="1px solid rgba(16,185,129,0.25)" badge={`Biên ${Math.round(data.actual.marginPct)}%`} />
                    </div>

                    {/* DỰ KIẾN */}
                    <Divider color="#A5B4FC" bg="rgba(99,102,241,0.15)" label={`Dự kiến — toàn bộ ${data.projected.count} task chưa lưu trữ`} />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
                        <ProjRow label="Doanh thu" value={fmt(data.projected.revenueVND)} pill={`${fmtDelta(dRev)} vs thực tế`} pillBg="rgba(99,102,241,0.12)" pillCol="#A5B4FC" />
                        <ProjRow label="Chi phí" value={fmt(data.projected.wageVND)} pill={fmtDelta(dCost)} pillBg="rgba(245,158,11,0.10)" pillCol="#FBBF24" />
                        <ProjRow label="Lợi nhuận" value={fmt(data.projected.profitVND)} valueColor="#A5B4FC" pill={`Biên ${Math.round(data.projected.marginPct)}%`} pillBg="rgba(99,102,241,0.12)" pillCol="#A5B4FC" />
                    </div>

                    {/* Banner nguồn */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderRadius: 12, background: "rgba(99,102,241,0.05)", border: "1px dashed rgba(99,102,241,0.25)" }}>
                        <Sigma style={{ width: 13, height: 13, color: "#A5B4FC" }} />
                        <span style={{ fontSize: 11, color: "#A1A1AA" }}>Cùng nguồn <b style={{ color: "#D4D4D8" }}>computeWorkspaceFinance</b> với KPI Dashboard · Doanh thu = Σ jobPriceUSD × tỷ giá · Chi phí = Σ wageVND · công nợ khách xem ở <Link href={`/${data.workspaceId}/admin/crm`} style={{ color: "#C084FC", textDecoration: "none" }}>Sổ thu tiền ▸</Link></span>
                    </div>

                    {/* Nhật ký giao dịch */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "#71717A" }}>Nhật ký giao dịch — per task</span>
                            <div style={{ display: "flex", padding: 2, borderRadius: 999, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                                {([["all", `Tất cả · ${data.txns.length}`], ["done", `Hoàn tất · ${data.actual.count}`], ["pending", `Đang chờ · ${data.txns.length - data.actual.count}`]] as const).map(([k, lbl]) => (
                                    <button key={k} type="button" onClick={() => { setFilter(k); setPage(0) }}
                                        style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 999, cursor: "pointer", border: "none", background: filter === k ? "rgba(99,102,241,0.20)" : "transparent", color: filter === k ? "#C7D2FE" : "#71717A" }}>{lbl}</button>
                                ))}
                            </div>
                            <div style={{ flex: 1 }} />
                            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 11px", borderRadius: 9, background: "rgba(39,39,42,0.60)", border: "1px solid rgba(255,255,255,0.06)", width: 200 }}>
                                <Search style={{ width: 12, height: 12, color: "#52525B" }} />
                                <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} placeholder="Tìm task, người làm…"
                                    style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#F4F4F5", fontSize: 11 }} />
                            </div>
                        </div>
                        {/* Column header */}
                        <div style={{ display: "flex", alignItems: "center", padding: "0 16px", gap: 12 }}>
                            <span style={{ flex: 1.6, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#71717A" }}>Task · trạng thái</span>
                            <span style={{ width: 130, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#71717A" }}>Người làm</span>
                            <span style={{ width: 120, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#71717A", textAlign: "right" }}>Doanh thu</span>
                            <span style={{ width: 110, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#71717A", textAlign: "right" }}>Thù lao</span>
                            <span style={{ width: 110, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#71717A", textAlign: "right" }}>Lợi nhuận</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", minHeight: 0 }}>
                            {rows.length === 0 && <div style={{ textAlign: "center", fontSize: 12, color: "#52525B", padding: "24px 8px" }}>Không có giao dịch khớp.</div>}
                            {rows.map((t) => (
                                <Link key={t.id} href={`/${data.workspaceId}/mc/task/${t.id}`} title="Mở chi tiết task"
                                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderRadius: 13, background: "rgba(24,24,27,0.60)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.06)", textDecoration: "none", opacity: t.isCompleted ? 1 : 0.85 }}>
                                    <span style={{ flex: 1.6, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                        <span style={{ fontSize: 12.5, fontWeight: 700, color: "#F4F4F5", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span>
                                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5, fontWeight: 700, padding: "1px 8px", borderRadius: 999, background: `${t.statusHex}1a`, color: t.statusHex, border: `1px solid ${t.statusHex}4d`, whiteSpace: "nowrap" }}><span style={{ width: 4, height: 4, borderRadius: 999, background: t.statusHex }} />{t.statusLabel}</span>
                                    </span>
                                    <span style={{ width: 130, display: "inline-flex", alignItems: "center", gap: 6 }}>
                                        <span style={{ width: 20, height: 20, borderRadius: 999, background: t.avatar, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, color: "#fff" }}>{t.initials}</span>
                                        <span style={{ fontSize: 11.5, color: "#D4D4D8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.assignee}</span>
                                    </span>
                                    <span style={{ width: 120, fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12, fontWeight: 700, color: t.isCompleted ? "#F4F4F5" : "#A1A1AA", textAlign: "right" }}>{fmt(t.revenueVND)}</span>
                                    <span style={{ width: 110, fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12, color: t.isCompleted ? "#D4D4D8" : "#A1A1AA", textAlign: "right" }}>{fmt(t.wageVND)}</span>
                                    <span style={{ width: 110, fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12, fontWeight: 700, color: t.isCompleted ? "#34D399" : "#71717A", textAlign: "right" }}>{t.isCompleted ? `+${fmt(t.profitVND)}` : "dự kiến"}</span>
                                </Link>
                            ))}
                        </div>
                        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 10, padding: "8px 16px" }}>
                            <span style={{ fontSize: 11, color: "#71717A" }}>Hiển thị <b style={{ color: "#A1A1AA" }}>{filtered.length === 0 ? 0 : curPage * PAGE + 1}–{Math.min(curPage * PAGE + PAGE, filtered.length)}</b> / {filtered.length} giao dịch</span>
                            <div style={{ flex: 1 }} />
                            <button type="button" disabled={curPage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} style={{ width: 26, height: 26, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: curPage === 0 ? "#52525B" : "#A1A1AA", background: "transparent", cursor: curPage === 0 ? "default" : "pointer" }}><ChevronLeft style={{ width: 13, height: 13 }} /></button>
                            <button type="button" disabled={curPage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} style={{ width: 26, height: 26, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: curPage >= pageCount - 1 ? "#52525B" : "#A1A1AA", background: "transparent", cursor: curPage >= pageCount - 1 ? "default" : "pointer" }}><ChevronRight style={{ width: 13, height: 13 }} /></button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function Divider({ color, bg, label }: { color: string; bg: string; label: string }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color }}>{label}</span>
            <div style={{ flex: 1, height: 1, background: bg }} />
        </div>
    )
}

function ActualCard({ glow, label, value, sub, icon, iconBg, iconBd, iconCol, valueColor, border, badge }: {
    glow: string; label: string; value: string; sub: string
    icon?: ReactNode; iconBg?: string; iconBd?: string; iconCol?: string
    valueColor?: string; border?: string; badge?: string
}) {
    return (
        <div style={{ position: "relative", overflow: "hidden", borderRadius: 20, background: "rgba(24,24,27,0.60)", backdropFilter: "blur(12px)", border: border || "1px solid rgba(255,255,255,0.06)", boxShadow: "0 24px 60px rgba(0,0,0,0.45)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
            {glow !== "transparent" && <div style={{ position: "absolute", top: -40, right: -40, width: 130, height: 130, borderRadius: 999, background: glow, filter: "blur(28px)", pointerEvents: "none" }} />}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#A1A1AA", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
                {badge
                    ? <span style={{ display: "inline-flex", fontSize: 10, fontWeight: 800, padding: "2px 9px", borderRadius: 999, background: "rgba(16,185,129,0.10)", color: "#34D399" }}>{badge}</span>
                    : <span style={{ width: 28, height: 28, borderRadius: 9, background: iconBg, border: `1px solid ${iconBd}`, display: "flex", alignItems: "center", justifyContent: "center", color: iconCol }}>{icon}</span>}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: valueColor || "#fff", letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{value}</div>
            <span style={{ fontSize: 10.5, color: "#71717A" }}>{sub}</span>
        </div>
    )
}

function ProjRow({ label, value, pill, pillBg, pillCol, valueColor }: { label: string; value: string; pill: string; pillBg: string; pillCol: string; valueColor?: string }) {
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 16, background: "rgba(24,24,27,0.45)", border: "1px solid rgba(255,255,255,0.05)", padding: "12px 18px" }}>
            <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#71717A", textTransform: "uppercase" }}>{label}</span>
                <span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 17, fontWeight: 800, color: valueColor || "#F4F4F5", whiteSpace: "nowrap" }}>{value}</span>
            </span>
            <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: pillBg, color: pillCol, whiteSpace: "nowrap" }}>{pill}</span>
        </div>
    )
}
