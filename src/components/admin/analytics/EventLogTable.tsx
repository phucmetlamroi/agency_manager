'use client'

import React, { useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'

type EventLog = {
    id: string
    time: string
    user: string
    event: string
    feature: string
}

const mockData: EventLog[] = [
    { id: '1', time: '10:45:21', user: 'Admin', event: 'BUTTON_CLICK', feature: 'Payroll Lock' },
    { id: '2', time: '10:42:00', user: 'Editor A', event: 'TASK_START', feature: 'Task #421' },
    { id: '3', time: '10:30:15', user: 'Client X', event: 'REVISION', feature: 'Video V2' },
    { id: '4', time: '10:15:00', user: 'Editor B', event: 'PAGE_VIEW', feature: 'Drive Hub' },
    { id: '5', time: '09:55:10', user: 'Admin', event: 'DOWNLOAD', feature: 'VDownloader' },
]

const columnHelper = createColumnHelper<EventLog>()

const columns = [
  columnHelper.accessor('time', {
    header: 'Timestamp',
    cell: info => <span className="text-zinc-400 font-mono text-xs">{info.getValue()}</span>,
  }),
  columnHelper.accessor('user', {
    header: 'Actor',
    cell: info => <span className="text-white font-medium">{info.getValue()}</span>,
  }),
  columnHelper.accessor('event', {
    header: 'Event Type',
    cell: info => {
        const val = info.getValue()
        let color = 'bg-zinc-800 text-zinc-300'
        if (val === 'REVISION') color = 'bg-red-500/20 text-red-400 border border-red-500/20'
        if (val === 'BUTTON_CLICK') color = 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/20'
        
        return <span className={`px-2 py-1 rounded-md text-[10px] font-bold tracking-wider ${color}`}>{val}</span>
    },
  }),
  columnHelper.accessor('feature', {
    header: 'Target / Feature',
    cell: info => <span className="text-zinc-300">{info.getValue()}</span>,
  }),
]

export default function EventLogTable() {
  const [data] = useState(() => [...mockData])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="w-full h-full overflow-auto custom-scrollbar">
      <table className="w-full text-left border-collapse">
        <thead className="sticky top-0 bg-zinc-900 border-b border-white/10 z-10 backdrop-blur-md">
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th key={header.id} className="p-3 text-xs font-semibold text-zinc-500 uppercase tracking-wilder">
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map(row => (
            <tr key={row.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
              {row.getVisibleCells().map(cell => (
                <td key={cell.id} className="p-3 text-sm">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
