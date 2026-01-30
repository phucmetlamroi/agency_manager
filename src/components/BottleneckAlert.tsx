'use client'

import { useMemo } from 'react'

type Task = {
    id: string
    status: string
    title: string
}

export default function BottleneckAlert({ tasks }: { tasks: Task[] }) {
    // Focus on "Revision" or "Waiting for Feedback"
    // In this system, "Revision" usually means waiting for Admin/Client feedback (or Editor fixing, depending on flow).
    // Let's assume "Revision" = Waiting for Admin to check/approve.

    const revisionTasks = useMemo(() => tasks.filter(t => t.status === 'Revision'), [tasks])
    const count = revisionTasks.length

    if (count < 5) return null

    const isCritical = count >= 10
    const colorClass = isCritical
        ? 'bg-red-500/10 border-red-500 text-red-500'
        : 'bg-yellow-500/10 border-yellow-500 text-yellow-500'

    return (
        <div className={`mb-6 p-4 rounded-xl border ${colorClass} flex items-start gap-3 shadow-lg backdrop-blur-sm`}>
            <div className="text-2xl pt-1">
                {isCritical ? '🛑' : '⚠️'}
            </div>
            <div>
                <h3 className="font-bold text-lg uppercase tracking-wider">
                    {isCritical ? 'Báo động đỏ: Điểm nghẽn quy trình!' : 'Cảnh báo: Ùn tắc cục bộ'}
                </h3>
                <p className="opacity-90 mt-1">
                    Bạn đang có <span className="font-mono font-bold text-xl mx-1">{count}</span> video ở trạng thái
                    <span className="font-bold mx-1">Revision</span> chờ xử lý.
                </p>
                <div className="mt-3 text-sm opacity-75">
                    {isCritical
                        ? "Hành động ngay! Toàn bộ team đang chờ bạn duyệt bài. Deadline sắp bị trễ."
                        : "Hãy dành thời gian duyệt bài sớm để giải phóng backlog."
                    }
                </div>
            </div>
        </div>
    )
}
