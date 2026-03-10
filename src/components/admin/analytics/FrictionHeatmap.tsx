'use client'

import React from 'react'
import clsx from 'clsx'

// Mock data representing hours of the day (rows: 0-23) and days of week (cols: Mon-Sun)
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const hours = Array.from({ length: 24 }, (_, i) => i)

// Generate random heatmap weights (0 to 100)
// High friction moments are often between 14:00 and 17:00
const heatmapData = days.map(() => 
    hours.map((hour) => {
        let baseWeight = Math.random() * 30
        if (hour >= 14 && hour <= 17) baseWeight += Math.random() * 60
        return Math.floor(baseWeight)
    })
)

function getHeatColor(weight: number) {
    if (weight === 0) return 'bg-zinc-800/50'
    if (weight < 25) return 'bg-orange-500/20 hover:bg-orange-500/40' // Low
    if (weight < 50) return 'bg-orange-500/50 hover:bg-orange-500/70' // Medium
    if (weight < 75) return 'bg-orange-600 hover:bg-orange-500'       // High
    return 'bg-red-600 hover:bg-red-500 shadow-[0_0_10px_rgba(220,38,38,0.8)]' // Critical Friction
}

export default function FrictionHeatmap() {
    return (
        <div className="w-full h-full flex flex-col min-w-[500px]">
            <div className="flex text-xs text-zinc-500 mb-2 ml-8">
                {days.map(day => (
                    <div key={day} className="flex-1 text-center font-medium">{day}</div>
                ))}
            </div>
            
            <div className="flex-1 flex flex-col gap-1">
                {hours.map((hour) => (
                    <div key={hour} className="flex-1 flex gap-1 items-center min-h-[12px]">
                        <div className="w-8 text-[10px] text-zinc-600 text-right pr-2">
                            {hour.toString().padStart(2, '0')}h
                        </div>
                        {days.map((day, dIdx) => {
                            const weight = heatmapData[dIdx][hour]
                            return (
                                <div 
                                    key={`${day}-${hour}`}
                                    title={`${day} ${hour}:00 - Friction Score: ${weight}`}
                                    className={clsx(
                                        "flex-1 rounded-sm transition-all duration-300 cursor-crosshair",
                                        getHeatColor(weight)
                                    )}
                                />
                            )
                        })}
                    </div>
                ))}
            </div>
            
            <div className="mt-4 flex items-center justify-end gap-2 text-xs text-zinc-500">
                <span>Low</span>
                <div className="w-3 h-3 rounded bg-orange-500/20" />
                <div className="w-3 h-3 rounded bg-orange-500/50" />
                <div className="w-3 h-3 rounded bg-orange-600" />
                <div className="w-3 h-3 rounded bg-red-600" />
                <span>High Friction</span>
            </div>
        </div>
    )
}
