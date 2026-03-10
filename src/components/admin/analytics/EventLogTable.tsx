'use client'

import React, { useState, useEffect } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { getRecentEventLogs, forceFlush } from '@/actions/tracking-actions'
import { RefreshCw, Database } from 'lucide-react'

type EventLog = {
    id: string
    time: string
    user: string
    event: string
    feature: string
}

const columnHelper = createColumnHelper<EventLog>()

const columns = [
  columnHelper.accessor('time', {
    header: 'Timestamp',
    cell: info => <span className="text-zinc-400 font-mono text-[10px]">{info.getValue()}</span>,
  }),
  columnHelper.accessor('user', {
    header: 'Actor',
    cell: info => <span className="text-white font-semibold text-xs">{info.getValue()}</span>,
  }),
  columnHelper.accessor('event', {
    header: 'Type',
    cell: info => {
        const val = info.getValue()
        let color = 'bg-zinc-800 text-zinc-400'
        if (val === 'REVISION') color = 'bg-red-500/20 text-red-400 border border-red-500/10'
        if (val === 'BUTTON_CLICK') color = 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/10'
        if (val === 'PAGE_VIEW') color = 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/10'
        
        return <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${color}`}>{val}</span>
    },
  }),
  columnHelper.accessor('feature', {
    header: 'Context',
    cell: info => <span className="text-zinc-400 text-xs italic">{info.getValue()}</span>,
  }),
]

export default function EventLogTable() {
  const [data, setData] = useState<EventLog[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    setLoading(true)
    const logs = await getRecentEventLogs(50)
    setData(logs)
    setLoading(false)
  }

  const handleFlush = async () => {
    setLoading(true)
    await forceFlush()
    await fetchData()
  }

  useEffect(() => {
    fetchData()
    // Auto refresh every 10 seconds
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="w-full h-full flex flex-col bg-zinc-950/40">
      <div className="p-2 border-b border-white/5 flex justify-end gap-2 bg-zinc-900/30">
        <button 
           onClick={handleFlush}
           className="flex items-center gap-2 p-1 px-3 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-[10px] font-bold transition-all border border-white/5"
           title="Force write in-memory buffer to Database"
        >
            <Database size={11} />
            Commit Buffer
        </button>
        <button 
           onClick={fetchData}
           disabled={loading}
           className="flex items-center gap-2 p-1 px-3 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-[10px] font-bold transition-all border border-white/5 disabled:opacity-50"
        >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            Refresh
        </button>
      </div>
      
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-zinc-900/80 border-b border-white/10 z-10 backdrop-blur-xl">
            {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                    <th key={header.id} className="p-3 py-2 text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em]">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                ))}
                </tr>
            ))}
            </thead>
            <tbody>
            {table.getRowModel().rows.map(row => (
                <tr key={row.id} className="border-b border-white/[0.03] hover:bg-white/[0.01] transition-colors group">
                {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="p-3 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                ))}
                </tr>
            ))}
            </tbody>
        </table>
        {data.length === 0 && !loading && (
            <div className="p-12 text-center text-zinc-600 text-xs italic">
                No events recorded yet. Perform some actions to see logs.
            </div>
        )}
      </div>
    </div>
  )
}
