'use client'

import React, { useState, useEffect } from 'react'
import clsx from 'clsx'
import { getFrictionData } from '@/actions/tracking-actions'
import { RefreshCw } from 'lucide-react'

// UI days (Monday to Sunday)
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const hours = Array.from({ length: 24 }, (_, i) => i)

function getHeatColor(weight: number) {
    if (weight === 0) return 'bg-zinc-800/50'
    if (weight < 5) return 'bg-orange-500/20 hover:bg-orange-500/40' 
    if (weight < 20) return 'bg-orange-500/50 hover:bg-orange-500/70' 
    if (weight < 50) return 'bg-orange-600 hover:bg-orange-500'      
    return 'bg-red-600 hover:bg-red-500 shadow-[0_0_10px_rgba(220,38,38,0.8)]' 
}

export default function FrictionHeatmap() {
    const [matrix, setMatrix] = useState<number[][]>([])
    const [loading, setLoading] = useState(true)

    const fetchData = async () => {
        setLoading(true)
        const data = await getFrictionData()
        if (data && data.length === 7) {
            // JS getDay() 0=Sun, 1=Mon... UI wants 1, 2, 3, 4, 5, 6, 0 (Mon-Sun)
            const rearranged = [data[1], data[2], data[3], data[4], data[5], data[6], data[0]]
            setMatrix(rearranged)
        }
        setLoading(false)
    }

    useEffect(() => {
        fetchData()
    }, [])

    return (
        <div className="w-full h-full flex flex-col min-w-[500px]">
            <div className="flex justify-end mb-2">
                <button 
                    onClick={fetchData}
                    disabled={loading}
                    className="p-1 px-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
                >
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    Sync Heatmap
                </button>
            </div>

            <div className="flex text-[10px] text-zinc-500 mb-2 ml-8 uppercase font-bold tracking-widest">
                {days.map(day => (
                    <div key={day} className="flex-1 text-center font-medium">{day}</div>
                ))}
            </div>
            
            <div className="flex-1 flex flex-col gap-1">
                {hours.map((hour) => (
                    <div key={hour} className="flex-1 flex gap-1 items-center min-h-[12px]">
                        <div className="w-8 text-[10px] text-zinc-600 text-right pr-2 font-mono">
                            {hour.toString().padStart(2, '0')}h
                        </div>
                        {matrix.length > 0 ? days.map((day, dIdx) => {
                            const weight = matrix[dIdx][hour]
                            return (
                                <div 
                                    key={`${day}-${hour}`}
                                    title={`${day} ${hour}:00 - Intensity: ${weight}`}
                                    className={clsx(
                                        "flex-1 rounded-sm transition-all duration-300 cursor-crosshair h-full",
                                        getHeatColor(weight)
                                    )}
                                />
                            )
                        }) : Array(7).fill(0).map((_, i) => (
                            <div key={i} className="flex-1 rounded-sm bg-zinc-800/20 h-full animate-pulse" />
                        ))}
                    </div>
                ))}
            </div>
            
            <div className="mt-4 flex items-center justify-end gap-2 text-[10px] text-zinc-500 font-bold uppercase">
                <span>Low Activity</span>
                <div className="w-3 h-3 rounded bg-orange-500/20" />
                <div className="w-3 h-3 rounded bg-orange-500/50" />
                <div className="w-3 h-3 rounded bg-orange-600" />
                <div className="w-3 h-3 rounded bg-red-600" />
                <span>Critical Friction</span>
            </div>
        </div>
    )
}
