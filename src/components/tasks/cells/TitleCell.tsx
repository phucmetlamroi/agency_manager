"use client"

import { TaskWithUser } from "@/types/admin"
import { Badge } from "@/components/ui/badge"

import { calculateRiskLevel, getRiskColor, getRiskLabel } from '@/lib/risk-utils'

interface TitleCellProps {
    task: TaskWithUser
    isAdmin: boolean
    onClick: () => void
}

export function TitleCell({ task, isAdmin, onClick }: TitleCellProps) {
    const isLocked = !isAdmin && task.status === 'Đã nhận task'

    // Timer logic removed
    return (
        <div
            className={`flex flex-col max-w-[400px] cursor-pointer group ${isLocked ? 'opacity-50' : ''}`}
            onClick={onClick}
        >
            {/* Client Info */}
            {task.client && (
                <div className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-blue-400 mb-0.5">
                    <span>🏢 {task.client.parent ? task.client.parent.name : task.client.name}</span>
                    {task.client.parent && (
                        <>
                            <span className="text-gray-600">➤</span>
                            <span className="text-purple-400">{task.client.name}</span>
                        </>
                    )}
                </div>
            )}

            {/* Title & Locked Icon */}
            <div className="flex items-center gap-2">
                {isLocked && <span className="text-lg" title="Start task to unlock">🔒</span>}

                <span className="font-semibold text-sm truncate group-hover:text-blue-400 transition-colors">
                    {task.title}
                </span>
            </div>

            {/* Warning / Platform */}
            <div className="flex items-center gap-2 flex-wrap">
                {/* Deadline Warning */}
                {task.deadline && task.status !== 'Hoàn tất' && (
                    (() => {
                        const start = task.createdAt ? new Date(task.createdAt).getTime() : new Date().getTime()
                        const end = new Date(task.deadline).getTime()
                        const now = new Date().getTime()
                        const percent = (end - start) > 0 ? ((now - start) / (end - start)) * 100 : 100

                        if (percent > 100) return <span className="text-[10px] text-red-500 font-bold">🔥 OVERDUE</span>
                        if (percent >= 90) return <span className="text-[10px] text-orange-500 font-bold">⚠️ RUSH</span>
                        return null
                    })()
                )}
            </div>
        </div>
    )
}
