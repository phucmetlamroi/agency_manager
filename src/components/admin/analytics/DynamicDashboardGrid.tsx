'use client'

import React, { useState, useEffect } from 'react'
import GridLayout from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import VisitorLineChart from './VisitorLineChart'
import FrictionHeatmap from './FrictionHeatmap'
import EventLogTable from './EventLogTable'

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
        { i: 'traffic_chart', x: 0, y: 0, w: 8, h: 4, minW: 4, minH: 3 },
        { i: 'heatmap', x: 8, y: 0, w: 4, h: 4, minW: 3, minH: 3 },
        { i: 'events_table', x: 0, y: 4, w: 12, h: 5, minW: 6, minH: 4 }
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
            <div key="traffic_chart" className="bg-zinc-900 border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
                <div className="drag-handle bg-zinc-800/50 p-3 px-5 border-b border-white/5 flex items-center justify-between cursor-move">
                    <h3 className="text-sm font-semibold text-white">Traffic & Session Overview</h3>
                </div>
                <div className="flex-1 p-4 min-h-0">
                    <VisitorLineChart />
                </div>
            </div>

            <div key="heatmap" className="bg-zinc-900 border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
                <div className="drag-handle bg-zinc-800/50 p-3 px-5 border-b border-white/5 flex items-center justify-between cursor-move">
                    <h3 className="text-sm font-semibold text-white">Activity Hotspots</h3>
                </div>
                <div className="flex-1 p-4 min-h-0 overflow-y-auto custom-scrollbar">
                    <FrictionHeatmap />
                </div>
            </div>

            <div key="events_table" className="bg-zinc-900 border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
                <div className="drag-handle bg-zinc-800/50 p-3 px-5 border-b border-white/5 flex items-center justify-between cursor-move">
                    <h3 className="text-sm font-semibold text-white">Event Audit Log</h3>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden relative">
                    <EventLogTable />
                </div>
            </div>
        </GridLayout>
    )
}
