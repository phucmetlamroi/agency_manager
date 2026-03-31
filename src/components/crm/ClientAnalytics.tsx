'use client'

import { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import NoSSR from '@/components/ui/NoSSR'
import { InvoiceModal } from '@/components/invoice/InvoiceModal'
import { FileText, Star, TrendingUp, CheckCircle, Video, CreditCard, Activity, FolderOpen } from 'lucide-react'
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

const COLORS = ['#818cf8', '#c084fc', '#f472b6', '#34d399', '#fbbf24', '#38bdf8']

const GlassCard = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
    <div className={`relative overflow-hidden bg-zinc-900/40 backdrop-blur-xl border border-white/10 rounded-2xl group ${className}`}>
        {/* Ambient Hover Glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
        <div className="relative z-10 h-full">{children}</div>
    </div>
)

export default function ClientAnalytics({ client, distribution, workspaceId, ratings = [] }: { client: ClientData, distribution: any[], workspaceId: string, ratings?: RatingData[] }) {
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)

    // Tier Badge Logic
    const getTierBadge = (tier: string) => {
        switch (tier) {
            case 'DIAMOND': return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.5)]'
            case 'GOLD': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.5)]'
            case 'SILVER': return 'bg-gray-400/10 text-gray-300 border-gray-400/50'
            case 'WARNING': return 'bg-red-500/20 text-red-500 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)] animate-pulse'
            default: return 'bg-blue-500/10 text-blue-400 border-blue-500/50'
        }
    }

    const allTasks = [
        ...client.tasks.map(t => ({ ...t, brand: 'Trực tiếp' })),
        ...(client.subsidiaries?.flatMap(sub => sub.tasks.map((t: any) => ({ ...t, brand: sub.name }))) || [])
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const totalTasksCount = allTasks.length
    const avgOverallRating = ratings.length > 0 
        ? ratings.reduce((acc, r) => acc + (r.creativeQuality + r.responsiveness + r.communication) / 3, 0) / ratings.length
        : 0

    return (
        <div className="space-y-6 pb-20">
            {/* INVOICE MODAL */}
            <InvoiceModal
                isOpen={isInvoiceModalOpen}
                onClose={() => setIsInvoiceModalOpen(false)}
                clientId={client.id}
                clientName={client.name}
                depositBalance={Number(client.depositBalance || 0)}
                workspaceId={workspaceId}
            />

            {/* BENTO HERO BANNER */}
            <div className="relative overflow-hidden rounded-[2rem] bg-zinc-950/60 backdrop-blur-3xl border border-white/10 p-8 group">
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent pointer-events-none" />
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-3">
                            <h1 className="text-4xl font-extrabold text-white tracking-tight">{client.name}</h1>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getTierBadge(client.tier)}`}>
                                {client.tier}
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                            <span className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/5 bg-white/5 text-gray-400 flex items-center gap-1.5">
                                <FolderOpen size={14} /> ID: #{client.id}
                            </span>
                            <span className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 flex items-center gap-1.5">
                                <Activity size={14} /> Credit: ${(Number(client.depositBalance) || 0).toLocaleString()}
                            </span>
                        </div>
                    </div>

                    <div className="text-right flex flex-col items-end gap-2">
                        <Button
                            onClick={() => setIsInvoiceModalOpen(true)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-900/20 gap-2 h-11 px-6 transition-all"
                        >
                            <FileText size={18} /> Tạo Hóa đơn (Invoice)
                        </Button>
                    </div>
                </div>
            </div>

            {/* BENTO ROW 1: KPIs & DISTRIBUTION */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Left Col: KPI Cards & Ratings */}
                <div className="lg:col-span-8 flex flex-col gap-6">
                    {/* KPI Quick Stats */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <GlassCard className="p-6 flex flex-col justify-center items-center text-center">
                            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mb-3">
                                <CheckCircle className="text-blue-400" size={24} />
                            </div>
                            <p className="text-sm font-medium text-gray-400 mb-1">Tổng Số Task</p>
                            <p className="text-3xl font-bold text-white tracking-tight">{totalTasksCount}</p>
                        </GlassCard>
                        
                        <GlassCard className="p-6 flex flex-col justify-center items-center text-center">
                            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-3">
                                <Star className="text-amber-400" size={24} />
                            </div>
                            <p className="text-sm font-medium text-gray-400 mb-1">Điểm Trung Bình</p>
                            <p className="text-3xl font-bold text-amber-400 tracking-tight">
                                {avgOverallRating > 0 ? avgOverallRating.toFixed(1) : 'N/A'}
                            </p>
                        </GlassCard>

                        <GlassCard className="p-6 flex flex-col justify-center items-center text-center">
                            <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center mb-3">
                                <TrendingUp className="text-indigo-400" size={24} />
                            </div>
                            <p className="text-sm font-medium text-gray-400 mb-1">Dự án con</p>
                            <p className="text-3xl font-bold text-white tracking-tight">{client.subsidiaries?.length || 0}</p>
                        </GlassCard>
                    </div>

                    {/* Ratings Section */}
                    {ratings.length > 0 && (
                        <GlassCard className="p-6 flex-1 flex flex-col">
                            <h3 className="text-lg font-bold mb-5 text-white flex items-center gap-2">
                                <Star size={20} className="text-amber-400 fill-amber-400" /> Nhận xét Khách hàng
                            </h3>
                            <div className="space-y-3 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
                                {ratings.map(r => {
                                    const avg = ((r.creativeQuality + r.responsiveness + r.communication) / 3).toFixed(1)
                                    return (
                                        <div key={r.id} className="bg-white/5 hover:bg-white/10 transition-colors rounded-xl p-4 flex flex-col sm:flex-row gap-4 border border-white/5">
                                            <div className="flex-1">
                                                <p className="text-white font-medium text-sm mb-1 line-clamp-1">{r.task.title}</p>
                                                <p className="text-gray-400 text-xs mb-2">Editor: <span className="text-indigo-300">{r.staff.nickname || r.staff.username}</span></p>
                                                {r.qualitativeFeedback && (
                                                    <div className="bg-black/20 p-3 rounded-lg border-l-2 border-indigo-500/50">
                                                        <p className="text-gray-300 text-sm italic">&ldquo;{r.qualitativeFeedback}&rdquo;</p>
                                                    </div>
                                                )}
                                                <p className="text-gray-600 text-[11px] mt-2 font-mono uppercase">{new Date(r.createdAt).toLocaleDateString('vi-VN')}</p>
                                            </div>
                                            <div className="shrink-0 flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-4 sm:gap-1">
                                                <div className="text-3xl font-black text-amber-400 font-mono">{avg}</div>
                                                <div className="text-[10px] text-gray-400 bg-black/40 px-2 py-1 rounded-md text-right whitespace-nowrap">
                                                    ST: {r.creativeQuality} | PH: {r.responsiveness} | GT: {r.communication}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </GlassCard>
                    )}
                </div>

                {/* Right Col: Distribution Chart */}
                <GlassCard className="lg:col-span-4 p-6 flex flex-col min-h-[400px]">
                    <h3 className="text-lg font-bold mb-2 text-white flex items-center gap-2">
                        <Activity size={20} className="text-indigo-400" /> Phân bổ Công việc
                    </h3>
                    <p className="text-xs text-gray-400 mb-6">Tỷ trọng tasks theo dự án con</p>
                    
                    {distribution.length > 0 ? (
                        <div className="flex-1 w-full mx-auto relative min-h-[250px]">
                            <NoSSR>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={distribution}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={70}
                                            outerRadius={100}
                                            paddingAngle={3}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {distribution.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ background: 'rgba(24, 24, 27, 0.9)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)' }}
                                            itemStyle={{ color: 'white', fontWeight: 600 }}
                                        />
                                        <Legend 
                                            verticalAlign="bottom" 
                                            height={36} 
                                            iconType="circle"
                                            wrapperStyle={{ fontSize: '12px', color: '#9ca3af', paddingTop: '20px' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </NoSSR>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 italic bg-black/20 rounded-xl border border-dashed border-white/10">
                            <Activity className="mb-2 opacity-50" size={32} />
                            Chưa có dữ liệu task con.
                        </div>
                    )}
                </GlassCard>
            </div>

            {/* BENTO ROW 2: TABLES */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Recent Tasks */}
                <GlassCard className="p-6 flex flex-col">
                    <h3 className="text-xl font-bold mb-6 text-white flex items-center gap-2">
                        <Video size={22} className="text-blue-400" /> Video & Task Gần đây
                    </h3>
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-white/10">
                                    <th className="pb-3 pl-2">Tên Task</th>
                                    <th className="pb-3">Trạng thái</th>
                                    <th className="pb-3 text-right pr-2">Giá trị</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm">
                                {allTasks.slice(0, 8).length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="py-8 text-center text-gray-500 italic border-b border-white/5">Chưa có task nào.</td>
                                    </tr>
                                ) : (
                                    allTasks.slice(0, 8).map((task: any) => (
                                        <tr key={task.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors group/row">
                                            <td className="py-3 pl-2 max-w-[150px]">
                                                <div className="font-medium text-gray-200 truncate">{task.title}</div>
                                                <div className="text-[11px] text-gray-500 mt-0.5 truncate">{task.brand}</div>
                                            </td>
                                            <td className="py-3">
                                                <span className={`inline-flex items-center text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md border ${
                                                    task.status === 'Hoàn tất' 
                                                        ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' 
                                                        : 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10'
                                                }`}>
                                                    {task.status}
                                                </span>
                                            </td>
                                            <td className="py-3 text-right pr-2">
                                                <div className="font-mono text-gray-300">{(task.value || 0).toLocaleString()} ₫</div>
                                                <div className="text-[10px] text-gray-600 mt-0.5">{new Date(task.createdAt).toLocaleDateString('vi-VN')}</div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </GlassCard>

                {/* Invoices */}
                <GlassCard className="p-6 flex flex-col">
                    <h3 className="text-xl font-bold mb-6 text-white flex items-center gap-2">
                        <CreditCard size={22} className="text-emerald-400" /> Lịch sử Hóa đơn
                    </h3>
                    <div className="flex-1">
                        <ClientInvoicesTable invoices={client.invoices || []} clientId={client.id} workspaceId={workspaceId} />
                    </div>
                </GlassCard>

            </div>
        </div>
    )
}


