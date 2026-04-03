'use client'

import { useState, useCallback } from 'react'
import { TaskWithUser } from '@/types/admin'
import { TasksDataTable } from './tasks/TasksDataTable'
import { getColumns } from './tasks/columns'
import { TaskDetailModal } from './tasks/TaskDetailModal'
import { deleteTask } from '@/actions/task-management-actions'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
    DndContext,
    DragOverlay,
    useDraggable,
    useDroppable,
    PointerSensor,
    useSensor,
    useSensors,
    DragStartEvent,
    DragEndEvent,
} from '@dnd-kit/core'

// ─── STATUS MAPPING ─────────────────────────────────
type TabState = 'ASSIGNED' | 'IN_PROGRESS' | 'REVISION' | 'COMPLETED'

const TAB_CONFIG = [
    { id: 'ASSIGNED' as TabState, label: 'Nhan Task', statusValues: ['Da nhan task', 'Dang doi giao', 'Tam ngung'], targetStatus: 'Da nhan task', dotColor: 'bg-blue-500', borderColor: 'border-blue-500', textColor: 'text-blue-400' },
    { id: 'IN_PROGRESS' as TabState, label: 'Dang lam', statusValues: ['Dang thuc hien'], targetStatus: 'Dang thuc hien', dotColor: 'bg-yellow-500', borderColor: 'border-yellow-500', textColor: 'text-yellow-400' },
    { id: 'REVISION' as TabState, label: 'Revise / Review', statusValues: ['Revision', 'Sua frame', 'Review'], targetStatus: 'Revision', dotColor: 'bg-red-500', borderColor: 'border-red-500', textColor: 'text-red-400' },
    { id: 'COMPLETED' as TabState, label: 'Hoan tat', statusValues: ['Hoan tat'], targetStatus: 'Hoan tat', dotColor: 'bg-emerald-500', borderColor: 'border-emerald-500', textColor: 'text-emerald-400' },
]

// ─── DROPPABLE TAB ──────────────────────────────────
function DroppableTab({ tab, count, isActive, isDraggedOver, onClick }: {
    tab: typeof TAB_CONFIG[0],
    count: number,
    isActive: boolean,
    isDraggedOver: boolean,
    onClick: () => void,
}) {
    const { setNodeRef, isOver } = useDroppable({ id: `drop-${tab.id}` })
    const isHighlighted = isDraggedOver || isOver

    return (
        <button
            ref={setNodeRef}
            onClick={onClick}
            className={`
                relative px-4 py-2.5 text-sm font-bold flex items-center gap-2 rounded-t-lg transition-all duration-200
                ${isActive ? `bg-white/5 ${tab.textColor} border-b-2 ${tab.borderColor}` : 'text-gray-500 hover:text-gray-300'}
                ${isHighlighted ? `ring-2 ${tab.borderColor} bg-white/10 scale-105 shadow-lg` : ''}
            `}
        >
            <span className={`w-2.5 h-2.5 rounded-full ${tab.dotColor} ${isHighlighted ? 'animate-pulse' : ''}`} />
            <span>{tab.label}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-gray-800'}`}>
                {count}
            </span>
            {isHighlighted && (
                <span className="absolute inset-0 rounded-t-lg border-2 border-dashed animate-pulse pointer-events-none" style={{ borderColor: 'inherit' }} />
            )}
        </button>
    )
}

// ─── MAIN COMPONENT ─────────────────────────────────
export default function TaskWorkflowTabs({ tasks, users, isMobile, isAdmin, workspaceId }: {
    tasks: TaskWithUser[],
    users: any[],
    isMobile: boolean,
    isAdmin?: boolean,
    workspaceId: string
}) {
    const [activeTab, setActiveTab] = useState<TabState>('IN_PROGRESS')
    const [selectedTask, setSelectedTask] = useState<TaskWithUser | null>(null)
    const [rowSelection, setRowSelection] = useState({})
    const [isDragging, setIsDragging] = useState(false)
    const [dragCount, setDragCount] = useState(0)
    const router = useRouter()
    const { confirm } = useConfirm()

    const selectedIds = Object.keys(rowSelection)

    // Sensors (require 8px movement before drag starts — prevents accidental drags)
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    )

    // ─── Filter tasks by tab ────────────────────────
    const getTasksByTab = useCallback((tab: TabState) => {
        const config = TAB_CONFIG.find(t => t.id === tab)
        if (!config) return []
        return tasks.filter(t => {
            if (tab === 'ASSIGNED') return config.statusValues.includes(t.status) && t.assignee
            return config.statusValues.includes(t.status)
        })
    }, [tasks])

    const currentTasks = getTasksByTab(activeTab)

    // ─── Delete handlers ────────────────────────────
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

    // ─── Columns (no Status column for admin) ───────
    const columns = getColumns(
        users,
        isAdmin ?? false,
        (task) => {
            if (!isAdmin && task.status === 'Da nhan task') {
                toast.warning('Vui long bam "Bat dau" de mo khoa task!')
                return
            }
            setSelectedTask(task)
        },
        workspaceId,
        handleDelete,
        selectedIds
    )

    // ─── DnD Handlers ───────────────────────────────
    const handleDragStart = (event: DragStartEvent) => {
        setIsDragging(true)
        const draggedId = event.active.id as string
        // How many are being dragged? If dragged item is in selection, drag all selected
        if (selectedIds.includes(draggedId)) {
            setDragCount(selectedIds.length)
        } else {
            setDragCount(1)
        }
    }

    const handleDragEnd = async (event: DragEndEvent) => {
        setIsDragging(false)
        setDragCount(0)

        const { active, over } = event
        if (!over) return

        const dropTarget = over.id as string
        if (!dropTarget.startsWith('drop-')) return

        const targetTabId = dropTarget.replace('drop-', '') as TabState
        const targetConfig = TAB_CONFIG.find(t => t.id === targetTabId)
        if (!targetConfig) return

        const targetStatus = targetConfig.targetStatus
        const draggedTaskId = active.id as string

        // Determine which task IDs to update
        const taskIdsToUpdate = selectedIds.includes(draggedTaskId)
            ? selectedIds // Bulk: all selected
            : [draggedTaskId] // Single

        // Filter out tasks that are already in the target status
        const actualTasksToUpdate = taskIdsToUpdate.filter(id => {
            const task = tasks.find(t => t.id === id)
            return task && !targetConfig.statusValues.includes(task.status)
        })

        if (actualTasksToUpdate.length === 0) {
            toast.info('Tasks are already in this status')
            return
        }

        // Execute the status change
        try {
            if (actualTasksToUpdate.length === 1) {
                const { updateTaskStatus } = await import('@/actions/task-actions')
                const res = await updateTaskStatus(actualTasksToUpdate[0], targetStatus, workspaceId)
                if (res.error) {
                    toast.error(res.error)
                } else {
                    toast.success(`Task -> ${targetConfig.label}`)
                    setRowSelection({})
                    router.refresh()
                }
            } else {
                // Bulk status update
                const { bulkUpdateStatus } = await import('@/actions/bulk-task-actions')
                const res = await bulkUpdateStatus(actualTasksToUpdate, targetStatus, workspaceId)
                if (res.error) {
                    toast.error(res.error)
                } else {
                    toast.success(`${res.count} tasks -> ${targetConfig.label}`)
                    setRowSelection({})
                    router.refresh()
                }
            }
        } catch (err) {
            toast.error('Failed to update status')
        }
    }

    return (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex flex-col gap-4">
                {/* ─── Tab Headers (Drop Zones) ───────── */}
                <div className="flex gap-2 border-b border-gray-700 pb-2 overflow-x-auto">
                    {TAB_CONFIG.map(tab => (
                        <DroppableTab
                            key={tab.id}
                            tab={tab}
                            count={getTasksByTab(tab.id).length}
                            isActive={activeTab === tab.id}
                            isDraggedOver={isDragging}
                            onClick={() => setActiveTab(tab.id)}
                        />
                    ))}
                </div>

                {/* ─── Drag Hint ──────────────────────── */}
                {isDragging && (
                    <div className="text-center text-xs text-zinc-400 animate-pulse py-1">
                        {dragCount > 1 ? `Keo ${dragCount} tasks vao tab phia tren de doi trang thai` : 'Tha vao tab phia tren de doi trang thai'}
                    </div>
                )}

                {/* ─── Bulk Action Bar ────────────────── */}
                {selectedIds.length > 0 && !isDragging && (
                    <div className="bg-zinc-900 border border-zinc-800 p-2 rounded-lg flex items-center justify-between shadow-2xl animate-in slide-in-from-top-2">
                        <span className="text-white font-bold ml-2 text-sm">
                            {selectedIds.length} tasks selected - keo de doi trang thai
                        </span>
                        <div className="flex gap-2">
                            {isAdmin && (
                                <button
                                    onClick={handleBulkDelete}
                                    className="px-3 py-1.5 bg-red-900/40 hover:bg-red-900/60 text-red-200 rounded-md text-[11px] font-bold border border-red-500/20"
                                >
                                    Delete
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* ─── Task Table ─────────────────────── */}
                <div className="min-h-[400px]">
                    {currentTasks.length === 0 ? (
                        <div className="text-center py-10 text-gray-500 italic">
                            Khong co task nao o trang thai nay.
                        </div>
                    ) : (
                        <div className="glass-panel p-1">
                            <TasksDataTable
                                columns={columns}
                                data={currentTasks}
                                rowSelection={rowSelection}
                                setRowSelection={setRowSelection}
                                enableDrag={isAdmin}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Drag Overlay ───────────────────── */}
            <DragOverlay>
                {isDragging && (
                    <div className="bg-zinc-900/95 border border-indigo-500/50 px-4 py-2 rounded-lg shadow-2xl shadow-indigo-500/20 text-sm font-bold text-white backdrop-blur-md">
                        {dragCount > 1 ? `${dragCount} tasks` : 'Moving task...'}
                    </div>
                )}
            </DragOverlay>

            {/* ─── Task Detail Modal ──────────────── */}
            <TaskDetailModal
                task={selectedTask}
                isOpen={!!selectedTask}
                onClose={() => setSelectedTask(null)}
                isAdmin={isAdmin ?? false}
                bulkSelectedIds={selectedIds}
                workspaceId={workspaceId}
            />
        </DndContext>
    )
}
