'use client'

import { TaskWithUser } from '@/types/admin'

// Status colors aligned với design-system (UI/UX standards):
// - emerald (#10b981) cho success/Hoàn tất
// - indigo (#6366f1) cho pending/Đang đợi giao
// - amber (#fbbf24) cho in-progress
// - red (#ef4444) cho Revision/Quá hạn
// - rose (#f43f5e) cho Đã hủy (terminal negative)
// - sky/violet/pink cho các revise sub-states
const statusColors: Record<string, string> = {
    'Đang đợi giao': '#a855f7',
    'Nhận task': '#60a5fa',
    'Đang thực hiện': '#fbbf24',
    'Revision': '#ef4444',
    'Sửa frame': '#f472b6',
    'Gửi lại': '#38bdf8',
    'Tạm ngưng': '#9ca3af',
    'Quá hạn': '#dc2626',
    'Hoàn tất': '#10b981',
    'Đã hủy': '#71717a',
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
                    <div className={new Date() > new Date(task.deadline) && !['Hoàn tất', 'Đã hủy', 'Quá hạn', 'Tạm ngưng'].includes(task.status) ? 'text-red-400 font-bold text-xs' : 'text-xs'}>
                        {new Date(task.deadline).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} {new Date(task.deadline).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-white/5">
                {/* Timer block removed */}
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
