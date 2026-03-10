'use client'

import React, { useState, useEffect } from 'react'
import GridLayout from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import VisitorLineChart from './VisitorLineChart'
import LivePresenceBoard from './LivePresenceBoard'

// A wrapper to make the grid responsive without the WidthProvider HOC 
// which can sometimes cause Hydration mismatch if not careful.
function useWindowWidth() {
    const [width, setWidth] = useState(1200)
    useEffect(() => {
        const handleResize = () => setWidth(window.innerWidth - 300) // Rough accounting for sidebar
        handleResize()
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])
    return width
}

export default function DynamicDashboardGrid({ initialData }: { initialData?: any }) {
    const width = useWindowWidth()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    const layout = [
        { i: 'presence_board', x: 0, y: 0, w: 4, h: 9, minW: 3, minH: 5 },
        { i: 'traffic_chart', x: 4, y: 0, w: 8, h: 5, minW: 4, minH: 3 },
    ]

    // Prevents SSR mismatch for the draggable grid
    if (!mounted) return <div className="p-12 text-center text-zinc-500 animate-pulse">Loading Workspace Analytics...</div>

    return (
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
    )
}
