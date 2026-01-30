'use client'

import { useState } from 'react'
import Link from 'next/link'

type Project = {
    id: number
    name: string
    code: string | null
}

type Task = {
    id: string
    title: string
    status: string
    value?: number
}

type Client = {
    id: number
    name: string
    aiScore: number
    subsidiaries?: Client[]
    projects: Project[]
    tasks: Task[]
}

export default function ClientList({ clients }: { clients: Client[] }) {
    return (
        <div className="space-y-4">
            {clients.length === 0 && (
                <div className="text-center py-8 text-gray-500">Chưa có dữ liệu khách hàng.</div>
            )}

            {clients.map(client => renderClient(client, 0))}
        </div>
    )
}

function renderClient(client: Client, level: number) {
    return (
        <ClientItem key={client.id} client={client} />
    )
}

function ClientItem({ client }: { client: Client }) {
    const [isExpanded, setIsExpanded] = useState(false)

    // Determine Score Color
    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-green-400'
        if (score >= 50) return 'text-yellow-400'
        return 'text-red-400'
    }

    // Calculate total videos (direct + sub-brands) for display if needed? 
    // For now, let's show direct tasks count or maybe all?
    // User requested "show ra ngoài luôn".
    const taskCount = client.tasks?.length || 0

    return (
        <div className="border border-white/10 rounded-lg overflow-hidden bg-white/5">
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <span className="text-gray-400 text-sm">{isExpanded ? '▼' : '▶'}</span>
                    <div>
                        <div className="font-semibold text-white flex items-center gap-2">
                            {client.name}
                            <Link
                                href={`/admin/crm/${client.id}`}
                                onClick={(e) => e.stopPropagation()} // Prevent expand
                                className="text-xs bg-purple-600/30 text-purple-400 px-2 py-0.5 rounded hover:bg-purple-600 hover:text-white transition-colors border border-purple-500/50"
                            >
                                ↗ Xem chi tiết
                            </Link>
                        </div>
                        <div className="text-xs text-gray-500">
                            {client.subsidiaries?.length || 0} Brands • {taskCount} Videos
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <div className="text-xs text-gray-500 uppercase">AI Score</div>
                        <div className={`font-mono font-bold ${getScoreColor(client.aiScore)}`}>
                            {client.aiScore.toFixed(1)}
                        </div>
                    </div>
                </div>
            </div>

            {isExpanded && (
                <div className="bg-black/20 p-4 pl-12 border-t border-white/10 space-y-3">
                    {/* Tasks/Videos List */}
                    {client.tasks && client.tasks.length > 0 && (
                        <div className="mb-4">
                            <div className="text-xs text-purple-400 font-bold uppercase mb-2">Recent Videos</div>
                            <div className="space-y-1">
                                {client.tasks.slice(0, 5).map(t => (
                                    <div key={t.id} className="bg-white/5 p-2 rounded text-sm flex justify-between items-center hover:bg-white/10">
                                        <span className="truncate max-w-[200px]">{t.title}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${t.status === 'Hoàn tất'
                                            ? 'border-green-500 text-green-400 bg-green-900/20'
                                            : 'border-yellow-500 text-yellow-500 bg-yellow-900/20'
                                            }`}>
                                            {t.status}
                                        </span>
                                    </div>
                                ))}
                                {client.tasks.length > 5 && (
                                    <div className="text-xs text-center text-gray-500 pt-1">
                                        ...còn {client.tasks.length - 5} video nữa
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Subsidiaries (Recursive) */}
                    {client.subsidiaries && client.subsidiaries.length > 0 && (
                        <div>
                            <div className="text-xs text-blue-400 font-bold uppercase mb-2">Brands / Subsidiaries</div>
                            <div className="space-y-2">
                                {client.subsidiaries.map(sub => (
                                    <ClientItem key={sub.id} client={sub} />
                                ))}
                            </div>
                        </div>
                    )}

                    {(!client.tasks || client.tasks.length === 0) && (!client.subsidiaries || client.subsidiaries.length === 0) && (
                        <div className="text-sm text-gray-600 italic">Trống</div>
                    )}
                </div>
            )}
        </div>
    )
}
