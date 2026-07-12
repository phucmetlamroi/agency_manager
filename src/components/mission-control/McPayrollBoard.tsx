"use client"

// [Giao diện 2 · Mission Control · M4 Tiền — Payroll] Desktop bảng-lương screen.
// Ported from the design's "MÀN 4 — TIỀN" (Payroll tab active; Finance tab → M5).
// DATA-DRIVEN + functional, money-safe:
//   • kỳ = tháng của workspace (parse 'MM/YYYY') — cùng nguồn extractPayrollCycle
//   • mỗi editor: Thực nhận = Σ task 'Hoàn tất'.value + bonus (khớp PayrollCard)
//   • "Đánh dấu đã trả" reuses confirmPayment (2-step confirm) · "Hoàn tác" = revertPayment
//     (surfaces PAYROLL_LOCKED). Both server actions re-derive the cycle + gate ADMIN.
//   • VND/USD toggle = pure client display (payroll is ₫-native, USD = ÷ exchangeRate)
// Deep controls (tính thưởng / khóa sổ / per-task breakdown) bridge to Giao diện 1 payroll.
import { useState, useTransition, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    LayoutDashboard, ListTodo, Inbox, Clapperboard, CalendarDays, Wallet, Building2,
    FileSpreadsheet, CalendarDays as CalIcon, Hourglass, Calculator, CheckCircle2, RotateCcw, ExternalLink,
} from "lucide-react"
import { confirmPayment, revertPayment } from "@/actions/payroll-actions"
import McBackLink from "./McBackLink"

export interface McPayrollEditor {
    id: string; name: string; initials: string; avatar: string
    rank?: string; rankColor?: string
    completedCount: number; pendingCount: number; progressPct: number
    taskIncomeVND: number; bonusVND: number; totalVND: number
    isPaid: boolean
}
export interface McPayrollData {
    workspaceId: string; backHref: string
    workspaceName: string
    periodLabel: string
    cycle: { month: number; year: number }
    currentUserInitials: string
    editors: McPayrollEditor[]
    kpi: {
        netVND: number; pendingVND: number; bonusVND: number
        doneCount: number; pendingTaskCount: number; people: number; paidCount: number
    }
    exchangeRate: number
    canExport: boolean
    exportUrl: string
    financeHref: string
    payrollBridgeHref: string
}

const RAIL: { icon: typeof ListTodo; active?: boolean; href?: string; divider?: boolean }[] = [
    { icon: LayoutDashboard, href: "MC" }, { icon: ListTodo, href: "QUEUE" }, { icon: Inbox, href: "REQ" },
    { icon: Clapperboard }, { icon: CalendarDays }, { icon: Wallet, active: true, divider: true }, { icon: Building2 },
]

type Cur = "VND" | "USD"

export default function McPayrollBoard({ data }: { data: McPayrollData }) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [cur, setCur] = useState<Cur>("VND")
    // Which editor row is in the "confirm mark-paid" state.
    const [confirmingId, setConfirmingId] = useState<string | null>(null)

    const fmt = (vnd: number): string => {
        if (cur === "USD") {
            const usd = data.exchangeRate > 0 ? vnd / data.exchangeRate : 0
            return `$${usd.toLocaleString("en-US", { maximumFractionDigits: usd >= 100 ? 0 : 1 })}`
        }
        return `${Math.round(vnd).toLocaleString("vi-VN")} đ`
    }

    const doPay = (e: McPayrollEditor) => {
        startTransition(async () => {
            const res = await confirmPayment(
                { userId: e.id, month: data.cycle.month, year: data.cycle.year, baseSalary: e.taskIncomeVND, bonus: e.bonusVND, totalAmount: e.totalVND },
                data.workspaceId,
            )
            if ((res as any)?.error) { toast.error((res as any).error); return }
            toast.success(`Đã đánh dấu trả lương ${e.name}`)
            setConfirmingId(null)
            router.refresh()
        })
    }

    const doRevert = (e: McPayrollEditor) => {
        startTransition(async () => {
            const res = await revertPayment(e.id, data.cycle.month, data.cycle.year, data.workspaceId)
            if ((res as any)?.error) { toast.error((res as any).error); return }
            toast.success(`Đã hoàn tác thanh toán ${e.name}`)
            router.refresh()
        })
    }

    const railHref = (h?: string) =>
        h === "MC" ? `/${data.workspaceId}/mc`
            : h === "QUEUE" ? `/${data.workspaceId}/mc/queue`
                : h === "REQ" ? `/${data.workspaceId}/admin/requests` : undefined

    return (
        <div style={{ minHeight: "100dvh", background: "#050505", color: "#F4F4F5", display: "flex", position: "relative", fontFamily: '"Plus Jakarta Sans", -apple-system, "Segoe UI", system-ui, sans-serif' }}>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(900px 600px at 12% -10%, rgba(99,102,241,0.10), transparent 60%),radial-gradient(800px 600px at 100% 110%, rgba(168,85,247,0.10), transparent 60%)", pointerEvents: "none" }} />

            {/* Icon rail */}
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
                    {/* Payroll / Finance tab pair */}
                    <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, padding: "7px 16px", borderRadius: 9, background: "rgba(99,102,241,0.20)", border: "1px solid rgba(99,102,241,0.35)", color: "#C7D2FE", whiteSpace: "nowrap" }}>Payroll — Bảng lương</span>
                        <Link href={data.financeHref} title="Finance — Tài chính (Giao diện 1, M5 sắp có ở Giao diện 2)" style={{ fontSize: 12, fontWeight: 700, padding: "7px 16px", borderRadius: 9, color: "#A1A1AA", whiteSpace: "nowrap", textDecoration: "none" }}>Finance — Tài chính</Link>
                    </div>
                    {data.canExport && (
                        <a href={data.exportUrl} title="GET /api/exports/monthly-tasks-xlsx — chỉ role ADMIN"
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(16,185,129,0.30)", background: "rgba(16,185,129,0.06)", fontSize: 12, fontWeight: 600, color: "#34D399", textDecoration: "none", whiteSpace: "nowrap" }}>
                            <FileSpreadsheet style={{ width: 13, height: 13 }} />Xuất XLSX
                        </a>
                    )}
                    <div style={{ flex: 1 }} />
                    {/* Period pill */}
                    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} title="Kỳ = tháng của workspace (parse từ tên 'MM/YYYY')">
                        <CalIcon style={{ width: 14, height: 14, color: "#A5B4FC" }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#F4F4F5" }}>{data.periodLabel}</span>
                    </div>
                    {/* Currency toggle */}
                    <div style={{ display: "flex", padding: 3, borderRadius: 999, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        {(["VND", "USD"] as Cur[]).map((c) => (
                            <button key={c} type="button" onClick={() => setCur(c)}
                                style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 999, cursor: "pointer", border: "none",
                                    background: cur === c ? "rgba(99,102,241,0.20)" : "transparent", color: cur === c ? "#C7D2FE" : "#71717A" }}>
                                {c}
                            </button>
                        ))}
                    </div>
                    <div style={{ width: 34, height: 34, borderRadius: 999, background: "linear-gradient(135deg,#A855F7,#6366F1)", border: "2px solid rgba(99,102,241,0.6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 12 }}>{data.currentUserInitials}</div>
                </div>

                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, padding: "20px 24px", minHeight: 0, overflow: "hidden" }}>
                    {/* KPI strip */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
                        {/* Tổng chi kỳ này */}
                        <KpiBig glow="rgba(99,102,241,0.08)" icon={<Wallet style={{ width: 15, height: 15 }} />} iconBg="rgba(99,102,241,0.13)" iconBd="rgba(99,102,241,0.2)" iconCol="#A5B4FC"
                            label="Tổng chi kỳ này" value={fmt(data.kpi.netVND)} sub={`${data.kpi.doneCount} task đã chốt · ${data.kpi.people} editor`} />
                        {/* Chờ trả */}
                        <KpiBig glow="rgba(234,179,8,0.07)" icon={<Hourglass style={{ width: 15, height: 15 }} />} iconBg="rgba(234,179,8,0.10)" iconBd="rgba(234,179,8,0.2)" iconCol="#FBBF24"
                            label="Chờ trả — task đang chạy" value={fmt(data.kpi.pendingVND)} sub={`${data.kpi.pendingTaskCount} task salary-pending`} />
                        {/* Bonus dự kiến */}
                        <KpiBig glow="rgba(16,185,129,0.07)" icon={<Calculator style={{ width: 15, height: 15 }} />} iconBg="rgba(16,185,129,0.10)" iconBd="rgba(16,185,129,0.2)" iconCol="#34D399"
                            label="Bonus dự kiến" value={fmt(data.kpi.bonusVND)}
                            subNode={<Link href={data.payrollBridgeHref} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#34D399", textDecoration: "none" }}>Tính thưởng &amp; khóa sổ <ExternalLink style={{ width: 11, height: 11 }} /></Link>} />
                        {/* Nhân sự */}
                        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 2, borderRadius: 20, background: "rgba(24,24,27,0.45)", border: "1px solid rgba(255,255,255,0.05)", padding: "14px 18px" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#71717A", textTransform: "uppercase", letterSpacing: "0.08em" }}>Nhân sự</span>
                            <span style={{ fontSize: 22, fontWeight: 800, color: "#F4F4F5" }}>{data.kpi.people}</span>
                            <span style={{ fontSize: 10, color: "#52525B" }}>{data.kpi.paidCount} đã trả · {data.kpi.people - data.kpi.paidCount} chưa</span>
                        </div>
                        {/* Task hoàn tất */}
                        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 2, borderRadius: 20, background: "rgba(24,24,27,0.45)", border: "1px solid rgba(255,255,255,0.05)", padding: "14px 18px" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#71717A", textTransform: "uppercase", letterSpacing: "0.08em" }}>Task hoàn tất</span>
                            <span style={{ fontSize: 22, fontWeight: 800, color: "#34D399" }}>{data.kpi.doneCount}<span style={{ fontSize: 12, color: "#71717A", fontWeight: 600 }}> / {data.kpi.doneCount + data.kpi.pendingTaskCount}</span></span>
                            <div style={{ height: 4, borderRadius: 999, background: "rgba(255,255,255,0.06)" }}>
                                <div style={{ width: `${data.kpi.doneCount + data.kpi.pendingTaskCount > 0 ? Math.round((data.kpi.doneCount / (data.kpi.doneCount + data.kpi.pendingTaskCount)) * 100) : 0}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#10B981,#34D399)" }} />
                            </div>
                        </div>
                    </div>

                    {/* Payroll rows */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", padding: "0 16px", gap: 12 }}>
                            <span style={{ width: 220, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#71717A" }}>Editor</span>
                            <span style={{ width: 140, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#71717A" }}>Tiến độ kỳ</span>
                            <span style={{ flex: 1 }} />
                            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#71717A" }}>Thực nhận</span>
                            <span style={{ width: 168 }} />
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", minHeight: 0 }}>
                            {data.editors.length === 0 && (
                                <div style={{ textAlign: "center", fontSize: 12, color: "#52525B", padding: "28px 8px" }}>Chưa có dữ liệu lương trong kỳ này.</div>
                            )}
                            {data.editors.map((e) => {
                                const confirming = confirmingId === e.id
                                return (
                                    <div key={e.id} style={{ display: "flex", flexDirection: "column", borderRadius: 14, background: "rgba(24,24,27,0.60)", backdropFilter: "blur(12px)", border: e.isPaid ? "1px solid rgba(16,185,129,0.22)" : "1px solid rgba(255,255,255,0.06)" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px" }}>
                                            <div style={{ width: 220, display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                                <span style={{ width: 34, height: 34, borderRadius: 999, background: e.avatar, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{e.initials}</span>
                                                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                        <span style={{ fontSize: 13, fontWeight: 700, color: "#F4F4F5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
                                                        {e.rank && <span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 9, fontWeight: 800, color: e.rankColor, border: `1px solid ${e.rankColor}66`, borderRadius: 4, padding: "0 4px" }}>{e.rank}</span>}
                                                    </div>
                                                    <span style={{ fontSize: 10, color: "#71717A" }}>{e.completedCount + e.pendingCount} task · {e.completedCount} hoàn tất</span>
                                                </div>
                                            </div>
                                            <div style={{ width: 140, height: 5, borderRadius: 999, background: "rgba(255,255,255,0.06)" }}>
                                                <div style={{ width: `${e.progressPct}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#10B981,#34D399)" }} />
                                            </div>
                                            {e.bonusVND > 0 && <span style={{ fontSize: 11, color: "#71717A", whiteSpace: "nowrap" }}>+ bonus {fmt(e.bonusVND)}</span>}
                                            <span style={{ flex: 1 }} />
                                            <span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 15, fontWeight: 800, color: "#FFFFFF", whiteSpace: "nowrap" }}>{fmt(e.totalVND)}</span>
                                            <div style={{ width: 168, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
                                                {e.isPaid ? (
                                                    <>
                                                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "#34D399", padding: "5px 10px", borderRadius: 8, background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.30)" }}><CheckCircle2 style={{ width: 12, height: 12 }} />Đã trả</span>
                                                        <button type="button" disabled={pending} onClick={() => doRevert(e)} title="Hoàn tác thanh toán (bị chặn nếu kỳ đã khóa)"
                                                            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, cursor: pending ? "wait" : "pointer", background: "transparent", border: "1px solid rgba(255,255,255,0.10)", color: "#A1A1AA" }}>
                                                            <RotateCcw style={{ width: 13, height: 13 }} />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button type="button" disabled={pending} onClick={() => setConfirmingId(confirming ? null : e.id)}
                                                        style={{ fontSize: 11, fontWeight: 700, color: confirming ? "#fff" : "#A5B4FC", padding: "6px 12px", borderRadius: 8, cursor: pending ? "wait" : "pointer",
                                                            background: confirming ? "#6366F1" : "transparent", border: confirming ? "1px solid #6366F1" : "1px solid rgba(99,102,241,0.3)" }}>
                                                        {confirming ? "Đang chọn…" : "Đánh dấu đã trả"}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* 2-step confirm strip */}
                                        {confirming && !e.isPaid && (
                                            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderTop: "1px solid rgba(99,102,241,0.20)", background: "rgba(99,102,241,0.06)" }}>
                                                <span style={{ fontSize: 11, color: "#A1A1AA" }}>
                                                    Trả lương <b style={{ color: "#F4F4F5" }}>{e.name}</b> kỳ <b style={{ color: "#C7D2FE" }}>{data.periodLabel}</b>:
                                                    <span style={{ fontFamily: "ui-monospace,Menlo,monospace", color: "#F4F4F5" }}> {fmt(e.taskIncomeVND)}</span> lương
                                                    {e.bonusVND > 0 && <span style={{ fontFamily: "ui-monospace,Menlo,monospace", color: "#34D399" }}> + {fmt(e.bonusVND)} thưởng</span>}
                                                    <span style={{ fontFamily: "ui-monospace,Menlo,monospace", color: "#fff", fontWeight: 800 }}> = {fmt(e.totalVND)}</span>
                                                </span>
                                                <span style={{ flex: 1 }} />
                                                <Link href={data.payrollBridgeHref} style={{ fontSize: 11, color: "#71717A", textDecoration: "none" }} title="Xem chi tiết từng task + khóa sổ ở Giao diện 1">Chi tiết ↗</Link>
                                                <button type="button" disabled={pending} onClick={() => setConfirmingId(null)}
                                                    style={{ fontSize: 11, fontWeight: 600, color: "#A1A1AA", padding: "6px 12px", borderRadius: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.10)", cursor: "pointer" }}>Hủy</button>
                                                <button type="button" disabled={pending} onClick={() => doPay(e)}
                                                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "#fff", padding: "6px 14px", borderRadius: 8, background: "#10B981", border: "1px solid #10B981", cursor: pending ? "wait" : "pointer" }}>
                                                    <CheckCircle2 style={{ width: 13, height: 13 }} />Xác nhận trả {fmt(e.totalVND)}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>

                        {/* Footer → Finance / M5 */}
                        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.10)" }}>
                            <Building2 style={{ width: 14, height: 14, color: "#71717A" }} />
                            <span style={{ fontSize: 11, color: "#71717A" }}>Tab <b style={{ color: "#A1A1AA" }}>Finance</b> — Revenue Overview + công nợ theo khách (cùng kỳ, cùng đơn vị tiền). Bản Giao diện 2 (M5) đang dựng — tạm xem ở <Link href={data.financeHref} style={{ color: "#A5B4FC", textDecoration: "none" }}>Giao diện 1 · Tài chính ↗</Link>.</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function KpiBig({ glow, icon, iconBg, iconBd, iconCol, label, value, sub, subNode }: {
    glow: string; icon: ReactNode; iconBg: string; iconBd: string; iconCol: string
    label: string; value: string; sub?: string; subNode?: ReactNode
}) {
    return (
        <div style={{ position: "relative", overflow: "hidden", borderRadius: 20, background: "rgba(24,24,27,0.60)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 24px 60px rgba(0,0,0,0.45)", padding: 18, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ position: "absolute", top: -40, right: -40, width: 130, height: 130, borderRadius: 999, background: glow, filter: "blur(28px)", pointerEvents: "none" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#A1A1AA", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
                <span style={{ width: 30, height: 30, borderRadius: 10, background: iconBg, border: `1px solid ${iconBd}`, display: "flex", alignItems: "center", justifyContent: "center", color: iconCol }}>{icon}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{value}</div>
            {subNode ? subNode : <span style={{ fontSize: 11, color: "#71717A" }}>{sub}</span>}
        </div>
    )
}
