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
    useDroppable,
    PointerSensor,
    useSensor,
    useSensors,
    DragStartEvent,
    DragEndEvent,
    closestCenter,
} from '@dnd-kit/core'

// ─── STATUS MAPPING (Vietnamese with diacritics to match DB) ──
type TabState = 'ASSIGNED' | 'IN_PROGRESS' | 'REVISION' | 'COMPLETED'

const TAB_CONFIG = [
    {
        id: 'ASSIGNED' as TabState,
        label: 'Nh\u1eadn Task',
        statusValues: ['\u0110\u00e3 nh\u1eadn task', '\u0110ang \u0111\u1ee3i giao', 'T\u1ea1m ng\u01b0ng'],
        targetStatus: '\u0110\u00e3 nh\u1eadn task',
        dotColor: 'bg-blue-500',
        borderColor: 'border-blue-500',
        textColor: 'text-blue-400',
        ringColor: 'ring-blue-500/50',
    },
    {
        id: 'IN_PROGRESS' as TabState,
        label: '\u0110ang l\u00e0m',
        statusValues: ['\u0110ang th\u1ef1c hi\u1ec7n'],
        targetStatus: '\u0110ang th\u1ef1c hi\u1ec7n',
        dotColor: 'bg-yellow-500',
        borderColor: 'border-yellow-500',
        textColor: 'text-yellow-400',
        ringColor: 'ring-yellow-500/50',
    },
    {
        id: 'REVISION' as TabState,
        label: 'Revise / Review',
        statusValues: ['Revision', 'S\u1eeda frame', 'Review'],
        targetStatus: 'Revision',
        dotColor: 'bg-red-500',
        borderColor: 'border-red-500',
        textColor: 'text-red-400',
        ringColor: 'ring-red-500/50',
    },
    {
        id: 'COMPLETED' as TabState,
        label: 'Ho\u00e0n t\u1ea5t',
        statusValues: ['Ho\u00e0n t\u1ea5t'],
        targetStatus: 'Ho\u00e0n t\u1ea5t',
        dotColor: 'bg-emerald-500',
        borderColor: 'border-emerald-500',
        textColor: 'text-emerald-400',
        ringColor: 'ring-emerald-500/50',
    },
]

// ─── DROPPABLE TAB ──────────────────────────────────
function DroppableTab({ tab, count, isActive, isDragging, onClick }: {
    tab: typeof TAB_CONFIG[0],
    count: number,
    isActive: boolean,
    isDragging: boolean,
    onClick: () => void,
}) {
    const { setNodeRef, isOver } = useDroppable({ id: `drop-${tab.id}` })

    return (
        <button
            ref={setNodeRef}
            onClick={onClick}
            className={`
                relative px-4 py-2.5 text-sm font-bold flex items-center gap-2 rounded-t-lg transition-all duration-200
                ${isActive ? `bg-white/5 ${tab.textColor} border-b-2 ${tab.borderColor}` : 'text-gray-500 hover:text-gray-300'}
                ${isOver ? `ring-2 ${tab.ringColor} bg-white/15 scale-110 shadow-xl shadow-white/5` : ''}
                ${isDragging && !isOver ? 'ring-1 ring-dashed ring-white/20 scale-[1.02]' : ''}
            `}
        >
            <span className={`w-2.5 h-2.5 rounded-full ${tab.dotColor} ${isOver ? 'animate-ping' : ''}`} />
            <span>{tab.label}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-gray-800'}`}>
                {count}
            </span>
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
    const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
    const [dragCount, setDragCount] = useState(0)
    const router = useRouter()
    const { confirm } = useConfirm()

    const selectedIds = Object.keys(rowSelection)

    // Sensor: require 5px movement before drag starts
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
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
            if (!isAdmin && task.status === '\u0110\u00e3 nh\u1eadn task') {
                toast.warning('Vui l\u00f2ng b\u1ea5m "B\u1eaft \u0111\u1ea7u" \u0111\u1ec3 m\u1edf kh\u00f3a task!')
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
        const id = event.active.id as string
        setIsDragging(true)
        setDraggedTaskId(id)

        // Count: if dragged item is selected, drag all selected; otherwise just 1
        if (selectedIds.includes(id)) {
            setDragCount(selectedIds.length)
        } else {
            setDragCount(1)
        }
    }

    const handleDragEnd = async (event: DragEndEvent) => {
        setIsDragging(false)
        setDraggedTaskId(null)
        setDragCount(0)

        const { active, over } = event
        if (!over) return

        const dropTarget = over.id as string
        if (!dropTarget.startsWith('drop-')) return

        const targetTabId = dropTarget.replace('drop-', '') as TabState
        const targetConfig = TAB_CONFIG.find(t => t.id === targetTabId)
        if (!targetConfig) return

        const targetStatus = targetConfig.targetStatus
        const draggedId = active.id as string

        // Determine IDs to update
        const taskIdsToUpdate = selectedIds.includes(draggedId)
            ? selectedIds
            : [draggedId]

        // Filter: skip tasks already in target status
        const actualTasksToUpdate = taskIdsToUpdate.filter(id => {
            const task = tasks.find(t => t.id === id)
            return task && !targetConfig.statusValues.includes(task.status)
        })

        if (actualTasksToUpdate.length === 0) {
            toast.info('Tasks are already in this status')
            return
        }

        // Execute
        try {
            if (actualTasksToUpdate.length === 1) {
                const { updateTaskStatus } = await import('@/actions/task-actions')
                const res = await updateTaskStatus(actualTasksToUpdate[0], targetStatus, workspaceId)
                if (res.error) {
                    toast.error(res.error)
                } else {
                    toast.success(`Task \u2192 ${targetConfig.label}`)
                    setRowSelection({})
                    router.refresh()
                }
            } else {
                const { bulkUpdateStatus } = await import('@/actions/bulk-task-actions')
                const res = await bulkUpdateStatus(actualTasksToUpdate, targetStatus, workspaceId)
                if (res.error) {
                    toast.error(res.error)
                } else {
                    toast.success(`${res.count} tasks \u2192 ${targetConfig.label}`)
                    setRowSelection({})
                    router.refresh()
                }
            }
        } catch (err) {
            toast.error('Failed to update status')
        }
    }

    // Find dragged task name for overlay
    const draggedTask = draggedTaskId ? tasks.find(t => t.id === draggedTaskId) : null

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="flex flex-col gap-4">
                {/* ─── Tab Headers (Drop Zones) ───────── */}
                <div className="flex gap-2 border-b border-gray-700 pb-2 overflow-x-auto">
                    {TAB_CONFIG.map(tab => (
                        <DroppableTab
                            key={tab.id}
                            tab={tab}
                            count={getTasksByTab(tab.id).length}
                            isActive={activeTab === tab.id}
                            isDragging={isDragging}
                            onClick={() => setActiveTab(tab.id)}
                        />
                    ))}
                </div>

                {/* ─── Drag Hint ──────────────────────── */}
                {isDragging && (
                    <div className="text-center text-xs text-zinc-400 animate-pulse py-1">
                        {dragCount > 1
                            ? `\u2B06 Th\u1ea3 ${dragCount} tasks v\u00e0o tab ph\u00eda tr\u00ean`
                            : '\u2B06 Th\u1ea3 v\u00e0o tab ph\u00eda tr\u00ean \u0111\u1ec3 \u0111\u1ed5i tr\u1ea1ng th\u00e1i'}
                    </div>
                )}

                {/* ─── Bulk Action Bar ────────────────── */}
                {selectedIds.length > 0 && !isDragging && (
                    <div className="bg-zinc-900 border border-zinc-800 p-2 rounded-lg flex items-center justify-between shadow-2xl animate-in slide-in-from-top-2">
                        <span className="text-white font-bold ml-2 text-sm">
                            {selectedIds.length} tasks - k\u00e9o \u0111\u1ec3 \u0111\u1ed5i tr\u1ea1ng th\u00e1i
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
                            Kh\u00f4ng c\u00f3 task n\u00e0o \u1edf tr\u1ea1ng th\u00e1i n\u00e0y.
                        </div>
                    ) : (
                        <div className="glass-panel p-1">
                            <TasksDataTable
                                columns={columns}
                                data={currentTasks}
                                rowSelection={rowSelection}
                                setRowSelection={setRowSelection}
                                enableDrag={isAdmin}
                                draggedId={draggedTaskId}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Drag Overlay (follows cursor) ──── */}
            <DragOverlay dropAnimation={null}>
                {isDragging && draggedTask ? (
                    <div className="bg-zinc-900/95 border border-indigo-500/60 px-4 py-2.5 rounded-lg shadow-2xl shadow-indigo-500/30 backdrop-blur-md pointer-events-none max-w-[300px]">
                        <div className="text-sm font-bold text-white truncate">
                            {dragCount > 1 ? `${dragCount} tasks` : draggedTask.title}
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">
                            {dragCount > 1
                                ? 'Th\u1ea3 v\u00e0o tab \u0111\u1ec3 \u0111\u1ed5i tr\u1ea1ng th\u00e1i'
                                : draggedTask.client?.name || ''}
                        </div>
                    </div>
                ) : null}
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
