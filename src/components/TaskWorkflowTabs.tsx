'use client'

import { useState, useCallback, useRef } from 'react'
import { TaskWithUser } from '@/types/admin'
import { TasksDataTable } from './tasks/TasksDataTable'
import { getColumns } from './tasks/columns'
import { TaskDetailModal } from './tasks/TaskDetailModal'
import { deleteTask } from '@/actions/task-management-actions'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

// ─── STATUS MAPPING ─────────────────────────────────
type TabState = 'ASSIGNED' | 'IN_PROGRESS' | 'REVISION' | 'COMPLETED'

interface TabConfig {
    id: TabState
    label: string
    statusValues: string[]
    targetStatus: string
    dotColor: string
    borderColor: string
    textColor: string
    bgHover: string
}

const TAB_CONFIG: TabConfig[] = [
    {
        id: 'ASSIGNED',
        label: 'Nh\u1eadn Task',
        statusValues: ['\u0110\u00e3 nh\u1eadn task', '\u0110ang \u0111\u1ee3i giao', 'T\u1ea1m ng\u01b0ng'],
        targetStatus: '\u0110\u00e3 nh\u1eadn task',
        dotColor: 'bg-blue-500',
        borderColor: 'border-blue-500',
        textColor: 'text-blue-400',
        bgHover: 'bg-blue-500/20',
    },
    {
        id: 'IN_PROGRESS',
        label: '\u0110ang l\u00e0m',
        statusValues: ['\u0110ang th\u1ef1c hi\u1ec7n'],
        targetStatus: '\u0110ang th\u1ef1c hi\u1ec7n',
        dotColor: 'bg-yellow-500',
        borderColor: 'border-yellow-500',
        textColor: 'text-yellow-400',
        bgHover: 'bg-yellow-500/20',
    },
    {
        id: 'REVISION',
        label: 'Revise / Review',
        statusValues: ['Revision', 'S\u1eeda frame', 'Review'],
        targetStatus: 'Revision',
        dotColor: 'bg-red-500',
        borderColor: 'border-red-500',
        textColor: 'text-red-400',
        bgHover: 'bg-red-500/20',
    },
    {
        id: 'COMPLETED',
        label: 'Ho\u00e0n t\u1ea5t',
        statusValues: ['Ho\u00e0n t\u1ea5t'],
        targetStatus: 'Ho\u00e0n t\u1ea5t',
        dotColor: 'bg-emerald-500',
        borderColor: 'border-emerald-500',
        textColor: 'text-emerald-400',
        bgHover: 'bg-emerald-500/20',
    },
]

// ─── DROPPABLE TAB (Native HTML5) ───────────────────
function DroppableTab({ tab, count, isActive, dragOverTabId, onDragOver, onDragLeave, onDrop, onClick }: {
    tab: TabConfig
    count: number
    isActive: boolean
    dragOverTabId: string | null
    onDragOver: (e: React.DragEvent, tabId: TabState) => void
    onDragLeave: () => void
    onDrop: (e: React.DragEvent, tabId: TabState) => void
    onClick: () => void
}) {
    const isOver = dragOverTabId === tab.id

    return (
        <button
            onDragOver={(e) => onDragOver(e, tab.id)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, tab.id)}
            onClick={onClick}
            className={`
                relative px-4 py-2.5 text-sm font-bold flex items-center gap-2 rounded-t-lg transition-all duration-200
                ${isActive ? `bg-white/5 ${tab.textColor} border-b-2 ${tab.borderColor}` : 'text-gray-500 hover:text-gray-300'}
                ${isOver ? `${tab.bgHover} ring-2 ring-white/30 scale-110 shadow-xl` : ''}
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
    tasks: TaskWithUser[]
    users: any[]
    isMobile: boolean
    isAdmin?: boolean
    workspaceId: string
}) {
    const [activeTab, setActiveTab] = useState<TabState>('IN_PROGRESS')
    const [selectedTask, setSelectedTask] = useState<TaskWithUser | null>(null)
    const [rowSelection, setRowSelection] = useState({})
    const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)
    const [isDragging, setIsDragging] = useState(false)
    const router = useRouter()
    const { confirm } = useConfirm()

    const selectedIds = Object.keys(rowSelection)

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

    // ─── Columns ────────────────────────────────────
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

    // ─── Native HTML5 Drag Handlers ─────────────────
    const handleRowDragStart = useCallback((e: React.DragEvent, taskId: string) => {
        setIsDragging(true)
        // Store the task IDs being dragged
        const idsToMove = selectedIds.includes(taskId) ? selectedIds : [taskId]
        e.dataTransfer.setData('text/plain', JSON.stringify(idsToMove))
        e.dataTransfer.effectAllowed = 'move'
    }, [selectedIds])

    const handleRowDragEnd = useCallback(() => {
        setIsDragging(false)
        setDragOverTabId(null)
    }, [])

    const handleTabDragOver = useCallback((e: React.DragEvent, tabId: TabState) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDragOverTabId(tabId)
    }, [])

    const handleTabDragLeave = useCallback(() => {
        setDragOverTabId(null)
    }, [])

    const handleTabDrop = useCallback(async (e: React.DragEvent, tabId: TabState) => {
        e.preventDefault()
        setDragOverTabId(null)
        setIsDragging(false)

        const targetConfig = TAB_CONFIG.find(t => t.id === tabId)
        if (!targetConfig) return

        let taskIdsToUpdate: string[] = []
        try {
            taskIdsToUpdate = JSON.parse(e.dataTransfer.getData('text/plain'))
        } catch { return }

        if (!taskIdsToUpdate.length) return

        // Filter out tasks already in target status
        const actualIds = taskIdsToUpdate.filter(id => {
            const task = tasks.find(t => t.id === id)
            return task && !targetConfig.statusValues.includes(task.status)
        })

        if (actualIds.length === 0) {
            toast.info('Tasks already in this status')
            return
        }

        try {
            if (actualIds.length === 1) {
                const { updateTaskStatus } = await import('@/actions/task-actions')
                const res = await updateTaskStatus(actualIds[0], targetConfig.targetStatus, workspaceId)
                if (res.error) toast.error(res.error)
                else {
                    toast.success(`Task \u2192 ${targetConfig.label}`)
                    setRowSelection({})
                    router.refresh()
                }
            } else {
                const { bulkUpdateStatus } = await import('@/actions/bulk-task-actions')
                const res = await bulkUpdateStatus(actualIds, targetConfig.targetStatus, workspaceId)
                if (res.error) toast.error(res.error)
                else {
                    toast.success(`${res.count} tasks \u2192 ${targetConfig.label}`)
                    setRowSelection({})
                    router.refresh()
                }
            }
        } catch {
            toast.error('Failed to update status')
        }
    }, [tasks, workspaceId, router])

    return (
        <div className="flex flex-col gap-4">
            {/* ─── Tab Headers (Drop Zones) ───────── */}
            <div className="flex gap-2 border-b border-gray-700 pb-2 overflow-x-auto">
                {TAB_CONFIG.map(tab => (
                    <DroppableTab
                        key={tab.id}
                        tab={tab}
                        count={getTasksByTab(tab.id).length}
                        isActive={activeTab === tab.id}
                        dragOverTabId={dragOverTabId}
                        onDragOver={handleTabDragOver}
                        onDragLeave={handleTabDragLeave}
                        onDrop={handleTabDrop}
                        onClick={() => setActiveTab(tab.id)}
                    />
                ))}
            </div>

            {/* ─── Drag Hint ──────────────────────── */}
            {isDragging && (
                <div className="text-center text-xs text-zinc-400 animate-pulse py-1">
                    {'\u2B06'} Drag to a tab above to change status
                </div>
            )}

            {/* ─── Bulk Action Bar ────────────────── */}
            {selectedIds.length > 0 && !isDragging && (
                <div className="bg-zinc-900 border border-zinc-800 p-2 rounded-lg flex items-center justify-between shadow-2xl animate-in slide-in-from-top-2">
                    <span className="text-white font-bold ml-2 text-sm">
                        {selectedIds.length} tasks selected - drag to change status
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
                        No tasks in this status.
                    </div>
                ) : (
                    <div className="glass-panel p-1">
                        <TasksDataTable
                            columns={columns}
                            data={currentTasks}
                            rowSelection={rowSelection}
                            setRowSelection={setRowSelection}
                            enableDrag={isAdmin}
                            onRowDragStart={handleRowDragStart}
                            onRowDragEnd={handleRowDragEnd}
                        />
                    </div>
                )}
            </div>

            {/* ─── Task Detail Modal ──────────────── */}
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
