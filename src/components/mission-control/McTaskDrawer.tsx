"use client"

// [Giao diện 2 · Mission Control · M3 Task Drawer] MC-styled task detail drawer.
// Ported from design "MÀN 3 — TASK DRAWER". Rendered by /[workspaceId]/mc/task/[taskId]
// over a static blurred backdrop (the design itself shows a blurred skeleton board behind).
// Data comes from loadTaskDetail (server-sanitized, money stripped for non-admins; MC is
// admin-gated anyway). Status changes reuse the real updateTaskStatus (admin FSM is open).
// [M19 Sửa task — hướng kết hợp] Quick status-change lives IN this drawer (below); full field
// editing (deadline, người làm, Giá khách $, Thù lao ₫, loại, người quản lý, brief, tài nguyên,
// Hook Map, ghi chú) reuses the vetted full editor at /[workspaceId]/task/[taskId] (TaskDetailRoute)
// via fullEditHref — that surface ALONE enforces money-sanitize + payroll-field lock + audit log, so
// money editing is never rebuilt here. A prominent "Sửa đầy đủ" CTA opens it with data prefilled.
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Pencil, X, ChevronLeft, ChevronRight, Check, Send, SearchCheck, AlarmClock, Flag,
    Package, CheckCircle2, Calendar, Link2, Undo2, ArrowRightLeft, Archive, Play, ChevronDown,
    PanelsTopLeft, ArrowRight, UploadCloud, Loader2, Clapperboard, MessageSquare,
} from "lucide-react"
import { updateTaskStatus } from "@/actions/task-actions"
import { Pressable, Reveal } from "./motion-kit"

/** [Review 2026-07-14] Real deliverable state for the drawer's player area (was a static mock). */
export interface McReviewAsset {
    assetId: string
    name: string
    versionNumber: number | null
    /** Head version is READY on Mux → playable in /mc/asset/[id]. */
    ready: boolean
    /** Head version still uploading/processing on Mux. */
    processing: boolean
    posterUrl: string | null
    unresolved: number
}

export interface McTaskDetail {
    id: string; code: string; title: string; type: string; tags: string[]
    status: string; statusHex: string; statusLabel: string; phaseIndex: number
    client: string | null
    assignee: { name: string; initials: string; avatar: string; rank?: string; rankColor?: string } | null
    managerName: string | null
    assignedByName: string | null
    deadline: string | null
    wageVND: number
    productLink: string | null
    rawFootageLink: string | null
    createdAt: string; updatedAt: string
    review: McReviewAsset[]
}

const STATUS_HEX: Record<string, string> = {
    'Đang đợi giao': '#A855F7', 'Nhận task': '#3B82F6', 'Đã nhận task': '#3B82F6', 'Đang thực hiện': '#EAB308',
    'Đã nộp video (nội bộ)': '#6366F1', 'Đang sửa feedback (nội bộ)': '#F59E0B', 'Đã sửa feedback (nội bộ)': '#14B8A6', 'Revision': '#EF4444',
    'Đã gửi video (khách)': '#06B6D4', 'Đã nhận feedback (khách)': '#EF4444', 'Đã sửa feedback (khách)': '#8B5CF6',
    'Quá hạn': '#DC2626', 'Hoàn tất': '#10B981', 'Đã hủy': '#52525B',
}
const STATUS_LABEL: Record<string, string> = { Revision: 'Sửa lại' }
const STATUS_GROUPS: { phase: string; items: string[] }[] = [
    { phase: 'Sản xuất', items: ['Đang đợi giao', 'Nhận task', 'Đã nhận task', 'Đang thực hiện'] },
    { phase: 'Duyệt nội bộ', items: ['Đã nộp video (nội bộ)', 'Đang sửa feedback (nội bộ)', 'Đã sửa feedback (nội bộ)', 'Revision'] },
    { phase: 'Khách duyệt', items: ['Đã gửi video (khách)', 'Đã nhận feedback (khách)', 'Đã sửa feedback (khách)'] },
    { phase: 'Kết thúc', items: ['Quá hạn', 'Hoàn tất', 'Đã hủy'] },
]
const STEPS = [
    { label: 'Đã giao task', icon: Check }, { label: 'Đang làm', icon: Check }, { label: 'Duyệt nội bộ', icon: SearchCheck },
    { label: 'Khách duyệt', icon: Send }, { label: 'Quá hạn', icon: AlarmClock }, { label: 'Hoàn tất', icon: Flag },
]

function fmtVND(n: number): string { return Math.round(n).toLocaleString("vi-VN") }
// Per-client dot color (frame gives the client meta row a colored swatch).
const CLIENT_DOTS = [
    "linear-gradient(135deg,#F43F5E,#EC4899)", "linear-gradient(135deg,#06B6D4,#3B82F6)", "linear-gradient(135deg,#F59E0B,#EAB308)",
    "linear-gradient(135deg,#10B981,#06B6D4)", "linear-gradient(135deg,#A855F7,#EC4899)", "linear-gradient(135deg,#6366F1,#8B5CF6)",
]
function clientDot(seed: string): string { let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0; return CLIENT_DOTS[h % CLIENT_DOTS.length] }

export default function McTaskDrawer({ detail, workspaceId, fullEditHref, overlay = false, onClose, onChanged }: {
    detail: McTaskDetail; workspaceId: string; fullEditHref: string
    /** [Review 2026-07-14] true = rendered in-place over the REAL board (dim backdrop, no fake
     *  skeleton); false = the /mc/task/[id] deep-link page (keeps the design's static backdrop). */
    overlay?: boolean
    onClose?: () => void
    /** Called after a successful mutation so an overlay host can re-fetch the drawer data. */
    onChanged?: () => void
}) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [statusMenu, setStatusMenu] = useState(false)

    const close = () => { if (onClose) onClose(); else router.back() }
    // Esc closes — both overlay and deep-link modes. If the status dropdown is open,
    // Esc dismisses just the menu first (mirror via ref so the listener stays stable).
    const statusMenuRef = useRef(false)
    useEffect(() => { statusMenuRef.current = statusMenu }, [statusMenu])
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return
            if (statusMenuRef.current) { setStatusMenu(false); return }
            close()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    const changeStatus = (newStatus: string) => {
        if (newStatus === detail.status) { setStatusMenu(false); return }
        startTransition(async () => {
            const res = await updateTaskStatus(detail.id, newStatus, workspaceId)
            if (res?.error) { toast.error(res.error); return }
            toast.success(`Đã chuyển sang “${STATUS_LABEL[newStatus] || newStatus}”`)
            setStatusMenu(false)
            router.refresh()
            onChanged?.()
        })
    }

    const inInternalReview = detail.phaseIndex === 2
    const Row = ({ label, children }: { label: string; children: ReactNode }) => (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "#71717A" }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#D4D4D8", textAlign: "right", minWidth: 0 }}>{children}</span>
        </div>
    )

    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: overlay ? "transparent" : "#050505", color: "#F4F4F5", fontFamily: '"Plus Jakarta Sans", -apple-system, "Segoe UI", system-ui, sans-serif' }}>
            {/* Backdrop: overlay mode dims the REAL board behind (owner's ask — the board must not
                disappear); deep-link mode keeps the design's static skeleton. Click closes. */}
            {overlay ? (
                <button type="button" onClick={close} aria-label="Đóng" style={{ position: "absolute", inset: 0, border: "none", cursor: "pointer", padding: 0, background: "rgba(3,3,4,0.66)", backdropFilter: "blur(4px)" }} />
            ) : (
                <button type="button" onClick={close} aria-label="Đóng" style={{ position: "absolute", inset: 0, border: "none", cursor: "pointer", padding: 0,
                    background: "radial-gradient(900px 600px at 12% -10%, rgba(99,102,241,0.10), transparent 60%),radial-gradient(800px 600px at 100% 110%, rgba(168,85,247,0.10), transparent 60%)" }}>
                    <div style={{ position: "absolute", inset: 0, display: "flex", gap: 12, padding: "80px 24px 24px 88px", opacity: 0.22, filter: "blur(2px)", pointerEvents: "none" }}>
                        {[0, 1, 2].map((i) => (
                            <div key={i} style={{ flex: 1, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                                <div style={{ height: 10, borderRadius: 5, background: "rgba(255,255,255,0.08)", width: "55%" }} />
                                <div style={{ height: 64, borderRadius: 12, background: "rgba(24,24,27,0.6)", border: "1px solid rgba(255,255,255,0.06)" }} />
                                <div style={{ height: 64, borderRadius: 12, background: "rgba(24,24,27,0.6)", border: "1px solid rgba(255,255,255,0.06)" }} />
                            </div>
                        ))}
                    </div>
                </button>
            )}

            {/* Drawer */}
            <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 780, maxWidth: "100%", background: "rgba(10,10,10,0.94)", backdropFilter: "blur(24px)", borderLeft: "1px solid rgba(255,255,255,0.10)", boxShadow: "-24px 0 60px rgba(0,0,0,0.65)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: 999, background: "rgba(99,102,241,0.07)", filter: "blur(40px)", pointerEvents: "none" }} />

                {/* Header */}
                <Reveal style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "18px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
                        <span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 10, letterSpacing: "0.16em", color: "#71717A" }}>{detail.code} · {detail.type.toUpperCase()}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", color: "#FFFFFF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail.title}</span>
                            <Link href={fullEditHref} title="Sửa đầy đủ"><Pencil style={{ width: 13, height: 13, color: "#52525B" }} /></Link>
                        </span>
                    </div>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: `${detail.statusHex}1a`, color: detail.statusHex, border: `1px solid ${detail.statusHex}4d`, whiteSpace: "nowrap" }}>
                        <span style={{ width: 6, height: 6, borderRadius: 999, background: detail.statusHex }} />{detail.statusLabel}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#71717A" }}>
                        <span style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.5 }}><ChevronLeft style={{ width: 14, height: 14 }} /></span>
                        <span style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.5 }}><ChevronRight style={{ width: 14, height: 14 }} /></span>
                        <Pressable type="button" onClick={close} title="Đóng (Esc)" style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", color: "#A1A1AA", cursor: "pointer" }}><X style={{ width: 14, height: 14 }} /></Pressable>
                    </div>
                </Reveal>

                {/* Stepper */}
                <div style={{ flexShrink: 0, display: "flex", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    {STEPS.map((s, i) => {
                        const done = detail.phaseIndex > i
                        const active = detail.phaseIndex === i
                        const Icon = s.icon
                        const color = done ? "#34D399" : active ? "#A5B4FC" : "#71717A"
                        const bg = done ? "rgba(16,185,129,0.15)" : active ? "rgba(99,102,241,0.22)" : "rgba(255,255,255,0.03)"
                        const bd = done ? "1px solid rgba(16,185,129,0.4)" : active ? "1px solid rgba(99,102,241,0.55)" : "1px solid rgba(255,255,255,0.10)"
                        // "Quá hạn" is an exception branch — render it red/dashed with a caption when not reached.
                        const overdueStep = s.label === "Quá hạn" && !done && !active
                        const nodeColor = overdueStep ? "#F87171" : color
                        const nodeBg = overdueStep ? "rgba(220,38,38,0.10)" : bg
                        const nodeBd = overdueStep ? "1.5px dashed rgba(220,38,38,0.45)" : bd
                        return (
                            <div key={s.label} style={{ display: "contents" }}>
                                {i > 0 && <div style={{ flex: 1, height: 2, background: detail.phaseIndex >= i ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.08)" }} />}
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 92 }}>
                                    <span style={{ width: active ? 30 : 24, height: active ? 30 : 24, borderRadius: 999, background: nodeBg, border: nodeBd, display: "flex", alignItems: "center", justifyContent: "center", color: nodeColor, boxShadow: active ? "0 0 18px rgba(99,102,241,0.35)" : "none" }}><Icon style={{ width: active ? 14 : 12, height: active ? 14 : 12 }} /></span>
                                    <span style={{ fontSize: 10, fontWeight: active ? 800 : 700, color: nodeColor, whiteSpace: "nowrap" }}>{s.label}</span>
                                    {overdueStep && <span style={{ fontSize: 8, color: "#71717A", whiteSpace: "nowrap" }}>khi trễ deadline</span>}
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Body */}
                <div style={{ flex: 1, display: "flex", gap: 20, padding: "20px 24px", minHeight: 0, overflowY: "auto" }}>
                    {/* Left */}
                    <div style={{ flex: 1.35, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
                        {/* [Review 2026-07-14] REAL review states (was a static mock with a fake Play):
                            ready → poster + play → the real M11 player (/mc/asset/[id]);
                            processing → notice; none → upload CTA (vetted upload tray in the full editor). */}
                        {detail.review.length > 0 ? (() => {
                            const a = detail.review[0]
                            const playerHref = `/${workspaceId}/mc/asset/${a.assetId}`
                            if (a.ready) {
                                return (
                                    <Link href={playerHref} title="Mở trình xem review" style={{ position: "relative", aspectRatio: "16/9", borderRadius: 14, background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", textDecoration: "none" }}>
                                        {a.posterUrl
                                            ? <img src={a.posterUrl} alt={a.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.85 }} />
                                            : <div style={{ position: "absolute", inset: 0, background: "radial-gradient(300px 200px at 50% 50%, rgba(99,102,241,0.12), transparent 70%)" }} />}
                                        <span style={{ position: "relative", width: 52, height: 52, borderRadius: 999, background: "rgba(99,102,241,0.92)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: "0 0 32px rgba(99,102,241,0.55)" }}><Play style={{ width: 22, height: 22 }} /></span>
                                        <span style={{ position: "absolute", top: 10, left: 12, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 700, color: "#C7D2FE", background: "rgba(10,10,10,0.65)", border: "1px solid rgba(99,102,241,0.40)", padding: "4px 10px", borderRadius: 999 }}>
                                            <Clapperboard style={{ width: 11, height: 11 }} />{a.name}{a.versionNumber ? ` · V${a.versionNumber}` : ""}
                                        </span>
                                        {a.unresolved > 0 && (
                                            <span style={{ position: "absolute", top: 10, right: 12, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 800, color: "#FCD34D", background: "rgba(120,53,15,0.55)", border: "1px solid rgba(245,158,11,0.45)", padding: "4px 9px", borderRadius: 999 }}>
                                                <MessageSquare style={{ width: 11, height: 11 }} />{a.unresolved} chưa xử lý
                                            </span>
                                        )}
                                    </Link>
                                )
                            }
                            if (a.processing) {
                                return (
                                    <div style={{ position: "relative", aspectRatio: "16/9", borderRadius: 14, background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: 8, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                                        <Loader2 style={{ width: 26, height: 26, color: "#A5B4FC", animation: "spin 1.2s linear infinite" }} />
                                        <span style={{ fontSize: 12, fontWeight: 600, color: "#A1A1AA" }}>Đang xử lý video{a.versionNumber ? ` (V${a.versionNumber})` : ""}… vài phút nữa xem được.</span>
                                        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                                    </div>
                                )
                            }
                            return (
                                <Link href={playerHref} style={{ position: "relative", aspectRatio: "16/9", borderRadius: 14, background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: 6, alignItems: "center", justifyContent: "center", overflow: "hidden", textDecoration: "none" }}>
                                    <Clapperboard style={{ width: 24, height: 24, color: "#71717A" }} />
                                    <span style={{ fontSize: 12, color: "#A1A1AA" }}>{a.name} — mở trang review để xem trạng thái</span>
                                </Link>
                            )
                        })() : (
                            /* Chưa có video — dropzone-style CTA về form đầy đủ (Upload Tray vetted ở đó). */
                            <Link href={fullEditHref} title="Tải video review lên" style={{ position: "relative", aspectRatio: "16/9", borderRadius: 14, background: "rgba(99,102,241,0.03)", border: "1.5px dashed rgba(99,102,241,0.35)", display: "flex", flexDirection: "column", gap: 8, alignItems: "center", justifyContent: "center", overflow: "hidden", textDecoration: "none" }}>
                                <span style={{ width: 46, height: 46, borderRadius: 999, background: "rgba(99,102,241,0.14)", border: "1px solid rgba(99,102,241,0.35)", display: "flex", alignItems: "center", justifyContent: "center", color: "#A5B4FC" }}><UploadCloud style={{ width: 20, height: 20 }} /></span>
                                <span style={{ fontSize: 13, fontWeight: 700, color: "#C7D2FE" }}>Chưa có video review — Tải video lên</span>
                                <span style={{ fontSize: 11, color: "#71717A" }}>mở form đầy đủ để kéo thả / tải bản dựng ▸</span>
                            </Link>
                        )}
                        {/* Deliverable phụ (task nhiều video) */}
                        {detail.review.length > 1 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {detail.review.slice(1).map((a) => (
                                    <Link key={a.assetId} href={`/${workspaceId}/mc/asset/${a.assetId}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", textDecoration: "none" }}>
                                        <Play style={{ width: 12, height: 12, color: a.ready ? "#A5B4FC" : "#52525B", flexShrink: 0 }} />
                                        <span style={{ flex: 1, fontSize: 11.5, color: "#D4D4D8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}{a.versionNumber ? ` · V${a.versionNumber}` : ""}</span>
                                        {a.processing && <span style={{ fontSize: 10, color: "#FBBF24" }}>đang xử lý…</span>}
                                        {a.unresolved > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: "#FCD34D" }}>{a.unresolved}💬</span>}
                                    </Link>
                                ))}
                            </div>
                        )}
                        {(detail.productLink || detail.rawFootageLink) && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, borderRadius: 12, background: "rgba(24,24,27,0.50)", border: "1px solid rgba(255,255,255,0.06)", padding: "10px 12px" }}>
                                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#71717A" }}>Bàn giao & tài nguyên</span>
                                {detail.productLink && (
                                    <a href={detail.productLink} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 9, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", textDecoration: "none" }}>
                                        <Package style={{ width: 12, height: 12, color: "#A5B4FC" }} />
                                        <span style={{ flex: 1, fontSize: 11, color: "#D4D4D8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{detail.productLink}</span>
                                    </a>
                                )}
                                {detail.rawFootageLink && (
                                    <a href={detail.rawFootageLink} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 9, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", textDecoration: "none" }}>
                                        <Link2 style={{ width: 12, height: 12, color: "#A5B4FC" }} />
                                        <span style={{ flex: 1, fontSize: 11, color: "#D4D4D8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Raw footage · {detail.rawFootageLink}</span>
                                    </a>
                                )}
                            </div>
                        )}
                        {/* Discussion bridge (full thread + composer live in the Giao diện 1 editor for now) */}
                        <Link href={fullEditHref} style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 14, background: "rgba(24,24,27,0.50)", border: "1px solid rgba(255,255,255,0.06)", padding: "14px", textDecoration: "none", color: "#A5B4FC", fontSize: 12, fontWeight: 600 }}>
                            <CheckCircle2 style={{ width: 15, height: 15 }} />
                            <span style={{ flex: 1 }}>Thảo luận, feedback theo timecode & nộp bản dựng</span>
                            <span style={{ fontSize: 11, color: "#71717A" }}>mở đầy đủ ▸</span>
                        </Link>
                    </div>

                    {/* Right */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10, borderRadius: 14, background: "rgba(24,24,27,0.50)", border: "1px solid rgba(255,255,255,0.06)", padding: 14 }}>
                            {detail.client && <Row label="Client"><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 13, height: 13, borderRadius: 999, background: clientDot(detail.client), flexShrink: 0 }} />{detail.client}</span></Row>}
                            <Row label="Người làm">
                                {detail.assignee ? (
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                        <span style={{ width: 18, height: 18, borderRadius: 999, background: detail.assignee.avatar, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, color: "#fff" }}>{detail.assignee.initials}</span>
                                        {detail.assignee.name}
                                        {detail.assignee.rank && <span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 9, fontWeight: 800, color: detail.assignee.rankColor, border: `1px solid ${detail.assignee.rankColor}66`, borderRadius: 4, padding: "0 4px" }}>{detail.assignee.rank}</span>}
                                    </span>
                                ) : <span style={{ color: "#71717A" }}>Chưa giao</span>}
                            </Row>
                            {detail.managerName && <Row label="Người quản lý">{detail.managerName}</Row>}
                            <Row label="Deadline"><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Calendar style={{ width: 12, height: 12, color: "#71717A" }} />{detail.deadline || "—"}</span></Row>
                            <Row label="Giá task"><span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontWeight: 700, color: "#F4F4F5" }}>{detail.wageVND > 0 ? `${fmtVND(detail.wageVND)} đ` : "—"}</span></Row>
                            <Row label="Type · Tags">
                                <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(56,189,248,0.10)", color: "#38BDF8" }}>{detail.type}</span>
                                    {detail.tags.map((t) => <span key={t} style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.04)", color: "#A1A1AA", border: "1px solid rgba(255,255,255,0.08)" }}>{t}</span>)}
                                </span>
                            </Row>
                        </div>

                        {/* [M19] Prominent "Sửa đầy đủ" — opens the vetted full editor (TaskDetailRoute)
                            with data prefilled. All field edits — incl. the money fields shown above as
                            read-only — happen there, where money-sanitize / payroll-lock / audit are enforced. */}
                        <Link href={fullEditHref} title="Mở form đầy đủ với dữ liệu điền sẵn" style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 12, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.20)", textDecoration: "none" }}>
                            <PanelsTopLeft style={{ width: 15, height: 15, color: "#A5B4FC", flexShrink: 0 }} />
                            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#C7D2FE" }}>Sửa đầy đủ — deadline, người làm, giá, brief, tài nguyên, Hook Map</span>
                                <span style={{ fontSize: 10, color: "#71717A" }}>mở form lớn với dữ liệu điền sẵn · mọi thay đổi ghi Nhật ký hoạt động</span>
                            </div>
                            <ArrowRight style={{ width: 14, height: 14, color: "#A5B4FC", flexShrink: 0 }} />
                        </Link>

                        {/* Status action card */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, borderRadius: 14, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.20)", padding: 14, position: "relative" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#A5B4FC" }}>{inInternalReview ? "Việc của bạn bây giờ" : "Chuyển trạng thái"}</span>
                            {inInternalReview && <span style={{ fontSize: 11, color: "#A1A1AA", lineHeight: 1.4 }}>Xem bản dựng rồi quyết định: gửi khách hay yêu cầu sửa thêm vòng nữa.</span>}
                            {inInternalReview && (
                                <>
                                    <Pressable type="button" disabled={pending} onClick={() => changeStatus("Đã gửi video (khách)")} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 10, borderRadius: 10, background: "#6366F1", color: "#fff", fontSize: 13, fontWeight: 700, border: "none", boxShadow: "0 0 24px rgba(99,102,241,0.35)", cursor: pending ? "wait" : "pointer" }}><Send style={{ width: 15, height: 15 }} />Duyệt & gửi khách</Pressable>
                                    <Pressable type="button" disabled={pending} onClick={() => changeStatus("Đang sửa feedback (nội bộ)")} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", color: "#D4D4D8", fontSize: 13, fontWeight: 700, cursor: pending ? "wait" : "pointer" }}><Undo2 style={{ width: 15, height: 15 }} />Yêu cầu sửa (nội bộ)</Pressable>
                                </>
                            )}
                            {/* Full status dropdown */}
                            <Pressable type="button" onClick={() => setStatusMenu((v) => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 10px", borderRadius: 9, background: "transparent", border: "1px solid rgba(255,255,255,0.08)", color: "#A1A1AA", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                                Chọn trạng thái khác<ChevronDown style={{ width: 13, height: 13, transform: statusMenu ? "rotate(180deg)" : "none" }} />
                            </Pressable>
                            {statusMenu && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 2 }}>
                                    {STATUS_GROUPS.map((g) => (
                                        <div key={g.phase} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#52525B" }}>{g.phase}</span>
                                            {g.items.map((s) => {
                                                const hex = STATUS_HEX[s] || "#A1A1AA"
                                                const cur = s === detail.status
                                                return (
                                                    <Pressable key={s} type="button" disabled={pending || cur} onClick={() => changeStatus(s)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, textAlign: "left", background: cur ? "rgba(99,102,241,0.12)" : "transparent", border: cur ? "1px solid rgba(99,102,241,0.30)" : "1px solid transparent", color: "#D4D4D8", fontSize: 11, fontWeight: 600, cursor: cur ? "default" : "pointer" }}>
                                                        <span style={{ width: 7, height: 7, borderRadius: 999, background: hex, flexShrink: 0 }} />
                                                        {STATUS_LABEL[s] || s}
                                                        {cur && <Check style={{ width: 12, height: 12, marginLeft: "auto", color: "#A5B4FC" }} />}
                                                    </Pressable>
                                                )
                                            })}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Mini history */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, borderRadius: 14, background: "rgba(24,24,27,0.50)", border: "1px solid rgba(255,255,255,0.06)", padding: 14 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#71717A" }}>Mốc thời gian</span>
                            {detail.assignedByName && <HistRow hex="#3B82F6"><b style={{ color: "#D4D4D8" }}>{detail.assignedByName}</b> giao task</HistRow>}
                            <HistRow hex="#6366F1">Cập nhật gần nhất · {detail.updatedAt}</HistRow>
                            <HistRow hex="#52525B">Tạo lúc · {detail.createdAt}</HistRow>
                        </div>

                        {/* Footer actions */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto" }}>
                            <Link href={fullEditHref} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "#A5B4FC", padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(99,102,241,0.30)", background: "rgba(99,102,241,0.08)", textDecoration: "none" }}><Pencil style={{ width: 12, height: 12 }} />Sửa đầy đủ</Link>
                            <Link href={fullEditHref} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "#71717A", padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", textDecoration: "none" }}><ArrowRightLeft style={{ width: 12, height: 12 }} />Giao lại</Link>
                            <div style={{ flex: 1 }} />
                            <Link href={fullEditHref} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "#F87171", padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.20)", textDecoration: "none" }}><Archive style={{ width: 12, height: 12 }} />Hủy / lưu trữ</Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function HistRow({ hex, children }: { hex: string; children: ReactNode }) {
    return (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: hex, marginTop: 5, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "#A1A1AA", lineHeight: 1.5 }}>{children}</span>
        </div>
    )
}
