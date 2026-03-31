'use client'

import { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import NoSSR from '@/components/ui/NoSSR'
import { InvoiceModal } from '@/components/invoice/InvoiceModal'
import { FileText, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ClientInvoicesTable } from '@/components/invoice/ClientInvoicesTable'

type RatingData = {
    id: string
    createdAt: string
    creativeQuality: number
    responsiveness: number
    communication: number
    qualitativeFeedback?: string | null
    task: { id: string; title: string }
    staff: { username: string; nickname?: string | null }
}

type ClientData = {
    id: number
    name: string
    tier: string
    depositBalance: number
    subsidiaries: any[]
    tasks: any[]
    invoices: any[]
}

const COLORS = ['#60a5fa', '#a855f7', '#f472b6', '#34d399', '#fbbf24']

export default function ClientAnalytics({ client, distribution, workspaceId, ratings = [] }: { client: ClientData, distribution: any[], workspaceId: string, ratings?: RatingData[] }) {
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)

    // Tier Badge Logic
    const getTierBadge = (tier: string) => {
        switch (tier) {
            case 'DIAMOND': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500'
            case 'GOLD': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500'
            case 'SILVER': return 'bg-gray-500/20 text-gray-300 border-gray-500'
            case 'WARNING': return 'bg-red-500/20 text-red-500 border-red-500 animate-pulse'
            default: return 'bg-blue-500/20 text-blue-400 border-blue-500'
        }
    }

    return (
        <div className="space-y-6">
            {/* INVOICE MODAL */}
            <InvoiceModal
                isOpen={isInvoiceModalOpen}
                onClose={() => setIsInvoiceModalOpen(false)}
                clientId={client.id}
                clientName={client.name}
                // address? We might need to fetch this or add to Client model if not exists
                depositBalance={Number(client.depositBalance || 0)}
                workspaceId={workspaceId}
            />

            {/* HEADER */}
            <div className="flex justify-between items-start glass-panel p-6">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">{client.name}</h1>
                    <div className="flex gap-2 items-center">
                        <span className={`px-3 py-1 rounded text-xs font-bold border ${getTierBadge(client.tier)}`}>
                            {client.tier} CLIENT
                        </span>
                        <span className="px-3 py-1 rounded text-xs font-bold border border-gray-700 bg-gray-800 text-gray-400">
                            ID: #{client.id}
                        </span>
                        <span className="px-3 py-1 rounded text-xs font-bold border border-green-900 bg-green-950 text-green-400">
                            Credit: ${Number(client.depositBalance || 0).toLocaleString()}
                        </span>
                    </div>
                </div>

                <div className="text-right flex flex-col items-end gap-2">
                    <Button
                        onClick={() => setIsInvoiceModalOpen(true)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                    >
                        <FileText size={16} /> Create Invoice
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {/* DISTRIBUTION CHART */}
                <div className="glass-panel p-6 flex flex-col">
                    <h3 className="text-lg font-bold mb-4 text-gray-300">📊 Workload Distribution</h3>
                    {distribution.length > 0 ? (
                        <div className="flex-1 min-h-[250px]">
                            <NoSSR>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={distribution}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {distribution.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ background: '#1a1a1a', border: 'none', borderRadius: '8px' }}
                                            itemStyle={{ color: 'white' }}
                                        />
                                        <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                    </PieChart>
                                </ResponsiveContainer>
                            </NoSSR>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-500 italic">
                            Chưa có dữ liệu task con.
                        </div>
                    )}
                </div>
            </div>

            {/* INVOICE HISTORY */}
            <div className="glass-panel p-6">
                <h3 className="text-lg font-bold mb-4 text-white flex items-center gap-2">
                    <span>🧾</span> Invoice History
                </h3>
                <ClientInvoicesTable invoices={client.invoices || []} clientId={client.id} workspaceId={workspaceId} />
            </div>

            {/* CLIENT RATINGS */}
            {ratings.length > 0 && (
                <div className="glass-panel p-6">
                    <h3 className="text-lg font-bold mb-4 text-white flex items-center gap-2">
                        <Star size={18} className="text-amber-400" /> Đánh giá từ Khách hàng
                    </h3>
                    <div className="space-y-4">
                        {ratings.map(r => {
                            const avg = ((r.creativeQuality + r.responsiveness + r.communication) / 3).toFixed(1)
                            return (
                                <div key={r.id} className="bg-white/5 rounded-xl p-4 flex flex-col sm:flex-row gap-4">
                                    <div className="flex-1">
                                        <p className="text-white font-medium text-sm mb-1">{r.task.title}</p>
                                        <p className="text-gray-400 text-xs">Editor: {r.staff.nickname || r.staff.username}</p>
                                        {r.qualitativeFeedback && (
                                            <p className="text-gray-300 text-sm mt-2 italic">&ldquo;{r.qualitativeFeedback}&rdquo;</p>
                                        )}
                                        <p className="text-gray-600 text-xs mt-2">{new Date(r.createdAt).toLocaleDateString('vi-VN')}</p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <div className="text-3xl font-bold text-amber-400">{avg}</div>
                                        <div className="flex gap-0.5 justify-end mt-1">
                                            {[1, 2, 3, 4, 5].map(s => (
                                                <Star key={s} size={12} className={s <= Math.round(parseFloat(avg)) ? 'fill-amber-400 text-amber-400' : 'text-gray-700'} />
                                            ))}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-2 space-y-0.5">
                                            <div>Sáng tạo: {r.creativeQuality}/5</div>
                                            <div>Phản hồi: {r.responsiveness}/5</div>
                                            <div>Giao tiếp: {r.communication}/5</div>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* RECENT TASKS LIST */}
            <div className="glass-panel p-6">
                <h3 className="text-lg font-bold mb-4 text-white">🎬 Video / Task Gần đây</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-xs text-gray-400 border-b border-gray-700">
                                <th className="py-2">Tên Task</th>
                                <th className="py-2">Trạng thái</th>
                                <th className="py-2">Brand / Dự án</th>
                                <th className="py-2">Ngày giao</th>
                                <th className="py-2 text-right">Giá trị</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm text-gray-300">
                            {(() => {
                                const allTasks = [
                                    ...client.tasks.map(t => ({ ...t, brand: 'Trực tiếp' })),
                                    ...(client.subsidiaries?.flatMap(sub => sub.tasks.map((t: any) => ({ ...t, brand: sub.name }))) || [])
                                ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10)

                                if (allTasks.length === 0) return (
                                    <tr>
                                        <td colSpan={5} className="py-4 text-center text-gray-500 italic">Chưa có dữ liệu.</td>
                                    </tr>
                                )

                                return allTasks.map((task: any) => (
                                    <tr key={task.id} className="border-b border-gray-800 hover:bg-white/5">
                                        <td className="py-3 font-medium text-white">{task.title}</td>
                                        <td className="py-3">
                                            <span className={`text-xs px-2 py-1 rounded border ${task.status === 'Hoàn tất' ? 'border-green-500 text-green-400 bg-green-500/10' : 'border-gray-600'}`}>
                                                {task.status}
                                            </span>
                                        </td>
                                        <td className="py-3 text-gray-400">{task.brand}</td>
                                        <td className="py-3 text-gray-500">{new Date(task.createdAt).toLocaleDateString('vi-VN')}</td>
                                        <td className="py-3 text-right font-mono text-green-500">{(task.value || 0).toLocaleString()} ₫</td>
                                    </tr>
                                ))
                            })()}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

