'use client'

import { useState } from 'react'

type Project = {
    id: number
    name: string
    code: string | null
}

type Client = {
    id: number
    name: string
    aiScore: number
    subsidiaries?: Client[]
    projects: Project[]
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

    return (
        <div className="border border-white/10 rounded-lg overflow-hidden bg-white/5">
            <div
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    <span className="text-gray-400 text-sm">{isExpanded ? '▼' : '▶'}</span>
                    <div>
                        <div className="font-semibold text-white flex items-center gap-2">
                            {client.name}
                            <a
                                href={`/admin/crm/${client.id}`}
                                onClick={(e) => e.stopPropagation()} // Prevent expand
                                className="text-xs bg-purple-600/30 text-purple-400 px-2 py-0.5 rounded hover:bg-purple-600 hover:text-white transition-colors border border-purple-500/50"
                            >
                                ↗ Xem chi tiết
                            </a>
                        </div>
                        <div className="text-xs text-gray-500">
                            {client.subsidiaries?.length || 0} Brands • {client.projects.length} Projects
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
                    {/* Projects List */}
                    {client.projects.length > 0 && (
                        <div className="mb-4">
                            <div className="text-xs text-purple-400 font-bold uppercase mb-2">Projects</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {client.projects.map(p => (
                                    <div key={p.id} className="bg-white/5 p-2 rounded text-sm flex justify-between items-center hover:bg-white/10">
                                        <span>{p.name}</span>
                                        <span className="text-xs bg-gray-700 px-1 rounded">{p.code || 'N/A'}</span>
                                    </div>
                                ))}
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

                    {client.projects.length === 0 && (!client.subsidiaries || client.subsidiaries.length === 0) && (
                        <div className="text-sm text-gray-600 italic">Trống</div>
                    )}
                </div>
            )}
        </div>
    )
}
