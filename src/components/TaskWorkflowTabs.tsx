'use client'

import { useState, useCallback, useMemo } from 'react'
import { TaskWithUser } from '@/types/admin'
import { TaskDetailModal } from './tasks/TaskDetailModal'
import { deleteTask } from '@/actions/task-management-actions'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Search, Filter, ChevronLeft, ChevronRight, MoreHorizontal, Pen, Trash2, GripVertical, Timer, Undo2, CalendarDays, ChevronDown, MessageSquare } from 'lucide-react'
import TaskChatMenuItem from './tasks/TaskChatMenuItem'
import { useTaskChatNotifications } from '@/hooks/useTaskChatNotifications'
import { AssigneeCell } from './tasks/cells/AssigneeCell'
import { StatusCell } from './tasks/cells/StatusCell'
import { formatClientHierarchy } from '@/lib/client-hierarchy'
import { parseDuration, formatDuration } from '@/lib/duration-parser'
import { returnTask } from '@/actions/claim-actions'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ─── STATUS CONFIG ──────────────────────────────────────────
const STATUS_COLORS: Record<string, { label: string; color: string }> = {
    'Nhận task':       { label: 'Nhận task',       color: '#3B82F6' },
    'Đã nhận task':   { label: 'Đã nhận task',   color: '#3B82F6' },
    'Đang đợi giao':   { label: 'Đang đợi giao',   color: '#A855F7' },
    'Đang thực hiện':  { label: 'Đang thực hiện',  color: '#EAB308' },
    'Review':              { label: 'Review',              color: '#F97316' },
    'Revision':            { label: 'Revision',            color: '#EF4444' },
    'Sửa frame':       { label: 'Sửa frame',       color: '#EC4899' },
    'Tạm ngưng':    { label: 'Tạm ngưng',    color: '#71717A' },
    'Hoàn tất':     { label: 'Hoàn tất',     color: '#10B981' },
}

const TYPE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
    'Short form': { bg: 'rgba(56,189,248,0.10)', color: '#38BDF8', border: 'rgba(56,189,248,0.20)' },
    'Long form':  { bg: 'rgba(139,92,246,0.10)', color: '#A78BFA', border: 'rgba(139,92,246,0.20)' },
    'Trial':      { bg: 'rgba(245,158,11,0.10)', color: '#FBBF24', border: 'rgba(245,158,11,0.20)' },
}
const TYPE_DEFAULT = { bg: 'rgba(161,161,170,0.10)', color: '#A1A1AA', border: 'rgba(161,161,170,0.20)' }

// ─── TAB CONFIG (Neon Purple Dark) ─────────────────────────
type TabId = 'all' | 'progress' | 'review' | 'done'

interface TabConfig {
    id: TabId
    label: string
    statuses: string[] | null // null = all
    color: string
    // For drag-drop: target status when tasks are dropped here
    targetStatus: string | null
}

const TABS: TabConfig[] = [
    { id: 'all',      label: 'Assignee',        statuses: ['Đã nhận task'],                                            color: '#8B5CF6', targetStatus: null },
    { id: 'progress', label: 'Progress',        statuses: ['Đang thực hiện'],                                     color: '#EAB308', targetStatus: 'Đang thực hiện' },
    { id: 'review',   label: 'Revise',           statuses: ['Review', 'Revision', 'Sửa frame'],               color: '#F97316', targetStatus: 'Revision' },
    { id: 'done',     label: 'Complete',         statuses: ['Hoàn tất'],                                   color: '#10B981', targetStatus: 'Hoàn tất' },
]

const PER_PAGE = 8

// ─── NEON PURPLE PALETTE ────────────────────────────────────
const NP = {
    surface: '#0A0A0A',
    surfaceAlt: '#0E0B14',
    rowHover: '#211B31',
    border: 'rgba(139,92,246,0.15)',
    borderSubtle: 'rgba(139,92,246,0.10)',
    borderCell: 'rgba(139,92,246,0.12)',
    accent: '#8B5CF6',
    accentGlow: 'rgba(139,92,246,0.35)',
    textPrimary: '#FFFFFF',
    textSecondary: '#A1A1AA',
    textMuted: '#71717A',
    lilac: '#D8B4FE',
    pageActive: 'rgba(139,92,246,0.20)',
    pageActiveBorder: 'rgba(139,92,246,0.30)',
}

// ─── MAIN COMPONENT ─────────────────────────────────────────
export default function TaskWorkflowTabs({ tasks, users, isMobile, isAdmin, workspaceId }: {
    tasks: TaskWithUser[]
    users: any[]
    isMobile: boolean
    isAdmin?: boolean
    workspaceId: string
}) {
    const [activeTab, setActiveTab] = useState<TabId>('all')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [selectedTask, setSelectedTask] = useState<TaskWithUser | null>(null)
    const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
    const [sortField, setSortField] = useState<'title' | 'deadline' | 'price' | null>(null)
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

    // Drag-drop state
    const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)
    const [isDragging, setIsDragging] = useState(false)

    const router = useRouter()
    const { confirm } = useConfirm()

    const taskIds = useMemo(() => tasks.map(t => t.id), [tasks])
    const { unreadMap, chatStatusMap } = useTaskChatNotifications(taskIds)

    const selectedIds = Object.keys(rowSelection).filter(k => rowSelection[k])

    // ─── Filter + search + sort ─────────────────────────
    const filtered = useMemo(() => {
        const tab = TABS.find(t => t.id === activeTab)!
        let result = tasks
        if (tab.statuses) {
            result = result.filter(t => tab.statuses!.includes(t.status))
        }
        if (search.trim()) {
            const q = search.toLowerCase()
            result = result.filter(t =>
                t.title.toLowerCase().includes(q) ||
                (t.client?.name || '').toLowerCase().includes(q) ||
                (t.client?.parent?.name || '').toLowerCase().includes(q) ||
                (t.assignee?.username || '').toLowerCase().includes(q)
            )
        }
        if (sortField) {
            result = [...result].sort((a, b) => {
                let va: any, vb: any
                if (sortField === 'title') { va = a.title; vb = b.title }
                else if (sortField === 'deadline') { va = a.deadline ? new Date(a.deadline).getTime() : Infinity; vb = b.deadline ? new Date(b.deadline).getTime() : Infinity }
                else if (sortField === 'price') { va = Number(a.value || 0); vb = Number(b.value || 0) }
                if (va < vb) return sortDir === 'asc' ? -1 : 1
                if (va > vb) return sortDir === 'asc' ? 1 : -1
                return 0
            })
        }
        return result
    }, [tasks, activeTab, search, sortField, sortDir])

    const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
    const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

    // ─── Tab counts ─────────────────────────────────────
    const tabCounts = useMemo(() => {
        const counts: Record<string, number> = {}
        TABS.forEach(tab => {
            counts[tab.id] = tab.statuses
                ? tasks.filter(t => tab.statuses!.includes(t.status)).length
                : tasks.length
        })
        return counts
    }, [tasks])

    // ─── Sort toggle ────────────────────────────────────
    const toggleSort = (field: 'title' | 'deadline' | 'price') => {
        if (sortField === field) {
            if (sortDir === 'asc') setSortDir('desc')
            else { setSortField(null); setSortDir('asc') }
        } else {
            setSortField(field)
            setSortDir('asc')
        }
    }

    // ─── Task click handler ─────────────────────────────
    const handleTaskClick = useCallback((task: TaskWithUser) => {
        if (!isAdmin && (task.status === 'Nhận task' || task.status === 'Đã nhận task')) {
            toast.warning('Vui lòng bấm "Bắt đầu" để mở khóa task!')
            return
        }
        setSelectedTask(task)
    }, [isAdmin])

    // ─── Delete handlers ────────────────────────────────
    const handleDelete = async (id: string) => {
        if (await confirm({ title: 'Delete Task', message: 'Are you sure?', type: 'danger' })) {
            await deleteTask(id, workspaceId)
            toast.success('Task deleted')
            window.location.reload()
        }
    }

    const handleBulkDelete = async () => {
        if (await confirm({
            title: `Delete ${selectedIds.length} Tasks`,
            message: `Delete ${selectedIds.length} selected tasks? Cannot be undone.`,
            type: 'danger'
        })) {
            const { bulkDeleteTasks } = await import('@/actions/bulk-task-actions')
            const res = await bulkDeleteTasks(selectedIds, workspaceId)
            if (res.error) toast.error(res.error)
            else {
                toast.success(`Deleted ${res.count} tasks`)
                setRowSelection({})
                window.location.reload()
            }
        }
    }

    // ─── Row selection toggle ───────────────────────────
    const toggleRow = (id: string) => {
        setRowSelection(prev => {
            const next = { ...prev }
            if (next[id]) delete next[id]
            else next[id] = true
            return next
        })
    }
    const toggleAll = () => {
        if (selectedIds.length === paged.length) {
            setRowSelection({})
        } else {
            const next: Record<string, boolean> = {}
            paged.forEach(t => { next[t.id] = true })
            setRowSelection(next)
        }
    }

    // ─── Native HTML5 Drag Handlers ─────────────────────
    const handleRowDragStart = useCallback((e: React.DragEvent, taskId: string) => {
        setIsDragging(true)
        const idsToMove = selectedIds.includes(taskId) ? selectedIds : [taskId]
        e.dataTransfer.setData('text/plain', JSON.stringify(idsToMove))
        e.dataTransfer.effectAllowed = 'move'
    }, [selectedIds])

    const handleRowDragEnd = useCallback(() => {
        setIsDragging(false)
        setDragOverTabId(null)
    }, [])

    const handleTabDragOver = useCallback((e: React.DragEvent, tabId: string) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDragOverTabId(tabId)
    }, [])

    const handleTabDragLeave = useCallback(() => {
        setDragOverTabId(null)
    }, [])

    const handleTabDrop = useCallback(async (e: React.DragEvent, tabId: string) => {
        e.preventDefault()
        setDragOverTabId(null)
        setIsDragging(false)

        const targetTab = TABS.find(t => t.id === tabId)
        if (!targetTab || !targetTab.targetStatus) return

        let taskIdsToUpdate: string[] = []
        try {
            taskIdsToUpdate = JSON.parse(e.dataTransfer.getData('text/plain'))
        } catch { return }

        if (!taskIdsToUpdate.length) return

        const actualIds = taskIdsToUpdate.filter(id => {
            const task = tasks.find(t => t.id === id)
            return task && !(targetTab.statuses || []).includes(task.status)
        })

        if (actualIds.length === 0) {
            toast.info('Tasks already in this status')
            return
        }

        try {
            if (actualIds.length === 1) {
                const { updateTaskStatus } = await import('@/actions/task-actions')
                const res = await updateTaskStatus(actualIds[0], targetTab.targetStatus, workspaceId)
                if (res.error) toast.error(res.error)
                else {
                    toast.success(`Task moved to ${targetTab.label}`)
                    setRowSelection({})
                    router.refresh()
                }
            } else {
                const { bulkUpdateStatus } = await import('@/actions/bulk-task-actions')
                const res = await bulkUpdateStatus(actualIds, targetTab.targetStatus, workspaceId)
                if (res.error) toast.error(res.error)
                else {
                    toast.success(`${res.count} tasks moved to ${targetTab.label}`)
                    setRowSelection({})
                    router.refresh()
                }
            }
        } catch {
            toast.error('Failed to update status')
        }
    }, [tasks, workspaceId, router])

    // ─── Helpers ────────────────────────────────────────
    const getStatusInfo = (status: string) => STATUS_COLORS[status] || { label: status, color: '#71717A' }
    const getTypeInfo = (type: string) => TYPE_COLORS[type] || TYPE_DEFAULT
    const getTypeLabel = (type: string) => {
        if (type === 'Short form') return 'Short form'
        if (type === 'Long form') return 'Long form'
        if (type === 'Trial') return 'Trial'
        return type || 'Task'
    }

    const getDeadlineColor = (deadline: Date | null, status: string) => {
        if (!deadline) return NP.textMuted
        if (status === 'Hoàn tất') return NP.textSecondary
        const diff = (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60)
        if (diff <= 0) return '#EF4444'
        if (diff < 24) return '#EF4444'
        if (diff < 48) return '#FBBF24'
        return NP.textSecondary
    }

    const formatDeadline = (deadline: Date | null) => {
        if (!deadline) return 'No Limit'
        const d = new Date(deadline)
        return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
    }

    const formatAmount = (task: TaskWithUser) => {
        const val = Number((task as any).price ?? task.value ?? 0)
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val)
    }

    return (
        <div
            className="flex flex-col"
            style={{ gap: 16, padding: '20px 18px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
            {/* ─── STATUS TABS (PROGRESS BAR section) ─────── */}
            <div className="flex flex-wrap items-center" style={{ gap: 10 }}>
                {TABS.map(tab => {
                    const isActive = activeTab === tab.id
                    const isOver = dragOverTabId === tab.id
                    return (
                        <button
                            key={tab.id}
                            onClick={() => { setActiveTab(tab.id); setPage(1) }}
                            onDragOver={(e) => handleTabDragOver(e, tab.id)}
                            onDragLeave={handleTabDragLeave}
                            onDrop={(e) => handleTabDrop(e, tab.id)}
                            className="flex items-center transition-all duration-200"
                            style={{
                                gap: 8,
                                padding: '10px 20px',
                                borderRadius: 26,
                                background: isActive ? NP.accent : NP.surface,
                                border: `1px solid ${isActive ? NP.accent : NP.border}`,
                                color: isActive ? '#FFFFFF' : NP.textSecondary,
                                fontSize: 14,
                                fontWeight: 600,
                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                                cursor: 'pointer',
                                boxShadow: isActive
                                    ? `0px 3.5px 1.8px rgba(0,0,0,0.25), 0 0 20px ${NP.accentGlow}`
                                    : '0px 3.5px 1.8px rgba(0,0,0,0.25)',
                                transform: isOver ? 'scale(1.05)' : 'scale(1)',
                            }}
                        >
                            {/* Colored dot indicator */}
                            <span style={{
                                width: 16, height: 16, borderRadius: '50%',
                                background: isActive ? '#FFFFFF' : tab.color,
                                flexShrink: 0,
                                opacity: isActive ? 1 : 0.7,
                            }} />
                            {tab.label}
                            <span style={{
                                fontSize: 11, fontWeight: 700,
                                padding: '2px 8px', borderRadius: 999,
                                background: isActive ? 'rgba(255,255,255,0.20)' : 'rgba(139,92,246,0.08)',
                                color: isActive ? '#FFFFFF' : NP.textMuted,
                            }}>
                                {tabCounts[tab.id]}
                            </span>
                        </button>
                    )
                })}
            </div>

            {/* ─── Drag Hint ─────────────────────────────── */}
            {isDragging && (
                <div
                    className="text-center text-xs animate-pulse py-1"
                    style={{ color: NP.accent, fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                    Drag to a tab above to change status
                </div>
            )}

            {/* ─── Bulk Action Bar ───────────────────────── */}
            {selectedIds.length > 0 && !isDragging && (
                <div
                    className="flex items-center justify-between animate-in slide-in-from-top-2"
                    style={{
                        background: NP.surface,
                        border: `1px solid ${NP.border}`,
                        padding: '10px 16px',
                        borderRadius: 26,
                    }}
                >
                    <span style={{ color: NP.textPrimary, fontWeight: 700, fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                        {selectedIds.length} tasks selected {isAdmin ? '- drag to change status' : ''}
                    </span>
                    <div className="flex gap-2">
                        {isAdmin && (
                            <button
                                onClick={handleBulkDelete}
                                className="transition-colors"
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: 26,
                                    background: 'rgba(239,68,68,0.15)',
                                    border: '1px solid rgba(239,68,68,0.25)',
                                    color: '#FCA5A5',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                    cursor: 'pointer',
                                }}
                            >
                                Delete Selected
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ─── SEARCH BAR ───────────────────────────── */}
            <div className="flex items-center" style={{ gap: 10 }}>
                <div
                    className="flex-1 flex items-center"
                    style={{
                        gap: 10,
                        padding: '12px 18px',
                        borderRadius: 26,
                        background: NP.surface,
                        border: `1px solid ${NP.border}`,
                    }}
                >
                    <Search style={{ width: 16, height: 16, color: NP.textSecondary, flexShrink: 0 }} />
                    <input
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1) }}
                        placeholder="Search tasks..."
                        className="flex-1"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            color: NP.textPrimary,
                            fontSize: 14,
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                        }}
                    />
                </div>
                <button
                    className="flex items-center transition-colors"
                    style={{
                        gap: 8,
                        padding: '12px 20px',
                        borderRadius: 26,
                        background: NP.accent,
                        border: 'none',
                        color: '#FFFFFF',
                        fontSize: 14,
                        fontWeight: 600,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        cursor: 'pointer',
                    }}
                >
                    View
                    <Filter style={{ width: 14, height: 14 }} />
                </button>
            </div>

            {/* ─── TASK TABLE (Glass Card) ───────────────── */}
            <div style={{
                borderRadius: 26,
                background: NP.surface,
                border: `1px solid ${NP.border}`,
                overflow: 'hidden',
            }}>
                {/* Column Headers */}
                <div
                    className="items-center hidden md:grid"
                    style={{
                        gridTemplateColumns: '32px 2.2fr 0.8fr 1fr 0.7fr 0.7fr 0.8fr 40px',
                        padding: '14px 20px',
                        borderBottom: `1px solid ${NP.borderSubtle}`,
                    }}
                >
                    {/* Select all checkbox */}
                    <div className="flex items-center justify-center">
                        <button
                            type="button"
                            role="checkbox"
                            aria-checked={paged.length > 0 && selectedIds.length === paged.length}
                            onClick={toggleAll}
                            className="w-[18px] h-[18px] shrink-0 rounded-full border-2 transition-all duration-200 flex items-center justify-center cursor-pointer"
                            style={{
                                borderColor: paged.length > 0 && selectedIds.length === paged.length ? '#8B5CF6' : '#52525B',
                                background: paged.length > 0 && selectedIds.length === paged.length ? '#8B5CF6' : 'transparent',
                                boxShadow: paged.length > 0 && selectedIds.length === paged.length ? '0 0 10px rgba(139,92,246,0.4)' : 'none',
                            }}
                        >
                            {paged.length > 0 && selectedIds.length === paged.length && (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                            )}
                        </button>
                    </div>
                    {(['Task Name', 'Status', 'Assignee', 'Type', 'Deadline', 'Amount', ''] as const).map(h => (
                        <span
                            key={h || 'actions'}
                            onClick={() => {
                                if (h === 'Task Name') toggleSort('title')
                                else if (h === 'Deadline') toggleSort('deadline')
                                else if (h === 'Amount') toggleSort('price')
                            }}
                            className={h === 'Task Name' || h === 'Deadline' || h === 'Amount' ? 'cursor-pointer select-none' : ''}
                            style={{
                                fontSize: 16,
                                fontWeight: 400,
                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                                color: NP.textSecondary,
                                transition: 'color 0.15s',
                            }}
                            onMouseEnter={e => {
                                if (h === 'Task Name' || h === 'Deadline' || h === 'Amount') {
                                    e.currentTarget.style.color = NP.textPrimary
                                }
                            }}
                            onMouseLeave={e => {
                                if (h === 'Task Name' || h === 'Deadline' || h === 'Amount') {
                                    e.currentTarget.style.color = NP.textSecondary
                                }
                            }}
                        >
                            {h}
                            {sortField === 'title' && h === 'Task Name' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                            {sortField === 'deadline' && h === 'Deadline' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                            {sortField === 'price' && h === 'Amount' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                        </span>
                    ))}
                </div>

                {/* Rows */}
                {paged.length === 0 && (
                    <div style={{
                        padding: '40px 20px', textAlign: 'center',
                        color: NP.textMuted, fontSize: 14,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}>
                        Không có task nào.
                    </div>
                )}

                {paged.map((task, idx) => {
                    const s = getStatusInfo(task.status)
                    const tc = getTypeInfo(task.type)
                    const dlColor = getDeadlineColor(task.deadline, task.status)
                    const clientLabel = formatClientHierarchy(task.client)
                    const isSelected = !!rowSelection[task.id]
                    const taskTags = (task as any).taskTags as { tagCategory: { id: string; name: string } }[] | undefined
                    const duration = (task as any).duration as string | null | undefined
                    const claimSource = (task as any).claimSource
                    const isOverdue = task.deadline && task.status !== 'Hoàn tất' && new Date(task.deadline).getTime() < Date.now()
                    const isOddRow = idx % 2 === 1

                    return (
                        <div
                            key={task.id}
                            draggable={!!isAdmin}
                            onDragStart={(e) => handleRowDragStart(e, task.id)}
                            onDragEnd={handleRowDragEnd}
                            className="relative transition-colors duration-150 group/row"
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '32px 2.2fr 0.8fr 1fr 0.7fr 0.7fr 0.8fr 40px',
                                padding: '17.8px 20px',
                                borderBottom: `1px solid ${NP.borderSubtle}`,
                                alignItems: 'center',
                                cursor: isAdmin ? 'grab' : 'default',
                                background: isSelected
                                    ? 'rgba(139,92,246,0.08)'
                                    : isOddRow ? NP.surfaceAlt : NP.surface,
                            }}
                            onMouseEnter={e => {
                                if (!isSelected) e.currentTarget.style.background = NP.rowHover
                            }}
                            onMouseLeave={e => {
                                if (!isSelected) e.currentTarget.style.background = isOddRow ? NP.surfaceAlt : NP.surface
                            }}
                        >
                            {/* Checkbox + drag handle */}
                            <div className="flex items-center justify-center gap-0.5">
                                {isAdmin && <GripVertical className="w-3.5 h-3.5 opacity-0 group-hover/row:opacity-100 transition-opacity" style={{ color: NP.textMuted }} />}
                                <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={isSelected}
                                    onClick={() => toggleRow(task.id)}
                                    className="w-[18px] h-[18px] shrink-0 rounded-full border-2 transition-all duration-200 flex items-center justify-center cursor-pointer"
                                    style={{
                                        borderColor: isSelected ? '#8B5CF6' : '#52525B',
                                        background: isSelected ? '#8B5CF6' : 'transparent',
                                        boxShadow: isSelected ? '0 0 10px rgba(139,92,246,0.4)' : 'none',
                                    }}
                                >
                                    {isSelected && (
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                    )}
                                </button>
                            </div>

                            {/* Task Name cell — pill container */}
                            <div
                                onClick={() => handleTaskClick(task)}
                                className="cursor-pointer min-w-0"
                            >
                                <div style={{
                                    display: 'inline-flex',
                                    flexDirection: 'column',
                                    padding: '6px 12px',
                                    borderRadius: 14,
                                    border: `1px solid ${NP.borderCell}`,
                                    maxWidth: '100%',
                                }}>
                                    <div
                                        className="transition-colors duration-150"
                                        style={{
                                            fontSize: 14, fontWeight: 700,
                                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                                            color: NP.textPrimary,
                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.color = NP.lilac)}
                                        onMouseLeave={e => (e.currentTarget.style.color = NP.textPrimary)}
                                    >
                                        {task.title}
                                        {(unreadMap[task.id] ?? 0) > 0 && (
                                            <span className="inline-block w-2 h-2 rounded-full bg-violet-500 animate-pulse ml-2 flex-shrink-0" />
                                        )}
                                    </div>
                                    {clientLabel && (
                                        <div style={{
                                            fontSize: 12, fontWeight: 500,
                                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                                            color: NP.textSecondary,
                                            marginTop: 1,
                                        }}>
                                            {clientLabel}
                                        </div>
                                    )}
                                </div>
                                {/* Tags row below pill */}
                                <div className="flex items-center flex-wrap" style={{ gap: 4, marginTop: 4, paddingLeft: 4 }}>
                                    {isOverdue && (
                                        <span style={{
                                            fontSize: 9, fontWeight: 700,
                                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                                            color: '#EF4444',
                                        }}>OVERDUE</span>
                                    )}
                                    {claimSource === 'MARKET' && (
                                        <span style={{
                                            fontSize: 9, fontWeight: 600,
                                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                                            padding: '2px 6px', borderRadius: 999,
                                            background: 'rgba(245,158,11,0.08)', color: '#FBBF24',
                                        }}>
                                            MARKET
                                        </span>
                                    )}
                                    {taskTags?.slice(0, 2).map(tt => (
                                        <span
                                            key={tt.tagCategory.id}
                                            style={{
                                                fontSize: 9, fontWeight: 600,
                                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                padding: '2px 6px', borderRadius: 999,
                                                background: 'rgba(139,92,246,0.08)', color: '#A78BFA',
                                            }}
                                        >
                                            {tt.tagCategory.name}
                                        </span>
                                    ))}
                                    {duration && (() => {
                                        const parsed = parseDuration(duration)
                                        return (
                                            <span className="inline-flex items-center" style={{
                                                gap: 3, fontSize: 9, fontWeight: 600,
                                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                padding: '2px 6px', borderRadius: 999,
                                                background: 'rgba(245,158,11,0.08)', color: '#FBBF24',
                                            }}>
                                                <Timer style={{ width: 9, height: 9 }} />
                                                {parsed.valid ? formatDuration(parsed.totalSeconds) : duration}
                                            </span>
                                        )
                                    })()}
                                </div>
                            </div>

                            {/* Status cell — pill */}
                            <div>
                                {isAdmin ? (
                                    <StatusCell task={task} isAdmin={true} workspaceId={workspaceId} />
                                ) : (
                                    <span
                                        className="inline-flex items-center whitespace-nowrap"
                                        style={{
                                            gap: 5,
                                            padding: '6px 12px', borderRadius: 14,
                                            fontSize: 12, fontWeight: 600,
                                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                                            border: `1px solid ${NP.borderCell}`,
                                            background: 'transparent',
                                            color: s.color,
                                        }}
                                    >
                                        <span style={{
                                            width: 8, height: 8, borderRadius: '50%',
                                            background: s.color, flexShrink: 0,
                                        }} />
                                        <ChevronDown style={{ width: 12, height: 12, color: NP.textMuted }} />
                                    </span>
                                )}
                            </div>

                            {/* Assignee cell — pill */}
                            <div className="min-w-0">
                                <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '4px 10px',
                                    borderRadius: 14,
                                    border: `1px solid ${NP.borderCell}`,
                                }}>
                                    <AssigneeCell
                                        task={task}
                                        users={users}
                                        isAdmin={isAdmin ?? false}
                                        selectedIds={selectedIds}
                                        workspaceId={workspaceId}
                                    />
                                </div>
                            </div>

                            {/* Type cell — dropdown pill */}
                            <div>
                                <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '6px 12px', borderRadius: 14,
                                    fontSize: 12, fontWeight: 600,
                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                    border: `1px solid ${NP.borderCell}`,
                                    background: 'transparent',
                                    color: tc.color,
                                }}>
                                    {getTypeLabel(task.type)}
                                    <ChevronDown style={{ width: 12, height: 12, color: NP.textMuted }} />
                                </span>
                            </div>

                            {/* Deadline cell — pill with calendar icon */}
                            <div>
                                <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '6px 12px', borderRadius: 14,
                                    fontSize: 13,
                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                    fontWeight: dlColor === '#EF4444' ? 700 : 500,
                                    color: dlColor,
                                    border: `1px solid ${NP.borderCell}`,
                                    background: 'transparent',
                                }}>
                                    {formatDeadline(task.deadline)}
                                    <CalendarDays style={{ width: 13, height: 13, color: NP.textMuted }} />
                                </span>
                            </div>

                            {/* Amount cell */}
                            <span style={{
                                fontSize: 13, fontWeight: 700,
                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                                color: NP.lilac,
                            }}>
                                {formatAmount(task)}
                            </span>

                            {/* Actions cell — three-dot MoreHorizontal */}
                            <div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            className="flex items-center justify-center transition-colors"
                                            style={{
                                                width: 32, height: 32, borderRadius: 8,
                                                background: 'transparent', border: 'none',
                                                color: NP.textMuted, cursor: 'pointer',
                                            }}
                                            onMouseEnter={e => (e.currentTarget.style.color = NP.textSecondary)}
                                            onMouseLeave={e => (e.currentTarget.style.color = NP.textMuted)}
                                        >
                                            <MoreHorizontal style={{ width: 16, height: 16 }} />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                        <DropdownMenuItem onClick={() => navigator.clipboard.writeText(task.id)}>
                                            Copy Task ID
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => handleTaskClick(task)}>
                                            <Pen className="mr-2 h-4 w-4" /> Edit Details
                                        </DropdownMenuItem>
                                        <TaskChatMenuItem
                                            taskId={task.id}
                                            workspaceId={workspaceId}
                                            hasConversation={chatStatusMap[task.id]?.hasConversation ?? false}
                                            conversationId={chatStatusMap[task.id]?.conversationId ?? null}
                                        />
                                        {/* Return task for MARKET claims */}
                                        {(() => {
                                            const cs = (task as any).claimSource
                                            const ca = (task as any).claimedAt
                                            if (cs !== 'MARKET' || !ca) return null
                                            const caDate = new Date(ca)
                                            if (isNaN(caDate.getTime())) return null
                                            const minutesSince = (Date.now() - caDate.getTime()) / (1000 * 60)
                                            if (minutesSince > 10) return null
                                            return (
                                                <DropdownMenuItem
                                                    className="text-amber-500 focus:text-amber-500"
                                                    onClick={async () => {
                                                        const res = await returnTask(task.id, workspaceId)
                                                        if (res.error) toast.error(res.error)
                                                        else {
                                                            toast.success('Task returned')
                                                            window.location.reload()
                                                        }
                                                    }}
                                                >
                                                    <Undo2 className="mr-2 h-4 w-4" /> Return Task
                                                </DropdownMenuItem>
                                            )
                                        })()}
                                        {isAdmin && (
                                            <DropdownMenuItem
                                                className="text-red-500 focus:text-red-500"
                                                onClick={() => handleDelete(task.id)}
                                            >
                                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                                            </DropdownMenuItem>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    )
                })}

                {/* ─── PAGINATION ─────────────────────────── */}
                {filtered.length > PER_PAGE && (
                    <div
                        className="flex items-center justify-between"
                        style={{
                            padding: '14px 20px',
                            borderTop: `1px solid ${NP.borderSubtle}`,
                        }}
                    >
                        {/* Back button */}
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="flex items-center transition-colors"
                            style={{
                                gap: 6,
                                padding: '8px 16px', borderRadius: 26,
                                background: 'transparent',
                                border: `1px solid ${NP.border}`,
                                color: page === 1 ? NP.textMuted : NP.textSecondary,
                                fontSize: 13, fontWeight: 600,
                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                                cursor: page === 1 ? 'default' : 'pointer',
                                opacity: page === 1 ? 0.5 : 1,
                            }}
                        >
                            <ChevronLeft style={{ width: 14, height: 14 }} />
                            Back
                        </button>

                        {/* Page numbers */}
                        <div className="flex items-center" style={{ gap: 4 }}>
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                                <button
                                    key={n}
                                    onClick={() => setPage(n)}
                                    className="flex items-center justify-center transition-colors"
                                    style={{
                                        width: 34, height: 34, borderRadius: '50%',
                                        background: page === n ? NP.pageActive : 'transparent',
                                        border: page === n ? `1px solid ${NP.pageActiveBorder}` : '1px solid transparent',
                                        color: page === n ? NP.textPrimary : NP.textSecondary,
                                        fontSize: 13,
                                        fontWeight: page === n ? 700 : 500,
                                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                                        cursor: 'pointer',
                                    }}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>

                        {/* Next button */}
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="flex items-center transition-colors"
                            style={{
                                gap: 6,
                                padding: '8px 16px', borderRadius: 26,
                                background: 'transparent',
                                border: `1px solid ${NP.border}`,
                                color: page === totalPages ? NP.textMuted : NP.textPrimary,
                                fontSize: 13, fontWeight: 600,
                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                                cursor: page === totalPages ? 'default' : 'pointer',
                                opacity: page === totalPages ? 0.5 : 1,
                            }}
                        >
                            Next
                            <ChevronRight style={{ width: 14, height: 14 }} />
                        </button>
                    </div>
                )}
            </div>

            {/* ─── Task Detail Modal ─────────────────────── */}
            <TaskDetailModal
                task={selectedTask}
                isOpen={!!selectedTask}
                onClose={() => setSelectedTask(null)}
                isAdmin={isAdmin ?? false}
                bulkSelectedIds={selectedIds}
                workspaceId={workspaceId}
            />
        </div>
    )
}
