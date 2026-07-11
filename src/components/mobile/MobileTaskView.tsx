'use client'

import { useState, useEffect, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TaskWithUser } from '@/types/admin'
import { deleteTask } from '@/actions/task-management-actions'
import { updateTaskStatus } from '@/actions/task-actions'
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
import { Pause, CheckCircle2, Send, Play } from 'lucide-react'
import { getValidNextStatuses, type ActorRole } from '@/lib/task-state-machine'

type TabKey = 'DOING' | 'ASSIGNED' | 'REVISE' | 'OVERDUE' | 'ALL'

// Tab labels match desktop NewDesktopTaskTable (English labels, Vietnamese
// status badge values bên trong card). Đồng nhất với PC.
const TAB_LABELS: Record<TabKey, string> = {
    DOING: 'Đang làm',
    ASSIGNED: 'Nhận task',
    REVISE: 'Cần sửa',
    OVERDUE: 'Quá hạn',
    ALL: 'Tất cả',
}

const TAB_ORDER: TabKey[] = ['DOING', 'ASSIGNED', 'REVISE', 'OVERDUE', 'ALL']

// Count tasks for a given tab (shared by the badge counts + initial-tab picker).
function countForTab(tasks: TaskWithUser[], tab: TabKey): number {
    if (tab === 'ASSIGNED') return tasks.filter(t => t.status === 'Nhận task').length
    if (tab === 'DOING') return tasks.filter(t => t.status === 'Đang thực hiện').length
    if (tab === 'REVISE') return tasks.filter(t => t.status === 'Revision').length
    if (tab === 'OVERDUE') return tasks.filter(t => t.status === 'Quá hạn').length
    return tasks.length
}

// [FR-D2] Default tab = first tab (in TAB_ORDER) that actually has data; fall back
// to ALL when every bucket is empty. Prevents landing on an empty "Đang làm" tab.
function pickInitialTab(tasks: TaskWithUser[]): TabKey {
    return TAB_ORDER.find(tab => countForTab(tasks, tab) > 0) ?? 'ALL'
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

    // Filter State
    const [filteredTasks, setFilteredTasks] = useState<TaskWithUser[]>([])
    // [FR-D2] Initialise to the first non-empty tab so the default view has data.
    const [activeTab, setActiveTab] = useState<TabKey>(() => pickInitialTab(tasks))

    // [FR-H2] Optimistic UI — cập nhật status NGAY khi bấm, chờ server xác nhận.
    // Map taskId → status ghi đè lạc quan (xoá khi server bắt kịp hoặc rollback khi lỗi).
    // target = status lạc quan hiển thị; base = status server TRƯỚC khi ghi đè (để reconcile).
    const [optimisticStatus, setOptimisticStatus] = useState<Record<string, { target: string; base: string }>>({})
    // Các task đang có request status bay trên đường — khoá control để chặn double-submit.
    const [pendingStatusIds, setPendingStatusIds] = useState<Set<string>>(() => new Set())

    // Danh sách task "hiệu dụng" = tasks server + ghi đè lạc quan → badge/filter/count
    // đều phản chiếu status mới ngay lập tức, khớp đúng kết quả sau router.refresh().
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
    // đã được server xác nhận (status khớp) hoặc task không còn — tránh badge cũ bị kẹt.
    useEffect(() => {
        setOptimisticStatus(prev => {
            const ids = Object.keys(prev)
            if (ids.length === 0) return prev
            const next: Record<string, { target: string; base: string }> = {}
            let changed = false
            for (const id of ids) {
                const serverTask = tasks.find(t => t.id === id)
                // Bỏ ghi đè NGAY khi server đã DỜI khỏi baseline (refetch đã về → server là chân lý),
                // dù server dừng ở target của ta HAY một status khác (đổi nền/đồng thời → server thắng,
                // không kẹt badge cũ). Chỉ giữ peek khi server vẫn ở baseline (refetch chưa phản ánh).
                if (!serverTask || serverTask.status !== prev[id].base) {
                    changed = true
                    continue
                }
                next[id] = prev[id]
            }
            return changed ? next : prev
        })
    }, [tasks])

    // Filter Logic — lọc trên danh sách hiệu dụng (đã áp status lạc quan)
    useEffect(() => {
        let res = effectiveTasks
        if (activeTab === 'ASSIGNED') res = effectiveTasks.filter(t => t.status === 'Nhận task')
        if (activeTab === 'DOING') res = effectiveTasks.filter(t => t.status === 'Đang thực hiện')
        if (activeTab === 'REVISE') res = effectiveTasks.filter(t => t.status === 'Revision')
        if (activeTab === 'OVERDUE') res = effectiveTasks.filter(t => t.status === 'Quá hạn')
        setFilteredTasks(res)
    }, [effectiveTasks, activeTab])

    const tabCount = (tab: TabKey): number => countForTab(effectiveTasks, tab)

    // [Sprint P audit-fix] handleTaskClick is dead code — MobileTaskCard
    // actually calls handleAction (line ~263 below: onAction={handleAction}).
    // Gate moved to handleAction so mobile actually enforces PreStartBlockModal.

    const handleAction = (task: TaskWithUser) => {
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
    // 1) Ghi đè status ngay (badge/filter cập nhật tức thì) + khoá control (pending).
    // 2) Gọi server. Lỗi/exception → gỡ ghi đè (khôi phục ĐÚNG status server trước đó) + toast.
    //    Thành công → giữ ghi đè, refresh; reconcile effect sẽ dọn khi server bắt kịp.
    // Không dùng cho DELETE (delete phải chờ server xác nhận).
    const performStatusChange = async (taskId: string, status: string): Promise<boolean> => {
        // Chặn double-submit (bấm/swipe/popover cùng lúc trên 1 task đang bay).
        if (pendingStatusIds.has(taskId)) return false

        // Baseline = status server hiện tại (trước khi ghi đè) — reconcile nhường server bất cứ khi
        // nào nó dời khỏi baseline (kể cả dời sang status KHÁC target, do đổi nền/đồng thời).
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
                // Server data will catch up; reconcile effect clears the override.
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

    const handleRefresh = async () => {
        await new Promise<void>((resolve) => {
            startTransition(() => {
                router.refresh()
                // Give Next a beat to fetch
                setTimeout(resolve, 600)
            })
        })
    }

    // [FR-H4 / Pattern 9] Empty state cho tab đang lọc rỗng.
    //  • cả list rỗng → 'first-use' ("Chưa có task nào").
    //  • tab này rỗng nhưng tab khác còn task → 'no-results' + deep-link sang tab đó.
    //  • hết task ở bộ lọc (không có tab gợi ý) → 'cleared' + lối về "Tất cả".
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
        const suggestion = TAB_ORDER.find(
            t => t !== activeTab && t !== 'ALL' && countForTab(effectiveTasks, t) > 0,
        )
        if (suggestion) {
            const n = countForTab(effectiveTasks, suggestion)
            return (
                <EmptyState
                    variant="no-results"
                    title="Không có task ở bộ lọc này"
                    description={`Có ${n} task ở "${TAB_LABELS[suggestion]}".`}
                    cta={{
                        label: `Xem ${n} task ${TAB_LABELS[suggestion]}`,
                        onClick: () => setActiveTab(suggestion),
                    }}
                />
            )
        }
        return (
            <EmptyState
                variant="cleared"
                title="Đã xử lý hết task"
                description="Không còn task nào ở bộ lọc này."
                cta={activeTab !== 'ALL' ? { label: 'Xem tất cả task', onClick: () => setActiveTab('ALL') } : undefined}
            />
        )
    }

    return (
        <div className="flex flex-col gap-3 pb-24 relative min-h-dvh">
            {/* Mobile Tabs - Sticky */}
            <div className="flex gap-2 overflow-x-auto pb-3 pt-2 px-2 no-scrollbar sticky top-[calc(52px+env(safe-area-inset-top))] bg-zinc-950/85 backdrop-blur-xl z-10 border-b border-white/5 shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
                {TAB_ORDER.map(tab => {
                    const count = tabCount(tab)
                    const isActive = activeTab === tab
                    return (
                        <motion.button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            whileTap={{ scale: 0.94 }}
                            className={`relative px-3.5 py-2 rounded-full text-xs font-bold uppercase whitespace-nowrap transition-colors border ${isActive
                                ? 'bg-white text-black border-white shadow-md shadow-white/10'
                                : 'bg-zinc-900/70 text-zinc-400 border-white/8 hover:text-zinc-200'
                                }`}
                        >
                            <span className="flex items-center gap-1.5">
                                {TAB_LABELS[tab]}
                                {count > 0 && (
                                    <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] flex items-center justify-center ${isActive ? 'bg-zinc-900 text-white' : 'bg-white/10 text-zinc-300'
                                        }`}>
                                        {count}
                                    </span>
                                )}
                            </span>
                        </motion.button>
                    )
                })}
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
                                const swipe = buildSwipeActions(task, isAdmin, (status) => handleQuickStatusChange(task, status))
                                return (
                                    <motion.div key={task.id} layout>
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
