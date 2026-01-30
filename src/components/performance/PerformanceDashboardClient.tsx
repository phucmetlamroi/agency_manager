'use client'

import { useState } from 'react'
import { calculatePerformance } from '@/actions/performance-actions'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

type Metric = {
    id: string
    user: { username: string; nickname?: string | null }
    revenue: number
    score: number
    internalRevisionCount: number
    classification: string
    onTimeRate: number
}

export default function PerformanceDashboardClient({ initialData, month, year }: { initialData: Metric[], month: number, year: number }) {
    const [data, setData] = useState(initialData)
    const [isLoading, setIsLoading] = useState(false)

    const handleRefresh = async () => {
        setIsLoading(true)
        const res = await calculatePerformance(month, year)
        if (res.success && res.data) {
            setData(res.data)
        }
        setIsLoading(false)
    }

    const getBadgeColor = (cls: string) => {
        if (cls === 'POTENTIAL') return 'bg-purple-500/20 text-purple-400 border-purple-500/50'
        if (cls === 'UNDERPERFORM') return 'bg-red-500/20 text-red-400 border-red-500/50'
        return 'bg-blue-500/20 text-blue-400 border-blue-500/50'
    }

    // Chart Data Preparation
    const chartData = data.map(d => ({
        name: d.user.nickname || d.user.username,
        revenue: d.revenue
    }))

    return (
        <div className="space-y-8">
            {/* ACTIONS */}
            <div className="flex justify-end">
                <button
                    onClick={handleRefresh}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-bold transition-all"
                >
                    <span className={isLoading ? 'animate-spin' : ''}>↻</span>
                    {isLoading ? 'Calculating...' : 'Recalculate Metrics'}
                </button>
            </div>

            {/* TOP STATS & CHART */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Ranking Table */}
                <div className="lg:col-span-2 glass-panel p-6">
                    <h3 className="text-xl font-bold mb-4 text-white">🏆 Bảng Xếp hạng Nhân viên</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-400 uppercase bg-gray-800/50">
                                <tr>
                                    <th className="px-4 py-3">Nhân viên</th>
                                    <th className="px-4 py-3 text-right">Doanh thu</th>
                                    <th className="px-4 py-3 text-center">Đúng hạn</th>
                                    <th className="px-4 py-3 text-center">Lỗi Nội bộ</th>
                                    <th className="px-4 py-3 text-center">Điểm số</th>
                                    <th className="px-4 py-3 text-center">Xếp loại</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {data.map((item) => (
                                    <tr key={item.id} className="hover:bg-white/5">
                                        <td className="px-4 py-4 font-medium text-white">
                                            {item.user.username}
                                            {item.user.nickname && <span className="block text-xs text-gray-500">{item.user.nickname}</span>}
                                        </td>
                                        <td className="px-4 py-4 text-right font-mono text-green-400 font-bold">
                                            {item.revenue.toLocaleString()} đ
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <span className={item.onTimeRate < 90 ? 'text-red-400' : 'text-green-400'}>
                                                {item.onTimeRate.toFixed(0)}%
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <span className={item.internalRevisionCount > 2 ? 'text-red-400 font-bold' : 'text-gray-400'}>
                                                {item.internalRevisionCount}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-center font-bold text-lg">
                                            {item.score.toFixed(0)}
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <span className={`px-2 py-1 rounded text-xs font-bold border ${getBadgeColor(item.classification)}`}>
                                                {item.classification}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Revenue Chart */}
                <div className="glass-panel p-6 flex flex-col">
                    <h3 className="text-lg font-bold mb-4 text-gray-300">📊 Biểu đồ Doanh thu</h3>
                    <div className="flex-1 min-h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                                <XAxis dataKey="name" stroke="#666" fontSize={12} tick={{ fill: '#999' }} />
                                <Tooltip
                                    contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
                                    formatter={(value: number) => [`${value.toLocaleString()} đ`, 'Doanh thu']}
                                />
                                <Bar dataKey="revenue" fill="#60a5fa" radius={[4, 4, 0, 0]}>
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.revenue > 10000000 ? '#a855f7' : '#60a5fa'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    )
}
