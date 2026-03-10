'use client'

import React, { useState, useEffect } from 'react'
import GridLayout from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import VisitorLineChart from './VisitorLineChart'
import LivePresenceBoard from './LivePresenceBoard'

export default function DynamicDashboardGrid({ initialData }: { initialData?: any }) {
    const [width, setWidth] = useState(1200)
    const [mounted, setMounted] = useState(false)
    const containerRef = React.useRef<HTMLDivElement>(null)

    useEffect(() => {
        setMounted(true)
        if (!containerRef.current) return

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentRect.width > 0) {
                    setWidth(entry.contentRect.width)
                }
            }
        })

        observer.observe(containerRef.current)
        return () => observer.disconnect()
    }, [])

    const layout = [
        { i: 'presence_board', x: 0, y: 0, w: 12, h: 6, minW: 6 },
        { i: 'traffic_chart', x: 0, y: 6, w: 12, h: 5, minW: 6 },
    ]

    if (!mounted) return <div className="p-12 text-center text-zinc-500 animate-pulse">Loading Workspace Analytics...</div>

    return (
        <div ref={containerRef} className="w-full min-h-[1000px] overflow-hidden">
            <GridLayout
                className="layout"
                layout={layout}
                {...({ cols: 12 } as any)}
                rowHeight={100}
                width={width}
                draggableHandle=".drag-handle"
                margin={[16, 16]}
            >
                <div key="presence_board" className="bg-zinc-900 border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
                    <div className="drag-handle bg-zinc-800/50 p-3 px-5 border-b border-white/5 flex items-center justify-between cursor-move">
                        <h3 className="text-sm font-semibold text-white">Who's Online Now?</h3>
                    </div>
                    <div className="flex-1 min-h-0">
                        <LivePresenceBoard />
                    </div>
                </div>

                <div key="traffic_chart" className="bg-zinc-900 border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
                    <div className="drag-handle bg-zinc-800/50 p-3 px-5 border-b border-white/5 flex items-center justify-between cursor-move">
                        <h3 className="text-sm font-semibold text-white">Daily Traffic Overview</h3>
                    </div>
                    <div className="flex-1 p-4 min-h-0">
                        <VisitorLineChart />
                    </div>
                </div>
            </GridLayout>
        </div>
    )
}
