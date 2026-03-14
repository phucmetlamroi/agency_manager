'use client'

import { useState } from 'react'
import TaskTable from './TaskTable' // Or DesktopTaskTable if separated
import { TaskWithUser } from '@/types/admin'

type TabState = 'ASSIGNED' | 'IN_PROGRESS' | 'REVISION' | 'COMPLETED'

const TAB_CONFIG = [
    { id: 'ASSIGNED', label: '🔵 Nhận Task', color: 'text-blue-400 border-blue-500' },
    { id: 'IN_PROGRESS', label: '🟡 Đang làm', color: 'text-yellow-400 border-yellow-500' },
    { id: 'REVISION', label: '🔴 Revise / Review', color: 'text-red-400 border-red-500' },
    { id: 'COMPLETED', label: '🟢 Hoàn tất', color: 'text-green-400 border-green-500' },
]

export default function TaskWorkflowTabs({ tasks, users, isMobile, isAdmin, workspaceId }: { tasks: TaskWithUser[], users: any[], isMobile: boolean, isAdmin?: boolean, workspaceId: string }) {
    const [activeTab, setActiveTab] = useState<TabState>('IN_PROGRESS')

    // In Progress: User is working
    const inProgressTasks = tasks.filter(t =>
        t.status === 'Đang thực hiện'
    )

    // Revision / Review: Admin attention needed OR User fixing
    // Review: User submitted, Admin needs to check.
    // Revision: Admin writing feedback (Paused).
    // Sửa frame: Specific type.
    const revisionTasks = tasks.filter(t =>
        t.status === 'Revision' ||
        t.status === 'Sửa frame' ||
        t.status === 'Review' // Include Review here so Admin sees it
    )

    const completedTasks = tasks.filter(t => t.status === 'Hoàn tất')

    // Tạm ngưng -> Maybe put in Assigned (Waiting) or a separate bucket?
    // Let's put 'Tạm ngưng' in Assigned for now as it's "On Hold"
    const assignedTasks = tasks.filter(t =>
        (t.status === 'Đã nhận task' || t.status === 'Đang đợi giao' || t.status === 'Tạm ngưng') && t.assignee
    )

    const getTasksByTab = (tab: TabState) => {
        switch (tab) {
            case 'ASSIGNED': return assignedTasks
            case 'IN_PROGRESS': return inProgressTasks
            case 'REVISION': return revisionTasks
            case 'COMPLETED': return completedTasks
            default: return []
        }
    }

    const currentTasks = getTasksByTab(activeTab)

    return (
        <div className="flex flex-col gap-4">
            {/* Tabs Header */}
            <div className="flex gap-2 border-b border-gray-700 pb-2 overflow-x-auto">
                {TAB_CONFIG.map(tab => {
                    const count = getTasksByTab(tab.id as TabState).length
                    const isActive = activeTab === tab.id

                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as TabState)}
                            className={`
                                relative px-4 py-2 text-sm font-bold flex items-center gap-2 rounded-t-lg transition-all
                                ${isActive ? `bg-white/5 ${tab.color} border-b-2` : 'text-gray-500 hover:text-gray-300'}
                            `}
                        >
                            <span>{tab.label}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-gray-800'}`}>
                                {count}
                            </span>
                        </button>
                    )
                })}
            </div>

            {/* Tab Content */}
            <div className="min-h-[400px]">
                {currentTasks.length === 0 ? (
                    <div className="text-center py-10 text-gray-500 italic">
                        Không có task nào ở trạng thái này.
                    </div>
                ) : (
                    <TaskTable
                        tasks={currentTasks}
                        isAdmin={isAdmin ?? true}
                        users={users}
                        isMobile={isMobile}
                        workspaceId={workspaceId}
                    />
                )}
            </div>
        </div>
    )
}
