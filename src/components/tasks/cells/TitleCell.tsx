"use client"

import { TaskWithUser } from "@/types/admin"
import { formatClientHierarchy } from "@/lib/client-hierarchy"

interface TitleCellProps {
    task: TaskWithUser
    isAdmin: boolean
    onClick: () => void
}

export function TitleCell({ task, isAdmin, onClick }: TitleCellProps) {
    const isLocked = !isAdmin && task.status === "Nhận task"
    const clientLabel = formatClientHierarchy(task.client)

    return (
        <div
            className={`flex flex-col max-w-[400px] cursor-pointer group ${isLocked ? "opacity-50" : ""}`}
            onClick={onClick}
        >
            {clientLabel && (
                <div className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-blue-400 mb-0.5">
                    <span>🏢 {clientLabel}</span>
                </div>
            )}

            <div className="flex items-center gap-2">
                {isLocked && <span className="text-lg" title="Start task to unlock">🔒</span>}
                <span className="font-semibold text-sm truncate group-hover:text-blue-400 transition-colors">
                    {task.title}
                </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                {task.deadline && task.status !== "Hoàn tất" && (
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

