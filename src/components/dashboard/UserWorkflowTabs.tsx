"use client"

import { useState, useMemo, useEffect } from "react"
import { TaskWithUser } from "@/types/admin"
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal"
import { Search, Filter, ChevronLeft, ChevronRight, CalendarDays, MoreHorizontal } from "lucide-react"
import { formatClientHierarchy } from "@/lib/client-hierarchy"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTaskChatNotifications } from "@/hooks/useTaskChatNotifications"

// ─── Status colors per ui-ux-standards ────────────
const STATUS_COLORS: Record<string, { label: string; color: string }> = {
    "Nhận task":       { label: "Nhận task",       color: "#3B82F6" },
    "Đã nhận task":   { label: "Đã nhận task",   color: "#3B82F6" },
    "Đang đợi giao":   { label: "Đang đợi giao",   color: "#A855F7" },
    "Đang thực hiện":  { label: "Đang thực hiện",  color: "#EAB308" },
    "Revision":            { label: "Revision",            color: "#EF4444" },
    "Sửa frame":       { label: "Sửa frame",       color: "#EC4899" },
    "Gửi lại":       { label: "Gửi lại",       color: "#F97316" },
    "Tạm ngưng":    { label: "Tạm ngưng",    color: "#71717A" },
    "Hoàn tất":     { label: "Hoàn tất",     color: "#10B981" },
    "Quá hạn":      { label: "Quá hạn",      color: "#DC2626" },
    "Đã hủy":       { label: "Đã hủy",       color: "#52525B" },
}

// ─── Tabs config — matches Figma HOME-USER-VER-1.0 ─
type TabId = "assignee" | "progress" | "revise" | "complete"

interface TabConfig {
    id: TabId
    label: string
    statuses: string[]
    color: string
}

// Figma: 4 tabs only — Assignee | Progress | Revise | Complete
const TABS: TabConfig[] = [
    { id: "assignee", label: "Assignee", statuses: ["Nhận task", "Đã nhận task", "Đang đợi giao", "Tạm ngưng"], color: "#8B5CF6" },
    { id: "progress", label: "Progress", statuses: ["Đang thực hiện", "Quá hạn"],                                color: "#EAB308" },
    { id: "revise",   label: "Revise",   statuses: ["Revision", "Sửa frame", "Gửi lại"],                  color: "#F97316" },
    { id: "complete", label: "Complete", statuses: ["Hoàn tất"],                                                color: "#10B981" },
]

const PER_PAGE = 8

// ─── Palette ──────────────────────────────────────
const NP = {
    surface: "#0A0A0A",
    surfaceAlt: "#0E0B14",
    rowHover: "#211B31",
    border: "rgba(139,92,246,0.15)",
    borderSubtle: "rgba(139,92,246,0.10)",
    borderCell: "rgba(139,92,246,0.12)",
    accent: "#8B5CF6",
    accentGlow: "rgba(139,92,246,0.35)",
    textPrimary: "#FFFFFF",
    textSecondary: "#A1A1AA",
    textMuted: "#71717A",
    lilac: "#D8B4FE",
    pageActive: "rgba(139,92,246,0.20)",
    pageActiveBorder: "rgba(139,92,246,0.30)",
}

interface Props {
    tasks: TaskWithUser[]
    workspaceId: string
    /** Current user's ID — for showing assignee role label */
    currentUserId: string
}

/**
 * UserWorkflowTabs — user-scoped task tabs + table per Figma.
 *
 * - 4 tabs (no admin "Quá hạn" tab — overdue tasks roll into Progress).
 * - Search input listens to global event 'user-home-search' from UserHomeTopBar
 *   so the top-bar search field controls this table.
 * - Pagination: Back / numbered pages / Next.
 * - Row click → TaskDetailModal (read-only since user not admin).
 */
export default function UserWorkflowTabs({ tasks, workspaceId, currentUserId }: Props) {
    const [activeTab, setActiveTab] = useState<TabId>("assignee")
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const [selectedTask, setSelectedTask] = useState<TaskWithUser | null>(null)

    // External search event from UserHomeTopBar
    useEffect(() => {
        function handler(e: Event) {
            const detail = (e as CustomEvent<string>).detail || ""
            setSearch(detail)
            setPage(1)
        }
        window.addEventListener("user-home-search", handler as EventListener)
        return () => window.removeEventListener("user-home-search", handler as EventListener)
    }, [])

    const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks])
    const { unreadMap } = useTaskChatNotifications(taskIds)

    // ─── Filter ────────────────────────────────────
    const filtered = useMemo(() => {
        const tab = TABS.find((t) => t.id === activeTab)!
        let result = tasks.filter((t) => tab.statuses.includes(t.status))
        if (search.trim()) {
            const q = search.toLowerCase()
            result = result.filter(
                (t) =>
                    t.title.toLowerCase().includes(q) ||
                    (t.client?.name || "").toLowerCase().includes(q) ||
                    (t.client?.parent?.name || "").toLowerCase().includes(q),
            )
        }
        return result
    }, [tasks, activeTab, search])

    const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
    const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

    // ─── Tab counts ────────────────────────────────
    const tabCounts = useMemo(() => {
        const counts: Record<string, number> = {}
        TABS.forEach((tab) => {
            counts[tab.id] = tasks.filter((t) => tab.statuses.includes(t.status)).length
        })
        return counts
    }, [tasks])

    const getStatusInfo = (status: string) =>
        STATUS_COLORS[status] || { label: status, color: NP.textMuted }

    const formatDeadline = (deadline: Date | string | null) => {
        if (!deadline) return "No Limit"
        const d = new Date(deadline)
        return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" })
    }

    const getDeadlineColor = (deadline: Date | string | null, status: string) => {
        if (!deadline) return NP.textMuted
        if (status === "Hoàn tất") return NP.textSecondary
        const diff = (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60)
        if (diff <= 0) return "#EF4444"
        if (diff < 24) return "#EF4444"
        if (diff < 48) return "#FBBF24"
        return NP.textSecondary
    }

    const formatAmount = (task: TaskWithUser) => {
        const val = Number((task as any).price ?? task.value ?? 0)
        return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(val)
    }

    return (
        <div className="flex flex-col" style={{ gap: 16, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {/* ─── Tabs row ─── */}
            <div className="flex flex-wrap items-center" style={{ gap: 10 }}>
                {TABS.map((tab) => {
                    const isActive = activeTab === tab.id
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => {
                                setActiveTab(tab.id)
                                setPage(1)
                            }}
                            className="flex items-center transition-all duration-200"
                            style={{
                                gap: 8,
                                padding: "10px 20px",
                                borderRadius: 26,
                                background: isActive ? NP.accent : NP.surface,
                                border: `1px solid ${isActive ? NP.accent : NP.border}`,
                                color: isActive ? "#FFFFFF" : NP.textSecondary,
                                fontSize: 14,
                                fontWeight: 600,
                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                                cursor: "pointer",
                                boxShadow: isActive
                                    ? `0px 3.5px 1.8px rgba(0,0,0,0.25), 0 0 20px ${NP.accentGlow}`
                                    : "0px 3.5px 1.8px rgba(0,0,0,0.25)",
                            }}
                        >
                            <span
                                style={{
                                    width: 16,
                                    height: 16,
                                    borderRadius: "50%",
                                    background: isActive ? "#FFFFFF" : tab.color,
                                    flexShrink: 0,
                                    opacity: isActive ? 1 : 0.7,
                                }}
                            />
                            {tab.label}
                            <span
                                style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    background: isActive ? "rgba(255,255,255,0.20)" : "rgba(139,92,246,0.08)",
                                    color: isActive ? "#FFFFFF" : NP.textMuted,
                                }}
                            >
                                {tabCounts[tab.id]}
                            </span>
                        </button>
                    )
                })}
            </div>

            {/* ─── Search + View ─── */}
            <div className="flex items-center" style={{ gap: 10 }}>
                <div
                    className="flex-1 flex items-center"
                    style={{
                        gap: 10,
                        padding: "12px 18px",
                        borderRadius: 26,
                        background: NP.surface,
                        border: `1px solid ${NP.border}`,
                    }}
                >
                    <Search style={{ width: 16, height: 16, color: NP.textSecondary, flexShrink: 0 }} />
                    <input
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value)
                            setPage(1)
                        }}
                        placeholder="Search tasks…"
                        className="flex-1"
                        style={{
                            background: "transparent",
                            border: "none",
                            outline: "none",
                            color: NP.textPrimary,
                            fontSize: 14,
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                        }}
                    />
                </div>
                <button
                    type="button"
                    className="flex items-center transition-colors"
                    style={{
                        gap: 8,
                        padding: "12px 20px",
                        borderRadius: 26,
                        background: NP.accent,
                        border: "none",
                        color: "#FFFFFF",
                        fontSize: 14,
                        fontWeight: 600,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        cursor: "pointer",
                    }}
                >
                    View
                    <Filter style={{ width: 14, height: 14 }} />
                </button>
            </div>

            {/* ─── Task table ─── */}
            <div
                style={{
                    borderRadius: 26,
                    background: NP.surface,
                    border: `1px solid ${NP.border}`,
                    overflow: "hidden",
                }}
            >
                {/* Headers */}
                <div
                    className="items-center hidden md:grid"
                    style={{
                        gridTemplateColumns: "2.4fr 0.8fr 0.9fr 0.7fr 0.8fr 0.6fr 40px",
                        padding: "14px 20px",
                        borderBottom: `1px solid ${NP.borderSubtle}`,
                    }}
                >
                    {(["Task Name", "Type", "Assignee", "Deadline", "Status", "Role", ""] as const).map((h) => (
                        <span
                            key={h || "actions"}
                            style={{
                                fontSize: 14,
                                fontWeight: 500,
                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                                color: NP.textSecondary,
                            }}
                        >
                            {h}
                        </span>
                    ))}
                </div>

                {/* Rows */}
                {paged.length === 0 && (
                    <div
                        style={{
                            padding: "40px 20px",
                            textAlign: "center",
                            color: NP.textMuted,
                            fontSize: 14,
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                        }}
                    >
                        No tasks here yet.
                    </div>
                )}

                {paged.map((task, idx) => {
                    const s = getStatusInfo(task.status)
                    const dlColor = getDeadlineColor(task.deadline, task.status)
                    const clientLabel = formatClientHierarchy(task.client)
                    const isOddRow = idx % 2 === 1
                    const role = task.assigneeId === currentUserId ? "Assignee" : (task.assignee?.username ? "Member" : "Unassigned")

                    return (
                        <div
                            key={task.id}
                            className="relative transition-colors duration-150 cursor-pointer"
                            style={{
                                display: "grid",
                                gridTemplateColumns: "2.4fr 0.8fr 0.9fr 0.7fr 0.8fr 0.6fr 40px",
                                padding: "16px 20px",
                                borderBottom: `1px solid ${NP.borderSubtle}`,
                                alignItems: "center",
                                background: isOddRow ? NP.surfaceAlt : NP.surface,
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = NP.rowHover
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = isOddRow ? NP.surfaceAlt : NP.surface
                            }}
                            onClick={() => setSelectedTask(task)}
                        >
                            {/* Task Name */}
                            <div className="min-w-0">
                                <div
                                    style={{
                                        display: "inline-flex",
                                        flexDirection: "column",
                                        padding: "6px 12px",
                                        borderRadius: 14,
                                        border: `1px solid ${NP.borderCell}`,
                                        maxWidth: "100%",
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 14,
                                            fontWeight: 700,
                                            color: NP.textPrimary,
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                                        }}
                                    >
                                        {task.title}
                                        {(unreadMap[task.id] ?? 0) > 0 && (
                                            <span className="inline-block w-2 h-2 rounded-full bg-violet-500 animate-pulse ml-2" />
                                        )}
                                    </span>
                                    {clientLabel && (
                                        <span
                                            style={{
                                                fontSize: 12,
                                                fontWeight: 500,
                                                color: NP.textSecondary,
                                                marginTop: 1,
                                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                                            }}
                                        >
                                            {clientLabel}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Type */}
                            <span
                                style={{
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: NP.textSecondary,
                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                }}
                            >
                                {task.type || "Task"}
                            </span>

                            {/* Assignee */}
                            <span
                                style={{
                                    fontSize: 13,
                                    color: NP.textPrimary,
                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                }}
                            >
                                {task.assignee?.username || "—"}
                            </span>

                            {/* Deadline */}
                            <span
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    fontSize: 13,
                                    fontWeight: dlColor === "#EF4444" ? 700 : 500,
                                    color: dlColor,
                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                }}
                            >
                                <CalendarDays className="w-3 h-3" style={{ color: NP.textMuted }} />
                                {formatDeadline(task.deadline)}
                            </span>

                            {/* Status pill */}
                            <span
                                className="inline-flex items-center"
                                style={{
                                    gap: 5,
                                    padding: "5px 10px",
                                    borderRadius: 14,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    border: `1px solid ${NP.borderCell}`,
                                    background: "transparent",
                                    color: s.color,
                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                }}
                            >
                                <span
                                    style={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: "50%",
                                        background: s.color,
                                    }}
                                />
                                {s.label}
                            </span>

                            {/* Role */}
                            <span
                                style={{
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: NP.lilac,
                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                }}
                            >
                                {role}
                            </span>

                            {/* Actions */}
                            <div onClick={(e) => e.stopPropagation()}>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            type="button"
                                            className="flex items-center justify-center transition-colors"
                                            style={{
                                                width: 32,
                                                height: 32,
                                                borderRadius: 8,
                                                background: "transparent",
                                                border: "none",
                                                color: NP.textMuted,
                                                cursor: "pointer",
                                            }}
                                        >
                                            <MoreHorizontal style={{ width: 16, height: 16 }} />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                        <DropdownMenuItem onClick={() => setSelectedTask(task)}>
                                            View details
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => navigator.clipboard.writeText(task.id)}>
                                            Copy Task ID
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    )
                })}

                {/* ─── Pagination ─── */}
                {filtered.length > PER_PAGE && (
                    <div
                        className="flex items-center justify-between"
                        style={{
                            padding: "14px 20px",
                            borderTop: `1px solid ${NP.borderSubtle}`,
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="flex items-center transition-colors"
                            style={{
                                gap: 6,
                                padding: "8px 16px",
                                borderRadius: 26,
                                background: "transparent",
                                border: `1px solid ${NP.border}`,
                                color: page === 1 ? NP.textMuted : NP.textSecondary,
                                fontSize: 13,
                                fontWeight: 600,
                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                                cursor: page === 1 ? "default" : "pointer",
                                opacity: page === 1 ? 0.5 : 1,
                            }}
                        >
                            <ChevronLeft style={{ width: 14, height: 14 }} />
                            Back
                        </button>

                        <div className="flex items-center" style={{ gap: 4 }}>
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                                <button
                                    key={n}
                                    type="button"
                                    onClick={() => setPage(n)}
                                    className="flex items-center justify-center transition-colors"
                                    style={{
                                        width: 34,
                                        height: 34,
                                        borderRadius: "50%",
                                        background: page === n ? NP.pageActive : "transparent",
                                        border: page === n ? `1px solid ${NP.pageActiveBorder}` : "1px solid transparent",
                                        color: page === n ? NP.textPrimary : NP.textSecondary,
                                        fontSize: 13,
                                        fontWeight: page === n ? 700 : 500,
                                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                                        cursor: "pointer",
                                    }}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>

                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="flex items-center transition-colors"
                            style={{
                                gap: 6,
                                padding: "8px 16px",
                                borderRadius: 26,
                                background: "transparent",
                                border: `1px solid ${NP.border}`,
                                color: page === totalPages ? NP.textMuted : NP.textPrimary,
                                fontSize: 13,
                                fontWeight: 600,
                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                                cursor: page === totalPages ? "default" : "pointer",
                                opacity: page === totalPages ? 0.5 : 1,
                            }}
                        >
                            Next
                            <ChevronRight style={{ width: 14, height: 14 }} />
                        </button>
                    </div>
                )}
            </div>

            {/* Task detail modal — read-only for user */}
            <TaskDetailModal
                task={selectedTask}
                isOpen={!!selectedTask}
                onClose={() => setSelectedTask(null)}
                isAdmin={false}
                bulkSelectedIds={[]}
                workspaceId={workspaceId}
            />
        </div>
    )
}
