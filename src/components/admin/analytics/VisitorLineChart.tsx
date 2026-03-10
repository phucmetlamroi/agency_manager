'use client'

import React, { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'
import { getSessionTrends } from '@/actions/tracking-actions'
import { RefreshCw } from 'lucide-react'

export default function VisitorLineChart() {
    const [data, setData] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    const fetchData = async () => {
        setLoading(true)
        const trends = await getSessionTrends()
        setData(trends)
        setLoading(false)
    }

    useEffect(() => {
        fetchData()
    }, [])

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex justify-end mb-2">
                <button 
                    onClick={fetchData}
                    disabled={loading}
                    className="p-1 px-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
                >
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    Refresh Data
                </button>
            </div>
            
            <div className="flex-1 min-h-0">
                {data.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={data}
                            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                            <XAxis 
                                dataKey="time" 
                                stroke="#52525b" 
                                fontSize={10} 
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis 
                                stroke="#52525b" 
                                fontSize={10} 
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip 
                                contentStyle={{ 
                                    backgroundColor: '#18181b', 
                                    border: '1px solid #3f3f46', 
                                    borderRadius: '8px',
                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                                }}
                                itemStyle={{ color: '#e4e4e7' }}
                            />
                            <Line 
                                type="monotone" 
                                dataKey="sessions" 
                                stroke="#8b5cf6" 
                                strokeWidth={3}
                                dot={{ r: 3, fill: '#8b5cf6', strokeWidth: 0 }}
                                activeDot={{ r: 5, fill: '#6366f1', strokeWidth: 0 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex items-center justify-center text-zinc-600 text-xs italic">
                        {loading ? 'Fetching trends...' : 'No session data available for this period.'}
                    </div>
                )}
            </div>
        </div>
    )
}
