'use client'

import { useState } from 'react'
import { assignTask } from '@/actions/task-management-actions'
import { TaskWithUser } from '@/types/admin'
import { toast } from 'sonner'
import Stopwatch from '@/components/Stopwatch'

export default function AgencyTaskTable({ tasks, members }: { tasks: TaskWithUser[], members: any[] }) {

    return (
        <div className="flex flex-col gap-4">
            {tasks.map(task => (
                <div key={task.id} className="bg-[#1a1a1a] border border-white/5 p-4 rounded-xl flex flex-col md:flex-row gap-4 items-start md:items-center justify-between group hover:border-blue-500/30 transition-all">

                    {/* Task Info */}
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded border border-blue-500/20">
                                {task.project?.name || task.client?.name || 'No Client'}
                            </span>
                            <span className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
                                {task.type}
                            </span>
                            {task.status === 'Đang đợi giao' && (
                                <span className="text-[10px] bg-purple-500 text-white font-bold px-2 py-0.5 rounded animate-pulse">
                                    NEW ASSIGNMENT
                                </span>
                            )}
                        </div>
                        <h3 className="text-lg font-bold text-white">{task.title}</h3>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                            <span>💰 {task.value.toLocaleString()} đ</span>
                            <span>📅 {task.deadline ? new Date(task.deadline).toLocaleDateString('vi-VN') : 'No Deadline'}</span>
                        </div>
                    </div>

                    {/* Assignment Control */}
                    <div className="flex items-center gap-4">

                        {/* Staff Selector */}
                        <div className="flex flex-col items-end gap-1">
                            <label className="text-[10px] text-gray-500 uppercase font-bold">Assignee</label>
                            <select
                                value={task.assigneeId || ''}
                                onChange={async (e) => {
                                    const val = e.target.value
                                    await assignTask(task.id, val || null)
                                    toast.success('Đã cập nhật phân công')
                                }}
                                className="bg-[#111] border border-gray-700 text-white text-sm rounded px-3 py-1.5 outline-none focus:border-blue-500"
                            >
                                <option value="">-- Chưa giao --</option>
                                {members.map(m => (
                                    <option key={m.id} value={m.id}>{m.nickname || m.username}</option>
                                ))}
                            </select>
                        </div>

                        {/* Status Badge (Read Only for Assignment context mostly) */}
                        <div className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${task.status === 'Hoàn tất' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                            {task.status}
                        </div>
                    </div>
                </div>
            ))}

            {tasks.length === 0 && (
                <div className="text-center py-20 text-gray-500 border border-dashed border-white/10 rounded-2xl">
                    Chưa có task nào được giao cho Đại lý.
                </div>
            )}
        </div>
    )
}
