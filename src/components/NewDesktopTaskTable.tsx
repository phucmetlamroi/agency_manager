"use client"

import { useState, useCallback, useMemo } from 'react'
import { TaskWithUser } from '@/types/admin'
import { TaskDetailModal } from './tasks/TaskDetailModal'
import { deleteTask } from '@/actions/task-management-actions'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { toast } from 'sonner'
import { Search, Filter, ChevronLeft, ChevronRight, MoreHorizontal, Pen, Trash2, Timer, Undo2, MessageSquare } from 'lucide-react'
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

// ─── TAB CONFIG ─────────────────────────────────────────────
type TabId = 'all' | 'progress' | 'review' | 'done'

interface TabConfig {
    id: TabId
    label: string
    statuses: string[] | null
    color: string
}

const TABS: TabConfig[] = [
    { id: 'all',      label: 'All Tasks',       statuses: null,                                              color: '#A5B4FC' },
    { id: 'progress', label: 'In Progress',     statuses: ['Đang thực hiện'],                                     color: '#EAB308' },
    { id: 'review',   label: 'Review / Revise',  statuses: ['Review', 'Revision', 'Sửa frame'],               color: '#F97316' },
    { id: 'done',     label: 'Completed',        statuses: ['Hoàn tất'],                                   color: '#10B981' },
]

const PER_PAGE = 8

interface DesktopTaskTableProps {
    tasks: TaskWithUser[]
    isAdmin?: boolean
    users?: any[]
    workspaceId: string
    currentUserId?: string
}

// ─── MAIN COMPONENT ─────────────────────────────────────────
export default function DesktopTaskTable({ tasks, isAdmin = false, users = [], workspaceId, currentUserId }: DesktopTaskTableProps) {
    const [activeTab, setActiveTab] = useState<TabId>('all')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [selectedTask, setSelectedTask] = useState<TaskWithUser | null>(null)
    const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
    const [sortField, setSortField] = useState<'title' | 'deadline' | 'price' | null>(null)
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
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
        if (await confirm({ title: 'Delete Task', message: 'Are you sure you want to delete this task?', type: 'danger' })) {
            await deleteTask(id, workspaceId)
            toast.success('Task deleted')
            window.location.reload()
        }
    }

    const handleBulkDelete = async () => {
        if (await confirm({
            title: `Delete ${selectedIds.length} Tasks`,
            message: `Are you sure you want to delete ${selectedIds.length} selected tasks? This cannot be undone.`,
            type: 'danger'
        })) {
            const { bulkDeleteTasks } = await import('@/actions/bulk-task-actions')
            const res = await bulkDeleteTasks(selectedIds, workspaceId)
            if (res.error) {
                toast.error(res.error)
            } else {
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

    // ─── Helpers ────────────────────────────────────────
    const getStatusInfo = (status: string) => STATUS_COLORS[status] || { label: status, color: '#71717A' }
    const getTypeInfo = (type: string) => TYPE_COLORS[type] || TYPE_DEFAULT
    const getTypeLabel = (type: string) => {
        if (type === 'Short form') return 'SHORT'
        if (type === 'Long form') return 'LONG'
        if (type === 'Trial') return 'TRIAL'
        return type || 'TASK'
    }

    const getDeadlineColor = (deadline: Date | null, status: string) => {
        if (!deadline) return '#3F3F46'
        if (status === 'Hoàn tất') return '#A1A1AA'
        const diff = (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60)
        if (diff <= 0) return '#EF4444'
        if (diff < 24) return '#EF4444'
        if (diff < 48) return '#FBBF24'
        return '#A1A1AA'
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
        <div className="flex flex-col" style={{ gap: 14 }}>
            {/* ─── TABS ROW ──────────────────────────────── */}
            <div className="flex flex-wrap" style={{ gap: 6 }}>
                {TABS.map(tab => {
                    const isActive = activeTab === tab.id
                    return (
                        <button
                            key={tab.id}
                            onClick={() => { setActiveTab(tab.id); setPage(1) }}
                            className="flex items-center transition-all duration-200"
                            style={{
                                gap: 6,
                                padding: '8px 14px',
                                borderRadius: 999,
                                background: isActive ? `${tab.color}18` : 'transparent',
                                border: isActive ? `1px solid ${tab.color}35` : '1px solid rgba(255,255,255,0.08)',
                                color: isActive ? tab.color : '#71717A',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            <span style={{
                                width: 5, height: 5, borderRadius: '50%',
                                background: isActive ? tab.color : '#52525B',
                                flexShrink: 0,
                            }} />
                            {tab.label}
                            <span style={{
                                fontSize: 9, fontWeight: 800,
                                padding: '1px 6px', borderRadius: 999,
                                background: isActive ? `${tab.color}20` : 'rgba(255,255,255,0.04)',
                                color: isActive ? tab.color : '#3F3F46',
                            }}>
                                {tabCounts[tab.id]}
                            </span>
                        </button>
                    )
                })}
            </div>

            {/* ─── Bulk Action Bar ───────────────────────── */}
            {selectedIds.length > 0 && (
                <div
                    className="flex items-center justify-between animate-in slide-in-from-top-2"
                    style={{
                        background: 'rgba(24,24,27,0.90)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        padding: '8px 14px',
                        borderRadius: 12,
                    }}
                >
                    <span className="text-white font-bold text-xs">
                        {selectedIds.length} tasks selected
                    </span>
                    <div className="flex gap-2">
                        {isAdmin && (
                            <button
                                onClick={handleBulkDelete}
                                className="transition-colors"
                                style={{
                                    padding: '4px 12px',
                                    borderRadius: 8,
                                    background: 'rgba(239,68,68,0.15)',
                                    border: '1px solid rgba(239,68,68,0.25)',
                                    color: '#FCA5A5',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                            >
                                Delete Selected
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ─── SEARCH ROW ────────────────────────────── */}
            <div className="flex items-center" style={{ gap: 8 }}>
                <div
                    className="flex-1 flex items-center"
                    style={{
                        gap: 10,
                        padding: '10px 14px',
                        borderRadius: 12,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                    }}
                >
                    <Search style={{ width: 14, height: 14, color: '#52525B', flexShrink: 0 }} />
                    <input
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1) }}
                        placeholder="Search tasks, clients..."
                        className="flex-1"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            color: '#F4F4F5',
                            fontSize: 12,
                        }}
                    />
                </div>
                <button
                    className="flex items-center transition-colors"
                    style={{
                        gap: 6,
                        padding: '10px 14px',
                        borderRadius: 999,
                        background: 'rgba(99,102,241,0.12)',
                        border: '1px solid rgba(99,102,241,0.25)',
                        color: '#A5B4FC',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                    }}
                >
                    <Filter style={{ width: 13, height: 13 }} />
                    View
                </button>
            </div>

            {/* ─── TABLE (Glass Card) ────────────────────── */}
            <div style={{
                borderRadius: 20,
                background: '#18181B',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 24px 60px rgba(0,0,0,0.30)',
                overflow: 'hidden',
            }}>
                {/* Column Headers */}
                <div
                    className="items-center hidden md:grid"
                    style={{
                        gridTemplateColumns: '32px 2.4fr 0.7fr 1fr 0.6fr 0.7fr 0.8fr 36px',
                        padding: '10px 18px',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}
                >
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
                    {(['Task', 'Status', 'Assignee', 'Type', 'Deadline', 'Amount', ''] as const).map(h => (
                        <span
                            key={h || 'actions'}
                            onClick={() => {
                                if (h === 'Task') toggleSort('title')
                                else if (h === 'Deadline') toggleSort('deadline')
                                else if (h === 'Amount') toggleSort('price')
                            }}
                            className={h === 'Task' || h === 'Deadline' || h === 'Amount' ? 'cursor-pointer hover:text-zinc-400 transition-colors select-none' : ''}
                            style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: '#52525B',
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                            }}
                        >
                            {h}
                            {sortField === 'title' && h === 'Task' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                            {sortField === 'deadline' && h === 'Deadline' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                            {sortField === 'price' && h === 'Amount' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                        </span>
                    ))}
                </div>

                {/* Rows */}
                {paged.length === 0 && (
                    <div style={{ padding: '32px 18px', textAlign: 'center', color: '#3F3F46', fontSize: 12 }}>
                        Không có task nào.
                    </div>
                )}

                {paged.map(task => {
                    const s = getStatusInfo(task.status)
                    const tc = getTypeInfo(task.type)
                    const dlColor = getDeadlineColor(task.deadline, task.status)
                    const clientLabel = formatClientHierarchy(task.client)
                    const isSelected = !!rowSelection[task.id]
                    const taskTags = (task as any).taskTags as { tagCategory: { id: string; name: string } }[] | undefined
                    const duration = (task as any).duration as string | null | undefined
                    const claimSource = (task as any).claimSource
                    const isOverdue = task.deadline && task.status !== 'Hoàn tất' && new Date(task.deadline).getTime() < Date.now()

                    return (
                        <div
                            key={task.id}
                            className="relative transition-colors duration-150 group/row"
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '32px 2.4fr 0.7fr 1fr 0.6fr 0.7fr 0.8fr 36px',
                                padding: '11px 18px',
                                borderBottom: '1px solid rgba(255,255,255,0.03)',
                                alignItems: 'center',
                                background: isSelected ? 'rgba(99,102,241,0.06)' : undefined,
                            }}
                            onMouseEnter={e => {
                                if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
                            }}
                            onMouseLeave={e => {
                                if (!isSelected) e.currentTarget.style.background = 'transparent'
                            }}
                        >
                            {/* Left accent line */}
                            <div style={{
                                position: 'absolute', left: 0, top: 4, bottom: 4,
                                width: 3, borderRadius: 2,
                                background: s.color, opacity: 0.5,
                            }} />

                            {/* Checkbox */}
                            <div className="flex items-center justify-center">
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

                            {/* Task cell */}
                            <div
                                onClick={() => handleTaskClick(task)}
                                className="cursor-pointer min-w-0"
                                style={{ paddingLeft: 4 }}
                            >
                                {clientLabel && (
                                    <div style={{
                                        fontSize: 9, fontWeight: 600,
                                        color: '#3B82F6',
                                        letterSpacing: '0.03em',
                                        marginBottom: 1,
                                        textTransform: 'uppercase',
                                    }}>
                                        {clientLabel}
                                    </div>
                                )}
                                <div
                                    className="transition-colors duration-150"
                                    style={{
                                        fontSize: 12, fontWeight: 700,
                                        color: '#F4F4F5',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.color = '#A5B4FC')}
                                    onMouseLeave={e => (e.currentTarget.style.color = '#F4F4F5')}
                                >
                                    {task.title}
                                    {(unreadMap[task.id] ?? 0) > 0 && (
                                        <span className="inline-block w-2 h-2 rounded-full bg-violet-500 animate-pulse ml-1.5 flex-shrink-0" />
                                    )}
                                </div>
                                <div className="flex items-center flex-wrap" style={{ gap: 4, marginTop: 3 }}>
                                    {isOverdue && (
                                        <span style={{ fontSize: 8, fontWeight: 700, color: '#EF4444' }}>OVERDUE</span>
                                    )}
                                    {claimSource === 'MARKET' && (
                                        <span style={{
                                            fontSize: 8, fontWeight: 600,
                                            padding: '1px 5px', borderRadius: 999,
                                            background: 'rgba(245,158,11,0.08)', color: '#FBBF24',
                                        }}>
                                            MARKET
                                        </span>
                                    )}
                                    {taskTags?.slice(0, 2).map(tt => (
                                        <span
                                            key={tt.tagCategory.id}
                                            style={{
                                                fontSize: 8, fontWeight: 600,
                                                padding: '1px 5px', borderRadius: 999,
                                                background: 'rgba(99,102,241,0.08)', color: '#818CF8',
                                            }}
                                        >
                                            {tt.tagCategory.name}
                                        </span>
                                    ))}
                                    {duration && (() => {
                                        const parsed = parseDuration(duration)
                                        return (
                                            <span className="inline-flex items-center" style={{
                                                gap: 2, fontSize: 8, fontWeight: 600,
                                                padding: '1px 5px', borderRadius: 999,
                                                background: 'rgba(245,158,11,0.08)', color: '#FBBF24',
                                            }}>
                                                <Timer style={{ width: 8, height: 8 }} />
                                                {parsed.valid ? formatDuration(parsed.totalSeconds) : duration}
                                            </span>
                                        )
                                    })()}
                                </div>
                            </div>

                            {/* Status cell */}
                            <div>
                                <StatusCell task={task} isAdmin={isAdmin} workspaceId={workspaceId} />
                            </div>

                            {/* Assignee cell */}
                            <div className="min-w-0">
                                <AssigneeCell
                                    task={task}
                                    users={users}
                                    isAdmin={isAdmin}
                                    selectedIds={selectedIds}
                                    workspaceId={workspaceId}
                                />
                            </div>

                            {/* Type cell */}
                            <div>
                                <span style={{
                                    display: 'inline-flex',
                                    padding: '3px 8px', borderRadius: 999,
                                    fontSize: 9, fontWeight: 700,
                                    background: tc.bg, color: tc.color,
                                    border: `1px solid ${tc.border}`,
                                }}>
                                    {getTypeLabel(task.type)}
                                </span>
                            </div>

                            {/* Deadline cell */}
                            <span style={{
                                fontSize: 11,
                                fontFamily: 'ui-monospace, monospace',
                                color: dlColor,
                                fontWeight: dlColor === '#EF4444' ? 700 : 400,
                            }}>
                                {formatDeadline(task.deadline)}
                            </span>

                            {/* Amount cell */}
                            <span style={{
                                fontSize: 11, fontWeight: 700,
                                color: '#34D399',
                                fontFamily: 'ui-monospace, monospace',
                            }}>
                                {formatAmount(task)}
                            </span>

                            {/* Actions cell */}
                            <div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            className="flex items-center justify-center transition-colors hover:text-zinc-300"
                                            style={{
                                                width: 28, height: 28, borderRadius: 6,
                                                background: 'transparent', border: 'none',
                                                color: '#3F3F46', cursor: 'pointer',
                                            }}
                                        >
                                            <MoreHorizontal style={{ width: 14, height: 14 }} />
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
                                            const isOwner = currentUserId && task.assigneeId === currentUserId
                                            if (cs !== 'MARKET' || !ca || !isOwner) return null
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
                        className="flex items-center justify-center"
                        style={{
                            gap: 4,
                            padding: '12px 18px',
                            borderTop: '1px solid rgba(255,255,255,0.05)',
                        }}
                    >
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="flex items-center transition-colors"
                            style={{
                                gap: 3,
                                padding: '6px 12px', borderRadius: 999,
                                background: 'transparent',
                                border: '1px solid rgba(255,255,255,0.08)',
                                color: page === 1 ? '#3F3F46' : '#A1A1AA',
                                fontSize: 11, fontWeight: 600,
                                cursor: page === 1 ? 'default' : 'pointer',
                            }}
                        >
                            <ChevronLeft style={{ width: 12, height: 12 }} />
                            Back
                        </button>

                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                            <button
                                key={n}
                                onClick={() => setPage(n)}
                                className="flex items-center justify-center transition-colors"
                                style={{
                                    width: 30, height: 30, borderRadius: 8,
                                    background: page === n ? 'rgba(99,102,241,0.20)' : 'transparent',
                                    border: page === n ? '1px solid rgba(99,102,241,0.30)' : '1px solid transparent',
                                    color: page === n ? '#A5B4FC' : '#52525B',
                                    fontSize: 11,
                                    fontWeight: page === n ? 800 : 500,
                                    cursor: 'pointer',
                                }}
                            >
                                {n}
                            </button>
                        ))}

                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="flex items-center transition-colors"
                            style={{
                                gap: 3,
                                padding: '6px 12px', borderRadius: 999,
                                background: 'transparent',
                                border: '1px solid rgba(255,255,255,0.08)',
                                color: page === totalPages ? '#3F3F46' : '#A1A1AA',
                                fontSize: 11, fontWeight: 600,
                                cursor: page === totalPages ? 'default' : 'pointer',
                            }}
                        >
                            Next
                            <ChevronRight style={{ width: 12, height: 12 }} />
                        </button>
                    </div>
                )}
            </div>

            {/* ─── Task Detail Modal ─────────────────────── */}
            <TaskDetailModal
                task={selectedTask}
                isOpen={!!selectedTask}
                onClose={() => setSelectedTask(null)}
                isAdmin={isAdmin}
                bulkSelectedIds={selectedIds}
                workspaceId={workspaceId}
            />
        </div>
    )
}
