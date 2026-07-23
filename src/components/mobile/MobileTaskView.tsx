'use client'

import { useState, useEffect, useMemo, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TaskWithUser } from '@/types/admin'
import { deleteTask } from '@/actions/task-management-actions'
import { updateTaskStatus } from '@/actions/task-actions'
import { bulkAssignTasks, bulkUpdateStatus, bulkUpdateTaskStatus } from '@/actions/bulk-task-actions'
import MobileTaskCard from './MobileTaskCard'
import MobileTaskCardSkeleton from './MobileTaskCardSkeleton'
import SwipeableCard, { SwipeAction } from './SwipeableCard'
import PullToRefresh from './PullToRefresh'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { toast } from 'sonner'
import { EmptyState } from '@/components/ui/empty-state'
import { TaskDrawer } from '@/components/mobile/TaskDrawer'
import { PreStartBlockModal } from '@/components/tasks/PreStartBlockModal'
import { motion, AnimatePresence } from 'framer-motion'
import { Pause, CheckCircle2, Send, Play, Check, UserPlus, ArrowLeftRight, X as XIcon } from 'lucide-react'
import { getValidNextStatuses, type ActorRole } from '@/lib/task-state-machine'
import { BOARD_PHASES, type BoardPhaseId, countTasksInPhase, pickInitialPhase } from '@/lib/task-board-phases'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// [Mobile P2 §2b] Bulk "Chuyển…" targets — the FSM-meaningful moves an admin makes on a
// multi-select. Mirrors the desktop board's droppable phase targets + the two universal
// escape hatches (return-to-pool / cancel). bulkUpdateStatus re-validates server-side.
const BULK_STATUS_OPTIONS: { value: string; label: string }[] = [
    { value: 'Đang thực hiện', label: 'Đang làm' },
    { value: 'Đã nộp video (nội bộ)', label: 'Duyệt nội bộ' },
    { value: 'Hoàn tất', label: 'Hoàn tất' },
    { value: 'Đang đợi giao', label: 'Trả về kho đợi' },
    { value: 'Đã hủy', label: 'Huỷ task' },
]

// [visual-parity] Per-phase indicator hex (prototype PH[] + pool lilac). Used for the position
// dots + active-dot glow. Presentational only — task-board-phases.ts statuses[] stay untouched.
const PHASE_HEX: Record<BoardPhaseId, string> = {
    pool: '#A855F7', all: '#3B82F6', progress: '#EAB308', internal: '#6366F1',
    client: '#06B6D4', overdue: '#DC2626', done: '#10B981',
}
function hexA(hex: string, a: number): string {
    const h = hex.replace('#', '')
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${a})`
}

/**
 * Build swipe actions per task based on FSM-valid transitions.
 * Right swipe = primary positive action (Bắt đầu / Nộp bài / Hoàn tất / Gửi lại).
 * Left swipe = pause / return.
 */
function buildSwipeActions(
    task: TaskWithUser,
    isAdmin: boolean,
    onChange: (status: string) => void,
): { right?: SwipeAction; left?: SwipeAction } {
    const actorRole: ActorRole = isAdmin ? 'ADMIN' : 'USER'
    const valid = getValidNextStatuses(task.status, actorRole)

    let right: SwipeAction | undefined
    if (valid.includes('Đang thực hiện') && task.status === 'Nhận task') {
        right = {
            label: 'Bắt đầu',
            icon: Play,
            color: 'bg-primary text-white',
            onAction: () => onChange('Đang thực hiện'),
        }
    } else if (valid.includes('Revision') && task.status === 'Đang thực hiện') {
        right = {
            label: 'Nộp bài',
            icon: Send,
            color: 'bg-amber-600 text-white',
            onAction: () => onChange('Revision'),
        }
    } else if (valid.includes('Hoàn tất') && isAdmin) {
        right = {
            label: 'Hoàn tất',
            icon: CheckCircle2,
            color: 'bg-emerald-600 text-white',
            onAction: () => onChange('Hoàn tất'),
        }
    }

    // [bug-report #2] pause ('Tạm ngưng') removed. Left-swipe = return-to-pool only.
    let left: SwipeAction | undefined
    if (valid.includes('Đang đợi giao')) {
        left = {
            label: 'Trả lại',
            icon: Pause,
            color: 'bg-zinc-700 text-zinc-100',
            onAction: () => onChange('Đang đợi giao'),
        }
    }

    return { right, left }
}

export default function MobileTaskView({ tasks, isAdmin, workspaceId, users, minimal = false }: {
    tasks: TaskWithUser[]
    isAdmin: boolean
    users?: { id: string; username: string; nickname?: string | null; displayName?: string | null }[]
    workspaceId: string
    /** [Owner review 2026-07-11] Bảng theo dõi tiến độ admin dùng thẻ tối giản. */
    minimal?: boolean
}) {
    const router = useRouter()
    const { confirm } = useConfirm()
    const [, startTransition] = useTransition()

    const [selectedTask, setSelectedTask] = useState<TaskWithUser | null>(null)
    const [isDrawerOpen, setIsDrawerOpen] = useState(false)

    // [Sprint P GĐ2] Pre-start blocking popup — mobile parity với desktop.
    const [preStartTask, setPreStartTask] = useState<TaskWithUser | null>(null)
    const [isHydrating, setIsHydrating] = useState(true)

    // [Mobile P2 §2b] Board phase (kanban 6 phase) — replaces the old 5 ad-hoc filter tabs.
    // Single source of truth = BOARD_PHASES (mirrors desktop TaskWorkflowTabs).
    const [activePhase, setActivePhase] = useState<BoardPhaseId>(() => pickInitialPhase(tasks))

    // [Mobile P2 §2b] Long-press multi-select → bulk giao lại / đổi trạng thái (admin only).
    const [selectionMode, setSelectionMode] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

    // [FR-H2] Optimistic UI — cập nhật status NGAY khi bấm, chờ server xác nhận.
    const [optimisticStatus, setOptimisticStatus] = useState<Record<string, { target: string; base: string }>>({})
    const [pendingStatusIds, setPendingStatusIds] = useState<Set<string>>(() => new Set())

    // Danh sách task "hiệu dụng" = tasks server + ghi đè lạc quan.
    const effectiveTasks = useMemo<TaskWithUser[]>(
        () => tasks.map(t => (optimisticStatus[t.id] != null ? { ...t, status: optimisticStatus[t.id].target } : t)),
        [tasks, optimisticStatus],
    )

    // Hide skeleton after first paint (visual fade-in for immediate feedback)
    useEffect(() => {
        const t = setTimeout(() => setIsHydrating(false), 150)
        return () => clearTimeout(t)
    }, [])

    // [FR-H2] Reconcile: khi dữ liệu server mới về (sau refresh), bỏ các ghi đè lạc quan
    // đã được server xác nhận (status khớp) hoặc task không còn.
    useEffect(() => {
        setOptimisticStatus(prev => {
            const ids = Object.keys(prev)
            if (ids.length === 0) return prev
            const next: Record<string, { target: string; base: string }> = {}
            let changed = false
            for (const id of ids) {
                const serverTask = tasks.find(t => t.id === id)
                if (!serverTask || serverTask.status !== prev[id].base) {
                    changed = true
                    continue
                }
                next[id] = prev[id]
            }
            return changed ? next : prev
        })
    }, [tasks])

    // Danh sách đã lọc theo phase đang chọn.
    const activePhaseObj = BOARD_PHASES.find(p => p.id === activePhase) ?? BOARD_PHASES[0]
    const filteredTasks = useMemo(
        () => effectiveTasks.filter(t => activePhaseObj.statuses.includes(t.status)),
        [effectiveTasks, activePhaseObj],
    )

    const phaseCount = (id: BoardPhaseId): number => {
        const p = BOARD_PHASES.find(x => x.id === id)
        return p ? countTasksInPhase(effectiveTasks, p) : 0
    }

    // ── Rail: center the active phase pill ─────────────────────────
    const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({})
    useEffect(() => {
        btnRefs.current[activePhase]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    }, [activePhase])

    // ── Long-press → selection ─────────────────────────────────────
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const touchStart = useRef<{ x: number; y: number } | null>(null)
    // [review-fix] Boolean (not a time window): a long hold of any duration must suppress the
    // trailing synthetic click, else releasing after >500ms toggled the just-selected card off.
    const longPressFiredRef = useRef(false)

    const clearLongPress = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current)
            longPressTimer.current = null
        }
    }
    const handleTouchStart = (task: TaskWithUser) => (e: React.TouchEvent) => {
        if (!isAdmin) return
        const t = e.touches[0]
        touchStart.current = { x: t.clientX, y: t.clientY }
        longPressFiredRef.current = false
        clearLongPress()
        longPressTimer.current = setTimeout(() => {
            setSelectionMode(true)
            setSelectedIds(prev => {
                const next = new Set(prev)
                next.add(task.id)
                return next
            })
            longPressFiredRef.current = true
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(25)
        }, 450)
    }
    const handleTouchMove = (e: React.TouchEvent) => {
        if (!touchStart.current || !longPressTimer.current) return
        const t = e.touches[0]
        if (Math.abs(t.clientX - touchStart.current.x) > 12 || Math.abs(t.clientY - touchStart.current.y) > 12) {
            clearLongPress()
        }
    }

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }
    // Leaving selection empty exits selection mode.
    useEffect(() => {
        if (selectionMode && selectedIds.size === 0) setSelectionMode(false)
    }, [selectionMode, selectedIds])
    const exitSelection = () => {
        setSelectionMode(false)
        setSelectedIds(new Set())
    }

    const handleAction = (task: TaskWithUser) => {
        // A long-press just fired → swallow the trailing click so it doesn't re-toggle.
        if (longPressFiredRef.current) {
            longPressFiredRef.current = false
            return
        }
        if (selectionMode) {
            toggleSelect(task.id)
            return
        }
        // [Sprint P GĐ2] Non-admin click task ở status 'Nhận task' / 'Đã nhận task'
        // → mở PreStartBlockModal (BLOCKING popup) thay vì TaskDrawer.
        if (!isAdmin && (task.status === 'Nhận task' || task.status === 'Đã nhận task')) {
            setPreStartTask(task)
            return
        }
        setSelectedTask(task)
        setIsDrawerOpen(true)
    }

    // [FR-H2] Optimistic status change with rollback.
    const performStatusChange = async (taskId: string, status: string): Promise<boolean> => {
        if (pendingStatusIds.has(taskId)) return false

        const baseStatus = tasks.find(t => t.id === taskId)?.status ?? status
        setOptimisticStatus(prev => ({ ...prev, [taskId]: { target: status, base: baseStatus } }))
        setPendingStatusIds(prev => {
            const next = new Set(prev)
            next.add(taskId)
            return next
        })

        const rollback = () =>
            setOptimisticStatus(prev => {
                if (prev[taskId] == null) return prev
                const next = { ...prev }
                delete next[taskId]
                return next
            })

        let ok = false
        try {
            const res = await updateTaskStatus(taskId, status, workspaceId)
            if ((res as any)?.error) {
                rollback()
                toast.error((res as any).error)
            } else {
                ok = true
                toast.success(`Đã chuyển trạng thái sang "${status}"`)
                startTransition(() => router.refresh())
            }
        } catch {
            rollback()
            toast.error('Không thể cập nhật trạng thái. Vui lòng thử lại.')
        } finally {
            setPendingStatusIds(prev => {
                const next = new Set(prev)
                next.delete(taskId)
                return next
            })
        }
        return ok
    }

    const handleStatusChangeFromDrawer = async (status: string) => {
        if (!selectedTask) return
        const ok = await performStatusChange(selectedTask.id, status)
        if (ok) {
            setIsDrawerOpen(false)
            setSelectedTask(null)
        }
    }

    const handleQuickStatusChange = async (task: TaskWithUser, status: string) => {
        await performStatusChange(task.id, status)
    }

    const handleDelete = async () => {
        if (!selectedTask) return
        if (await confirm({
            title: 'Xoá task',
            message: 'Bạn có chắc muốn xoá task này? Thao tác này không thể hoàn tác.',
            type: 'danger',
            confirmText: 'Xoá',
            cancelText: 'Huỷ'
        })) {
            await deleteTask(selectedTask.id, workspaceId)
            setIsDrawerOpen(false)
            toast.success('Đã xoá task')
            startTransition(() => router.refresh())
        }
    }

    // ── Bulk actions (admin, selection mode) ───────────────────────
    const runBulkAssign = async (assigneeId: string | null) => {
        const ids = [...selectedIds]
        if (!ids.length) return
        try {
            const res: any = await bulkAssignTasks(ids, assigneeId, workspaceId)
            if (res?.error) { toast.error(res.error); return }
            toast.success(assigneeId ? `Đã giao ${res?.count ?? ids.length} task` : `Đã trả ${res?.count ?? ids.length} task về kho`)
            exitSelection()
            startTransition(() => router.refresh())
        } catch {
            toast.error('Giao task thất bại. Vui lòng thử lại.')
        }
    }
    const runBulkStatus = async (status: string) => {
        const ids = [...selectedIds]
        if (!ids.length) return
        try {
            // [review-fix] 'Đã hủy' MUST archive (isArchived=true) so cancelled tasks leave the board
            // AND land in the restorable trash. bulkUpdateStatus (drag-drop) skips archiving → ghosts;
            // bulkUpdateTaskStatus mirrors updateTaskStatus (archives). Other targets keep the
            // permissive board-move path.
            const res: any = status === 'Đã hủy'
                ? await bulkUpdateTaskStatus(ids, status, workspaceId)
                : await bulkUpdateStatus(ids, status, workspaceId)
            if (res?.error) { toast.error(res.error); return }
            toast.success(`Đã chuyển ${res?.count ?? ids.length} task → "${status}"`)
            exitSelection()
            startTransition(() => router.refresh())
        } catch {
            toast.error('Đổi trạng thái thất bại. Vui lòng thử lại.')
        }
    }

    const handleRefresh = async () => {
        await new Promise<void>((resolve) => {
            startTransition(() => {
                router.refresh()
                setTimeout(resolve, 600)
            })
        })
    }

    // [FR-H4 / Pattern 9] Empty state cho phase đang lọc rỗng.
    const renderEmptyState = () => {
        if (effectiveTasks.length === 0) {
            return (
                <EmptyState
                    variant="first-use"
                    title="Chưa có task nào"
                    description="Khi có task được giao, chúng sẽ xuất hiện ở đây."
                />
            )
        }
        const suggestion = BOARD_PHASES.find(p => p.id !== activePhase && countTasksInPhase(effectiveTasks, p) > 0)
        if (suggestion) {
            const n = countTasksInPhase(effectiveTasks, suggestion)
            return (
                <EmptyState
                    variant="no-results"
                    title="Không có task ở giai đoạn này"
                    description={`Có ${n} task ở "${suggestion.label}".`}
                    cta={{
                        label: `Xem ${n} task ${suggestion.label}`,
                        onClick: () => setActivePhase(suggestion.id),
                    }}
                />
            )
        }
        return (
            <EmptyState
                variant="cleared"
                title="Đã xử lý hết task"
                description="Không còn task nào ở giai đoạn này."
            />
        )
    }

    return (
        <div className="mroot relative flex min-h-dvh flex-col gap-3 pb-24">
            {/* ── Phase rail (prototype: text-baseline strip, active = 800/15px + indigo underline) ── */}
            <div
                className="no-scrollbar sticky top-[calc(52px+env(safe-area-inset-top))] z-10"
                style={{ background: 'var(--m-glass-zinc-strong)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid var(--m-border-1)' }}
            >
                <div className="no-scrollbar" style={{ display: 'flex', alignItems: 'baseline', gap: 16, padding: '4px 12px 8px', whiteSpace: 'nowrap', overflowX: 'auto' }}>
                    {BOARD_PHASES.map(phase => {
                        const count = phaseCount(phase.id)
                        const isActive = activePhase === phase.id
                        const isOverdue = phase.id === 'overdue'
                        return (
                            <button
                                key={phase.id}
                                ref={el => { btnRefs.current[phase.id] = el }}
                                onClick={() => setActivePhase(phase.id)}
                                style={{
                                    flex: 'none', background: 'transparent', border: 0, cursor: 'pointer',
                                    display: 'inline-flex', alignItems: 'baseline', gap: 6,
                                    fontSize: isActive ? 15 : 12, fontWeight: isActive ? 800 : 600, letterSpacing: '-0.01em',
                                    color: isActive ? 'var(--m-fg-0)' : isOverdue ? 'var(--m-danger-fg)' : 'var(--m-fg-4)',
                                    borderBottom: isActive ? '2px solid var(--m-primary)' : '2px solid transparent',
                                    paddingBottom: 3, transition: 'color .15s, font-size .15s',
                                    textShadow: isActive ? '0 0 18px var(--m-primary-glow)' : 'none',
                                }}
                            >
                                {phase.label}
                                {count > 0 && (
                                    <span className="m-mono" style={{ fontSize: isActive ? 12 : 11, color: isActive ? 'var(--m-primary-fg)' : 'var(--m-fg-4)' }}>{count}</span>
                                )}
                            </button>
                        )
                    })}
                </div>
                {/* Position dots — per-phase hex, active = wide pill + glow */}
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 7, paddingBottom: 8 }}>
                    {BOARD_PHASES.map(phase => {
                        const isActive = activePhase === phase.id
                        const hex = PHASE_HEX[phase.id]
                        return (
                            <button
                                key={phase.id}
                                aria-label={phase.label}
                                onClick={() => setActivePhase(phase.id)}
                                style={{
                                    width: isActive ? 20 : 6, height: 6, borderRadius: 99, padding: 0, border: 0, cursor: 'pointer',
                                    background: hex, opacity: isActive ? 1 : 0.45,
                                    boxShadow: isActive ? `0 0 10px ${hexA(hex, 0.5)}` : 'none', transition: 'all .2s',
                                }}
                            />
                        )
                    })}
                </div>
            </div>

            {/* Main scrollable list with pull-to-refresh */}
            <PullToRefresh onRefresh={handleRefresh}>
                <div className="space-y-3 px-2">
                    {isHydrating ? (
                        <>
                            <MobileTaskCardSkeleton />
                            <MobileTaskCardSkeleton />
                            <MobileTaskCardSkeleton />
                        </>
                    ) : (
                        <AnimatePresence mode="popLayout">
                            {filteredTasks.map((task, idx) => {
                                const isSelected = selectedIds.has(task.id)
                                const swipe = selectionMode
                                    ? {}
                                    : buildSwipeActions(task, isAdmin, (status) => handleQuickStatusChange(task, status))
                                return (
                                    <motion.div
                                        key={task.id}
                                        layout
                                        onTouchStart={handleTouchStart(task)}
                                        onTouchMove={handleTouchMove}
                                        onTouchEnd={clearLongPress}
                                        onTouchCancel={clearLongPress}
                                        className="relative rounded-2xl"
                                        style={isSelected ? { outline: '2px solid var(--m-primary)', outlineOffset: 0 } : undefined}
                                    >
                                        <SwipeableCard
                                            rightAction={swipe.right}
                                            leftAction={swipe.left}
                                        >
                                            <MobileTaskCard
                                                task={task}
                                                isAdmin={isAdmin}
                                                onAction={handleAction}
                                                onQuickStatusChange={handleQuickStatusChange}
                                                pending={pendingStatusIds.has(task.id)}
                                                index={idx}
                                                minimal={minimal}
                                            />
                                        </SwipeableCard>
                                        {selectionMode && (
                                            <span
                                                className="pointer-events-none absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2"
                                                style={isSelected
                                                    ? { borderColor: 'var(--m-primary)', background: 'var(--m-primary)', color: '#fff' }
                                                    : { borderColor: 'rgba(255,255,255,0.4)', background: 'rgba(24,24,27,0.7)' }}
                                            >
                                                {isSelected && <Check className="h-3.5 w-3.5" />}
                                            </span>
                                        )}
                                    </motion.div>
                                )
                            })}
                        </AnimatePresence>
                    )}

                    {/* [FR-H4] Empty state — Pattern 9 EmptyState với deep-link/CTA */}
                    {!isHydrating && filteredTasks.length === 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="pt-4"
                        >
                            {renderEmptyState()}
                        </motion.div>
                    )}
                </div>
            </PullToRefresh>

            {/* ── Bulk action bar (admin, selection mode) ─────────────── */}
            <AnimatePresence>
                {isAdmin && selectionMode && selectedIds.size > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 24 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="fixed inset-x-3 bottom-[calc(64px+env(safe-area-inset-bottom)+8px)] z-[45] flex items-center justify-between gap-2 rounded-2xl px-3 py-2.5 shadow-2xl shadow-black/60"
                        style={{ background: 'var(--m-glass-zinc-strong)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(99,102,241,0.30)' }}
                    >
                        <span className="text-[13px] font-semibold text-white">
                            Đã chọn <strong>{selectedIds.size}</strong>
                        </span>
                        <div className="flex items-center gap-1.5">
                            {/* Giao lại */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-xs font-bold transition-colors active:brightness-125" style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--m-primary-fg)' }}>
                                        <UserPlus className="h-4 w-4" /> Giao
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="max-h-[50vh] overflow-y-auto">
                                    <DropdownMenuLabel>Giao cho</DropdownMenuLabel>
                                    {(users ?? []).map(u => (
                                        <DropdownMenuItem key={u.id} onClick={() => runBulkAssign(u.id)}>
                                            {u.displayName?.trim() || u.nickname?.trim() || `@${u.username}`}
                                        </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => runBulkAssign(null)}>
                                        Trả về kho đợi
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            {/* Đổi trạng thái */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-xs font-bold transition-colors active:brightness-125" style={{ background: 'var(--m-glass-2)', color: 'var(--m-fg-2)' }}>
                                        <ArrowLeftRight className="h-4 w-4" /> Chuyển
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Chuyển sang</DropdownMenuLabel>
                                    {BULK_STATUS_OPTIONS.map(opt => (
                                        <DropdownMenuItem
                                            key={opt.value}
                                            className={opt.value === 'Đã hủy' ? 'text-red-400 focus:text-red-400' : ''}
                                            onClick={() => runBulkStatus(opt.value)}
                                        >
                                            {opt.label}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            {/* Bỏ chọn */}
                            <button
                                onClick={exitSelection}
                                aria-label="Bỏ chọn"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 transition-colors active:bg-white/10"
                            >
                                <XIcon className="h-4 w-4" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <TaskDrawer
                open={isDrawerOpen}
                onOpenChange={setIsDrawerOpen}
                task={selectedTask}
                isAdmin={isAdmin}
                workspaceId={workspaceId}
                users={users}
                onStatusChange={handleStatusChangeFromDrawer}
                onDelete={handleDelete}
            />

            {/* [Sprint P GĐ2] Pre-start blocking popup — mobile parity với desktop */}
            <PreStartBlockModal
                task={preStartTask}
                isOpen={!!preStartTask}
                workspaceId={workspaceId}
                onClose={() => setPreStartTask(null)}
                onStarted={(updatedTask) => {
                    setPreStartTask(null)
                    setSelectedTask(updatedTask)
                    setIsDrawerOpen(true)
                }}
            />
        </div>
    )
}
