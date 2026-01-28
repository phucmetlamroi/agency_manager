'use client'

import { TaskWithUser } from '@/types/admin'
import Stopwatch from '../Stopwatch'

const statusColors: Record<string, string> = {
    "Đã nhận task": "#60a5fa",
    "Đang đợi giao": "#a855f7",
    "Đang thực hiện": "#fbbf24",
    "Revision": "#ef4444",
    "Hoàn tất": "#10b981",
    "Tạm ngưng": "#9ca3af",
    "Sửa frame": "#f472b6",
}

export default function MobileTaskCard({ task, onAction, isAdmin }: {
    task: TaskWithUser,
    onAction: (task: TaskWithUser) => void,
    isAdmin: boolean
}) {
    return (
        <div
            onClick={() => onAction(task)}
            className="bg-gray-900/50 active:bg-gray-800 backdrop-blur-md rounded-xl p-4 border border-white/5 active:scale-[0.98] transition-all"
        >
            <div className="flex justify-between items-start mb-3">
                <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">
                        {task.type || 'TASK'}
                    </span>
                    <h3 className="text-white font-bold text-lg leading-tight line-clamp-2">
                        {task.title}
                    </h3>
                </div>
                <div
                    className="w-2 h-full py-2 flex items-center justify-center text-gray-500"
                >
                    •••
                </div>
            </div>

            <div className="flex items-center justify-between text-sm text-gray-400 mb-3">
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full`} style={{ background: statusColors[task.status] || '#ccc' }}></span>
                    <span className={task.status === 'Revision' ? 'text-red-400 font-bold' : ''}>{task.status}</span>
                </div>

                {task.deadline && (
                    <div className={new Date() > new Date(task.deadline) && task.status !== 'Hoàn tất' ? 'text-red-400 font-bold' : ''}>
                        {new Date(task.deadline).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-white/5">
                <div className="flex items-center gap-2">
                    <Stopwatch
                        accumulatedSeconds={task.accumulatedSeconds || 0}
                        timerStartedAt={task.timerStartedAt ?? null}
                        status={task.timerStatus || 'PAUSED'}
                    />
                </div>

                {isAdmin && (
                    <span className="font-mono font-bold text-green-400">
                        {task.value.toLocaleString()} đ
                    </span>
                )}
                {!isAdmin && task.assignee && (
                    <span className="text-xs text-gray-500">
                        @{task.assignee.username}
                    </span>
                )}
            </div>
        </div>
    )
}
