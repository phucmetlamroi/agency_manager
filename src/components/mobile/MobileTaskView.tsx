'use client'

import { useState, useEffect, useMemo, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TaskWithUser } from '@/types/admin'
import { deleteTask } from '@/actions/task-management-actions'
import { updateTaskStatus } from '@/actions/task-actions'
import { bulkAssignTasks, bulkUpdateStatus } from '@/actions/bulk-task-actions'
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
    const suppressClickRef = useRef(0)

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
        clearLongPress()
        longPressTimer.current = setTimeout(() => {
            setSelectionMode(true)
            setSelectedIds(prev => {
                const next = new Set(prev)
                next.add(task.id)
                return next
            })
            suppressClickRef.current = Date.now()
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
        if (Date.now() - suppressClickRef.current < 500) {
            suppressClickRef.current = 0
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
            const res: any = await bulkUpdateStatus(ids, status, workspaceId)
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
        <div className="relative flex min-h-dvh flex-col gap-3 pb-24">
            {/* ── Phase rail (kanban 6 phase) — horizontal snap, active centered ── */}
            <div className="sticky top-[calc(52px+env(safe-area-inset-top))] z-10 border-b border-white/5 bg-zinc-950/85 pb-2 pt-2 shadow-[0_4px_20px_rgba(0,0,0,0.4)] backdrop-blur-xl">
                <div className="no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto px-3">
                    {BOARD_PHASES.map(phase => {
                        const count = phaseCount(phase.id)
                        const isActive = activePhase === phase.id
                        return (
                            <motion.button
                                key={phase.id}
                                ref={el => { btnRefs.current[phase.id] = el }}
                                onClick={() => setActivePhase(phase.id)}
                                whileTap={{ scale: 0.94 }}
                                className={`relative flex shrink-0 snap-center items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-bold transition-colors ${isActive
                                    ? 'border-white bg-white text-black shadow-md shadow-white/10'
                                    : 'border-white/8 bg-zinc-900/70 text-zinc-400 hover:text-zinc-200'
                                    }`}
                            >
                                <span
                                    className="h-2 w-2 shrink-0 rounded-full"
                                    style={{ background: isActive ? '#000' : phase.color, opacity: isActive ? 0.85 : 1 }}
                                />
                                {phase.label}
                                {count > 0 && (
                                    <span className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] ${isActive ? 'bg-zinc-900 text-white' : 'bg-white/10 text-zinc-300'
                                        }`}>
                                        {count}
                                    </span>
                                )}
                            </motion.button>
                        )
                    })}
                </div>
                {/* Position dots — 6 phase indicator */}
                <div className="mt-2 flex items-center justify-center gap-1.5">
                    {BOARD_PHASES.map(phase => {
                        const isActive = activePhase === phase.id
                        return (
                            <button
                                key={phase.id}
                                aria-label={phase.label}
                                onClick={() => setActivePhase(phase.id)}
                                className="rounded-full transition-all"
                                style={{
                                    width: isActive ? 18 : 6,
                                    height: 6,
                                    background: isActive ? phase.color : 'rgba(255,255,255,0.18)',
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
                                        className={`relative rounded-2xl ${isSelected ? 'outline outline-2 outline-primary' : ''}`}
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
                                                className={`pointer-events-none absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 ${isSelected ? 'border-primary bg-primary text-white' : 'border-white/40 bg-zinc-900/70'
                                                    }`}
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
                        className="fixed inset-x-3 bottom-[calc(64px+env(safe-area-inset-bottom)+8px)] z-[45] flex items-center justify-between gap-2 rounded-2xl border border-primary/30 bg-zinc-950/95 px-3 py-2.5 shadow-2xl shadow-black/60 backdrop-blur-xl"
                    >
                        <span className="text-[13px] font-semibold text-white">
                            Đã chọn <strong>{selectedIds.size}</strong>
                        </span>
                        <div className="flex items-center gap-1.5">
                            {/* Giao lại */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-primary/15 px-3 text-xs font-bold text-primary-accent transition-colors active:bg-primary/25">
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
                                    <button className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-white/5 px-3 text-xs font-bold text-zinc-200 transition-colors active:bg-white/10">
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
