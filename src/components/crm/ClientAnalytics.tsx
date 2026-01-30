'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

type ClientData = {
    id: number
    name: string
    tier: string
    aiScore: number
    frictionIndex: number
    inputQuality: number
    paymentRating: number
    subsidiaries: any[]
    tasks: any[]
}

const COLORS = ['#60a5fa', '#a855f7', '#f472b6', '#34d399', '#fbbf24']

export default function ClientAnalytics({ client, distribution }: { client: ClientData, distribution: any[] }) {

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
            {/* HEADER */}
            <div className="flex justify-between items-start glass-panel p-6">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">{client.name}</h1>
                    <div className="flex gap-2">
                        <span className={`px-3 py-1 rounded text-xs font-bold border ${getTierBadge(client.tier)}`}>
                            {client.tier} CLIENT
                        </span>
                        <span className="px-3 py-1 rounded text-xs font-bold border border-gray-700 bg-gray-800 text-gray-400">
                            ID: #{client.id}
                        </span>
                    </div>
                </div>

                <div className="text-right">
                    <div className="text-sm text-gray-400 uppercase tracking-wider">AI Score</div>
                    <div className="text-4xl font-mono font-bold text-white text-transparent bg-clip-text bg-gradient-to-br from-white to-gray-500">
                        {client.aiScore.toFixed(0)}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* AI INSIGHTS CARD */}
                <div className="glass-panel p-6 lg:col-span-2">
                    <h3 className="text-lg font-bold mb-4 text-purple-300 flex items-center gap-2">
                        <span>🤖</span> AI Analysis & Suggestions
                    </h3>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-white/5 p-4 rounded-lg">
                            <div className="text-xs text-gray-400">Operational Friction</div>
                            <div className={`text-xl font-bold ${client.frictionIndex > 0.3 ? 'text-red-400' : 'text-green-400'}`}>
                                {(client.frictionIndex * 100).toFixed(0)}% <span className="text-xs font-normal text-gray-500">(Revision Rate)</span>
                            </div>
                        </div>
                        <div className="bg-white/5 p-4 rounded-lg">
                            <div className="text-xs text-gray-400">Ratings (Manual)</div>
                            <div className="flex gap-4 mt-1">
                                <span className={client.inputQuality >= 4 ? 'text-green-400' : 'text-yellow-400'}>
                                    Quality: {client.inputQuality}/5
                                </span>
                                <span className={client.paymentRating >= 4 ? 'text-green-400' : 'text-red-400'}>
                                    Payment: {client.paymentRating}/5
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-gray-700 pt-4">
                        <h4 className="font-bold text-white text-sm mb-2">Suggestion Engine:</h4>
                        <ul className="space-y-2 text-sm text-gray-300">
                            {client.tier === 'DIAMOND' && (
                                <li className="flex items-center gap-2 text-green-300">
                                    ★ Gửi quà tri ân / Đề xuất gói Annual Plan ưu đãi.
                                </li>
                            )}
                            {client.tier === 'WARNING' && (
                                <li className="flex items-center gap-2 text-red-300">
                                    ⚠️ Cảnh báo: Khách hàng High-Maintenance / Rủi ro thanh toán. Cân nhắc tăng giá hoặc yêu cầu cọc.
                                </li>
                            )}
                            {client.inputQuality < 3 && (
                                <li className="flex items-center gap-2 text-yellow-300">
                                    ⚡ Source kém: Đề xuất khách upgrade thiết bị hoặc tính thêm phí xử lý source.
                                </li>
                            )}
                            {client.tier === 'standard' && <li className="italic text-gray-500">Chưa có đề xuất đặc biệt.</li>}
                        </ul>
                    </div>
                </div>

                {/* DISTRIBUTION CHART */}
                <div className="glass-panel p-6 flex flex-col">
                    <h3 className="text-lg font-bold mb-4 text-gray-300">📊 Workload Distribution</h3>
                    {distribution.length > 0 ? (
                        <div className="flex-1 min-h-[250px]">
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
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-500 italic">
                            Chưa có dữ liệu task con.
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
