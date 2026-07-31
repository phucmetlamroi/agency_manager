"use client"

// [Giao diện 2 · Mission Control · M2 Kho Task Đợi / Triage] Desktop giao-việc screen.
// Ported from the design's "MÀN 2 — HÀNG CHỜ (TRIAGE)". DATA-DRIVEN + functional:
//   • left column = tasks chờ giao (unassigned / "Đang đợi giao")
//   • click "Giao" → popover "Giao cho ai?" (search editors + rank + workload) → assignTask
//   • marketplace pill toggles the real Phiên Chợ (toggleMarketplace)
// Reuses the SAME server actions /admin uses (assignTask + toggleMarketplace). Admin-gated at the
// page level. Chốt còn lại trong assignTask là `isAssigneeInWorkspaceProfile` — nó hỏi người được
// giao có thuộc PROFILE (tổ chức) của workspace không, qua BẤT KỲ đường nào trong ba: User.profileId,
// ProfileAccess, hoặc WorkspaceMember. Nên đừng mô tả nó là "workspace membership" như chú thích cũ:
// nó KHÔNG đòi phải có hàng WorkspaceMember. (Bên MCP mới là `assertWorkspaceMember` đòi hàng đó thật.)
// Nó CÒN loại thẳng người có role CLIENT hoặc LOCKED, kể cả khi họ đúng profile — nên câu trợ giúp
// "chặn giao cho người ngoài tổ chức" bên dưới vẫn chưa kể hết: người bị chặn có thể đang ở trong.
// [GỠ THẺ ĐỎ 2026-07-31] Trước đây danh sách editor còn KHOÁ NÚT phía trình duyệt khi rank === 'D'
// (`blocked`), song song với chốt server. Cả hai đã bị gỡ. Rank vẫn hiện dưới dạng nhãn S/A/B/C/D
// cạnh tên — nó là thông tin tham khảo cho người giao việc, không còn là hàng rào.
import { useState, useTransition, useMemo, type CSSProperties } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    LayoutDashboard, ListTodo, Inbox, Clapperboard, CalendarDays, Wallet, Building2,
    Search, Store, Filter, GripVertical, Calendar, Link2, UserPlus, ShieldOff, UserX, CornerDownRight,
} from "lucide-react"
import { assignTask } from "@/actions/task-management-actions"
import { toggleMarketplace } from "@/actions/claim-actions"
import McBackLink from "./McBackLink"
import { Pressable, Reveal, RevealGroup, RevealItem } from "./motion-kit"

export interface McQueueEditor {
    id: string; name: string; initials: string; avatar: string
    rank?: string; rankColor?: string
    workingCount: number; workloadPct: number
}
export interface McQueueTask {
    id: string; title: string; desc: string
    type: string; typeHue: string
    deadline: string; priceVND: number; hasRaw: boolean; hasAssignee: boolean
}
export interface McQueueData {
    workspaceId: string; backHref: string; workspaceName: string
    waiting: McQueueTask[]; waitingTotal: number
    counts: { short: number; long: number; trial: number }
    producing: number; internalReview: number
    editors: McQueueEditor[]
    marketplaceOpen: boolean
}

const RAIL: { icon: typeof ListTodo; active?: boolean; href?: string; badge?: number; divider?: boolean }[] = [
    { icon: LayoutDashboard, href: "MC" }, { icon: ListTodo, active: true }, { icon: Inbox, href: "REQ" },
    { icon: Clapperboard, href: "TEP" }, { icon: CalendarDays, href: "LICH" }, { icon: Wallet, href: "TIEN", divider: true }, { icon: Building2 },
]

function fmtVND(n: number): string { return Math.round(n).toLocaleString("vi-VN") }

function barColor(pct: number): string { return pct < 60 ? "#34D399" : pct < 85 ? "#FBBF24" : "#F87171" }
function loadLabel(pct: number): string { return pct < 40 ? "còn rảnh" : pct < 85 ? "bình thường" : "gần đầy tải" }

export default function McQueueBoard({ data }: { data: McQueueData }) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [assigningId, setAssigningId] = useState<string | null>(null)
    const [search, setSearch] = useState("")
    const [mktOpen, setMktOpen] = useState(data.marketplaceOpen)

    const assigningTask = data.waiting.find((t) => t.id === assigningId) || null

    const filteredEditors = useMemo(() => {
        const q = search.trim().toLowerCase()
        const list = q ? data.editors.filter((e) => e.name.toLowerCase().includes(q)) : data.editors
        return [...list].sort((a, b) => a.workingCount - b.workingCount)
    }, [data.editors, search])

    const doAssign = (taskId: string, assignmentId: string | null, editorName?: string) => {
        startTransition(async () => {
            const res = await assignTask(taskId, assignmentId, data.workspaceId)
            if (res?.error) { toast.error(res.error); return }
            toast.success(
                assignmentId === "sys:revoke" || assignmentId === null
                    ? "Đã thu hồi task về hàng chờ"
                    : `Đã giao cho ${editorName || "editor"}`,
            )
            setAssigningId(null); setSearch("")
            router.refresh()
        })
    }

    const doToggleMarket = () => {
        const next = !mktOpen
        setMktOpen(next) // optimistic
        startTransition(async () => {
            const res = await toggleMarketplace(data.workspaceId)
            if (res?.error) { setMktOpen(!next); toast.error(res.error); return }
            toast.success(next ? "Phiên chợ đã mở" : "Phiên chợ đã đóng")
            router.refresh()
        })
    }

    const railHref = (h?: string) =>
        h === "MC" ? `/${data.workspaceId}/mc`
            : h === "REQ" ? `/${data.workspaceId}/mc/requests`
                : h === "TIEN" ? `/${data.workspaceId}/mc/tien`
                    : h === "LICH" ? `/${data.workspaceId}/mc/lich`
                        : h === "TEP" ? `/${data.workspaceId}/mc/tep` : undefined

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
                        <Pressable as="div" style={{ position: "relative", width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: r.active ? "#A5B4FC" : "#A1A1AA", background: r.active ? "rgba(99,102,241,0.18)" : "transparent", border: r.active ? "1px solid rgba(99,102,241,0.30)" : "1px solid transparent", boxShadow: r.active ? "0 4px 16px rgba(99,102,241,0.15)" : "none" }}>
                            <Icon style={{ width: 18, height: 18 }} />
                        </Pressable>
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
                <Reveal style={{ height: 64, flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "0 24px", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(10,10,10,0.50)", backdropFilter: "blur(10px)" }}>
                    <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Inbox style={{ width: 18, height: 18, color: "#A5B4FC" }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.02em", color: "#F4F4F5" }}>Kho Task Đợi</span>
                        <span style={{ fontSize: 11, color: "#A1A1AA" }}>Chọn task → giao cho editor, hoặc bật Marketplace cho editor tự nhận</span>
                    </div>
                    <div style={{ flex: 1 }} />
                    {data.counts.short > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "rgba(56,189,248,0.10)", color: "#38BDF8" }}>Short form · {data.counts.short}</span>}
                    {data.counts.long > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "rgba(139,92,246,0.10)", color: "#A78BFA" }}>Long form · {data.counts.long}</span>}
                    {data.counts.trial > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "rgba(245,158,11,0.10)", color: "#FBBF24" }}>Trial · {data.counts.trial}</span>}
                    {/* Marketplace pill */}
                    <Pressable type="button" onClick={doToggleMarket} disabled={pending}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 999, cursor: pending ? "wait" : "pointer",
                            background: mktOpen ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.03)", border: mktOpen ? "1px solid rgba(16,185,129,0.30)" : "1px solid rgba(255,255,255,0.08)" }}>
                        <Store style={{ width: 14, height: 14, color: mktOpen ? "#34D399" : "#71717A" }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: mktOpen ? "#34D399" : "#A1A1AA" }}>{mktOpen ? "Marketplace mở" : "Marketplace đóng"}</span>
                        <span style={{ width: 30, height: 16, borderRadius: 999, background: mktOpen ? "rgba(16,185,129,0.35)" : "rgba(255,255,255,0.10)", position: "relative" }}>
                            <span style={{ position: "absolute", top: 2, [mktOpen ? "right" : "left"]: 2, width: 12, height: 12, borderRadius: 999, background: mktOpen ? "#34D399" : "#71717A", boxShadow: mktOpen ? "0 0 8px rgba(16,185,129,0.6)" : "none" } as CSSProperties} />
                        </span>
                    </Pressable>
                </Reveal>

                {/* Body — 3 columns */}
                <div style={{ flex: 1, display: "flex", gap: 12, padding: "16px 24px", minHeight: 0 }}>
                    {/* Chờ giao */}
                    <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(168,85,247,0.18)", borderRadius: 16, padding: 12, position: "relative", overflow: "hidden", minWidth: 0 }}>
                        <div style={{ position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: 999, background: "rgba(168,85,247,0.07)", filter: "blur(30px)", pointerEvents: "none" }} />
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 999, background: "#A855F7", boxShadow: "0 0 8px rgba(168,85,247,0.6)" }} />
                            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#D4D4D8" }}>Chờ giao — mở rộng</span>
                            <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 8px", borderRadius: 999, background: "rgba(168,85,247,0.15)", color: "#C084FC", border: "1px solid rgba(168,85,247,0.30)" }}>{data.waitingTotal}</span>
                            <div style={{ flex: 1 }} />
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#71717A" }}><Filter style={{ width: 12, height: 12 }} />chọn task → giao</span>
                        </div>
                        <RevealGroup style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", minHeight: 0 }}>
                            {data.waiting.length === 0 && (
                                <div style={{ textAlign: "center", fontSize: 12, color: "#52525B", padding: "28px 8px" }}>Kho trống — mọi task đã được giao.</div>
                            )}
                            {data.waiting.map((t) => {
                                const active = assigningId === t.id
                                return (
                                    <RevealItem key={t.id} whileHover={{ y: -4 }} style={{ display: "flex", flexDirection: "column", gap: 8, borderRadius: 12, background: active ? "rgba(24,24,27,0.85)" : "rgba(24,24,27,0.60)", backdropFilter: "blur(12px)", border: active ? "1px solid rgba(99,102,241,0.55)" : "1px solid rgba(255,255,255,0.06)", padding: 14, boxShadow: active ? "0 12px 32px rgba(0,0,0,0.55), 0 0 24px rgba(99,102,241,0.20)" : "none" }}>
                                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                                            <GripVertical style={{ width: 14, height: 14, color: "#52525B", marginTop: 2, flexShrink: 0 }} />
                                            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                                                <Link href={`/${data.workspaceId}/mc/task/${t.id}`} style={{ fontSize: 14, fontWeight: 700, color: "#F4F4F5", textDecoration: "none" }} title="Mở chi tiết task">{t.title}</Link>
                                                {t.desc && <span style={{ fontSize: 11, color: "#A1A1AA", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } as CSSProperties}>{t.desc}</span>}
                                            </div>
                                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: `${t.typeHue}1a`, color: t.typeHue, whiteSpace: "nowrap" }}>{t.type}</span>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 22 }}>
                                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#A1A1AA" }}><Calendar style={{ width: 12, height: 12 }} />{t.deadline}</span>
                                            {t.hasRaw && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#A1A1AA" }}><Link2 style={{ width: 12, height: 12 }} />Raw footage</span>}
                                            <div style={{ flex: 1 }} />
                                            <span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12, fontWeight: 700, color: t.priceVND > 0 ? "#F4F4F5" : "#71717A" }}>{t.priceVND > 0 ? `${fmtVND(t.priceVND)} đ` : "—"}</span>
                                            <Pressable type="button" onClick={() => { setAssigningId(active ? null : t.id); setSearch("") }}
                                                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "5px 11px", borderRadius: 999, cursor: "pointer",
                                                    background: active ? "#6366F1" : "rgba(99,102,241,0.12)", color: active ? "#fff" : "#A5B4FC", border: active ? "1px solid #6366F1" : "1px solid rgba(99,102,241,0.30)" }}>
                                                <UserPlus style={{ width: 12, height: 12 }} />{active ? "Đang giao…" : "Giao"}
                                            </Pressable>
                                        </div>
                                    </RevealItem>
                                )
                            })}
                        </RevealGroup>
                    </div>

                    {/* Sản xuất + popover giao */}
                    <div style={{ flex: 1.4, display: "flex", flexDirection: "column", gap: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, padding: 12, position: "relative", minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 999, background: "#EAB308" }} />
                            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#D4D4D8" }}>Sản xuất</span>
                            <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 8px", borderRadius: 999, background: "rgba(234,179,8,0.12)", color: "#FBBF24", border: "1px solid rgba(234,179,8,0.30)" }}>{data.producing}</span>
                        </div>

                        {!assigningTask ? (
                            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, textAlign: "center", padding: "0 12px" }}>
                                <CornerDownRight style={{ width: 22, height: 22, color: "#3F3F46" }} />
                                <span style={{ fontSize: 12, color: "#71717A", maxWidth: 200 }}>Chọn một task ở cột <b style={{ color: "#A1A1AA" }}>Chờ giao</b> rồi bấm <b style={{ color: "#A5B4FC" }}>Giao</b> để chọn editor.</span>
                            </div>
                        ) : (
                            <div style={{ borderRadius: 14, background: "rgba(10,10,10,0.92)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 24px 60px rgba(0,0,0,0.65)", padding: 12, display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#71717A" }}>Giao “{assigningTask.title}” cho ai?</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 9, background: "rgba(39,39,42,0.8)", border: "1px solid rgba(99,102,241,0.30)" }}>
                                    <Search style={{ width: 12, height: 12, color: "#71717A" }} />
                                    <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="gõ tên editor để lọc"
                                        style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#F4F4F5", fontSize: 12, fontWeight: 600 }} />
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", maxHeight: 260 }}>
                                    {filteredEditors.length === 0 && <span style={{ fontSize: 11, color: "#52525B", padding: "8px 4px", textAlign: "center" }}>Không có editor khớp.</span>}
                                    {filteredEditors.map((e) => (
                                        <Pressable key={e.id} type="button" disabled={pending} onClick={() => doAssign(assigningTask.id, e.id, e.name)}
                                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, textAlign: "left", cursor: "pointer",
                                                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                                            <span style={{ width: 28, height: 28, borderRadius: 999, background: e.avatar, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{e.initials}</span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: "#F4F4F5" }}>{e.name}</span>
                                                    {e.rank && <span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 9, fontWeight: 800, color: e.rankColor, border: `1px solid ${e.rankColor}66`, borderRadius: 4, padding: "0 4px" }}>{e.rank}</span>}
                                                </div>
                                                <div style={{ fontSize: 10, color: "#A1A1AA" }}>{`${e.workingCount} đang làm · ${loadLabel(e.workloadPct)}`}</div>
                                            </div>
                                            <div style={{ width: 54, height: 4, borderRadius: 999, background: "rgba(255,255,255,0.08)", flexShrink: 0 }}>
                                                <div style={{ width: `${e.workloadPct}%`, height: "100%", borderRadius: 999, background: barColor(e.workloadPct) }} />
                                            </div>
                                        </Pressable>
                                    ))}
                                </div>
                                <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "2px 4px" }} />
                                {assigningTask.hasAssignee && (
                                    <Pressable type="button" disabled={pending} onClick={() => doAssign(assigningTask.id, "sys:revoke")}
                                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 9, color: "#FBBF24", fontSize: 11, fontWeight: 600, background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                                        <ShieldOff style={{ width: 13, height: 13 }} />Thu hồi về System<span style={{ marginLeft: "auto", fontSize: 9, color: "#52525B" }}>gỡ người + xóa deadline</span>
                                    </Pressable>
                                )}
                                <Pressable type="button" onClick={() => { setAssigningId(null); setSearch("") }}
                                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 9, color: "#A1A1AA", fontSize: 11, fontWeight: 600, background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                                    <UserX style={{ width: 13, height: 13 }} />Đóng
                                </Pressable>
                                <div style={{ fontSize: 10, color: "#52525B", lineHeight: 1.5, padding: "0 4px" }}>Giao xong → task chuyển “Nhận task”, editor nhận thông báo. Server chặn giao cho người ngoài tổ chức.</div>
                                {mktOpen && (
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, border: "1px dashed rgba(16,185,129,0.35)", color: "#34D399" }}>
                                        <Store style={{ width: 14, height: 14 }} /><span style={{ fontSize: 11, fontWeight: 600 }}>Marketplace đang mở — editor cũng có thể tự nhận</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Ghost — Duyệt nội bộ */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, padding: 12, opacity: 0.38, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 999, background: "#6366F1" }} />
                            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#D4D4D8" }}>Duyệt nội bộ</span>
                            <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 8px", borderRadius: 999, background: "rgba(99,102,241,0.15)", color: "#A5B4FC" }}>{data.internalReview}</span>
                        </div>
                        {[80, 55, 70].map((w, i) => (
                            <div key={i} style={{ borderRadius: 12, background: "rgba(24,24,27,0.60)", border: "1px solid rgba(255,255,255,0.06)", padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                                <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.08)", width: `${w}%` }} />
                                <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)", width: `${w - 25}%` }} />
                            </div>
                        ))}
                        <span style={{ fontSize: 10, color: "#52525B", textAlign: "center", marginTop: "auto" }}>Xem đầy đủ ở Giao diện 2 · Tổng quan</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
