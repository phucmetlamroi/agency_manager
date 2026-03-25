'use client'

import React, { useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  SortingState,
  createColumnHelper
} from '@tanstack/react-table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getUserErrorDetails } from '@/actions/analytics-actions'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Eye } from 'lucide-react'

type UserAnalytics = {
  id: string
  username: string
  completedTasks: number
  totalPenalty: number
  errorRate: number
  rank: string
  hasAcceptedTerms: boolean
  termsAcceptedAt: string | null
}

const columnHelper = createColumnHelper<UserAnalytics>()

const columns = [
  columnHelper.accessor('username', {
    header: 'Nhân sự',
    cell: info => (
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8 border border-zinc-700">
          <AvatarImage src={`https://avatar.vercel.sh/${info.getValue()}`} />
          <AvatarFallback className="bg-zinc-800">{info.getValue()[0]}</AvatarFallback>
        </Avatar>
        <span className="font-semibold text-zinc-200">{info.getValue()}</span>
      </div>
    )
  }),
  columnHelper.accessor('completedTasks', {
    header: 'Task Hoàn Tất',
    cell: info => <div className="text-zinc-300 font-mono text-center">{info.getValue()}</div>
  }),
  columnHelper.accessor('totalPenalty', {
    header: 'Tổng Lỗi',
    cell: info => <div className="text-red-400 font-mono font-bold text-center">{info.getValue()}</div>
  }),
  columnHelper.accessor('errorRate', {
    header: 'Error Rate (%)',
    cell: info => {
      const val = info.getValue()
      return (
        <div className="text-center">
            <span className={`font-mono px-2 py-1 rounded ${val < 0.5 ? 'bg-green-500/20 text-green-400' : val > 1.5 ? 'bg-red-500/20 text-red-500' : 'bg-yellow-500/20 text-yellow-400'}`}>
              {val}%
            </span>
        </div>
      )
    }
  }),
  columnHelper.accessor('rank', {
    header: 'Xếp Hạng',
    cell: info => {
      const val = info.getValue()
      let bg = 'bg-zinc-800 text-zinc-400'
      if (val === 'S') { bg = 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50' }
      if (val === 'A') { bg = 'bg-green-500/20 text-green-400 border-green-500/50' }
      if (val === 'B') { bg = 'bg-blue-500/20 text-blue-400 border-blue-500/50' }
      if (val === 'C') { bg = 'bg-orange-500/20 text-orange-400 border-orange-500/50' }
      if (val === 'D') { bg = 'bg-red-500/20 text-red-500 border-red-500/50' }
      
      return (
        <div className="text-center">
           <Badge variant="outline" className={`${bg} font-bold px-3`}>{val}</Badge>
        </div>
      )
    }
  }),
  columnHelper.accessor('hasAcceptedTerms', {
    header: 'Thỏa thuận',
    cell: info => {
      const row = info.row.original;
      const accepted = row.hasAcceptedTerms;
      const date = row.termsAcceptedAt;

      if (!accepted) {
        return (
          <div className="text-center flex flex-col items-center">
            <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30 text-[10px]">Chưa ký</Badge>
          </div>
        )
      }

      // Format date in Vietnam Time (+7)
      let dateString = 'Đã ký';
      if (date) {
        const d = new Date(date);
        // Format: HH:mm DD/MM/YYYY
        dateString = d.toLocaleString('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
      }

      return (
        <div className="text-center flex flex-col items-center gap-1">
          <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30 text-[10px]">Đã ký</Badge>
          <span className="text-[9px] text-zinc-500 font-mono">{dateString}</span>
        </div>
      )
    }
  }),
  columnHelper.display({
    id: 'actions',
    header: 'Hành Động',
    cell: info => {
      const row = info.row.original;
      // We pass workspaceId as a prop to the Table, but columns define statically.
      // So workspaceId is retrieved from the pathname window or passed in via meta?
      // Since columns is static, we can inject workspaceId inside the cell using a tricky way or use cell context.
      // A better way is using cell context meta, but here we can just use a relative link if safe, 
      // OR we just use `loadDetails` hook differently.
      // Wait, we can't easily access workspaceId from static column define unless we pass it via meta.
      return null; // Will override this in a useMemo below!
    }
  })
]

export default function AnalyticsTable({ data, workspaceId }: { data: UserAnalytics[], workspaceId: string }) {
  const [sorting, setSorting] = useState<SortingState>([ { id: 'errorRate', desc: true } ])
  const [globalFilter, setGlobalFilter] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<any[]>([])
  const [loadingDetails, setLoadingDetails] = useState(false)

  const tableColumns = React.useMemo(() => {
    return [
      ...columns.slice(0, -1), // remove static dummy placeholder
      columnHelper.display({
        id: 'actions',
        header: 'Hành Động',
        cell: info => {
          const row = info.row.original;
          return (
            <div className="text-center flex justify-center">
               <Link href={`/${workspaceId}/admin/analytics/staff/${row.id}`} onClick={e => e.stopPropagation()}>
                 <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg transition-colors border border-indigo-500/20 text-xs font-semibold">
                   <Eye className="w-3.5 h-3.5" /> Chi tiết
                 </div>
               </Link>
            </div>
          )
        }
      })
    ];
  }, [workspaceId]);

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const loadDetails = async (userId: string) => {
    try {
      setSelectedUserId(userId)
      setLoadingDetails(true)
      const details = await getUserErrorDetails(workspaceId, userId)
      setErrorDetails(details)
    } catch (err) {
      console.error("Failed to load user error details", err)
      setErrorDetails([])
    } finally {
      setLoadingDetails(false)
    }
  }

  return (
    <div className="flex flex-col md:flex-row gap-6 h-[75vh]">
      {/* LEFT: TABLE */}
      <div className={`transition-all duration-300 ${selectedUserId ? 'w-full md:w-2/3' : 'w-full'} bg-zinc-950/80 border border-zinc-800/80 shadow-2xl rounded-2xl overflow-hidden flex flex-col`}>
        <div className="p-4 border-b border-zinc-800/80 flex justify-between items-center bg-zinc-900/50">
          <h2 className="text-white font-semibold">Bảng Hiệu Suất Editor</h2>
          <input 
            type="text" 
            placeholder="Search nhân sự..." 
            value={globalFilter ?? ''}
            onChange={e => setGlobalFilter(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-white text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2 w-64 outline-none"
          />
        </div>
        <div className="overflow-x-auto flex-1 custom-scrollbar">
          <table className="w-full text-sm text-left text-zinc-400">
            <thead className="text-xs text-zinc-500 uppercase bg-zinc-950/50 border-b border-zinc-800 sticky top-0 z-10 backdrop-blur-md">
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th 
                        key={header.id} 
                        onClick={header.column.getToggleSortingHandler()}
                        className="px-6 py-4 cursor-pointer hover:bg-zinc-800/30 transition-colors"
                    >
                      <div className="flex items-center gap-1 cursor-pointer justify-center">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span className="text-zinc-600">
                          {{ asc: ' ▲', desc: ' ▼' }[header.column.getIsSorted() as string] ?? null}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr 
                  key={row.id} 
                  onClick={() => loadDetails(row.original.id)}
                  className={`border-b border-zinc-800/50 cursor-pointer transition-all duration-200 ${selectedUserId === row.original.id ? 'bg-indigo-950/30 border-indigo-500/30 shadow-[inset_4px_0_0_0_rgba(99,102,241,1)]' : 'hover:bg-zinc-900/50 bg-transparent'}`}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-6 py-4">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {table.getRowModel().rows.length === 0 && (
                  <tr>
                    <td colSpan={columns.length} className="px-6 py-8 text-center text-zinc-500">
                      Chưa có dữ liệu thống kê trong tháng này.
                    </td>
                  </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT: DRILL DOWN PANEL */}
      {selectedUserId && (
          <div className="w-full md:w-1/3 bg-zinc-950/90 border border-red-900/30 shadow-[0_0_30px_rgba(220,38,38,0.05)] rounded-2xl overflow-hidden flex flex-col animate-in slide-in-from-right-4 duration-300">
              <div className="p-4 border-b border-red-900/30 bg-red-950/20 flex justify-between items-center backdrop-blur-md">
                  <h3 className="font-bold text-red-500 flex items-center gap-2">
                      <span className="text-lg">📈</span> Hồ Sơ Vi Phạm
                  </h3>
                  <button onClick={() => setSelectedUserId(null)} className="text-zinc-500 hover:text-white transition-colors bg-zinc-900/50 rounded-full w-8 h-8 flex items-center justify-center">✕</button>
              </div>
              <div className="p-4 flex-1 overflow-y-auto custom-scrollbar bg-gradient-to-b from-red-950/5 to-transparent">
                  {loadingDetails ? (
                      <div className="flex justify-center py-10">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
                      </div>
                  ) : errorDetails.length > 0 ? (
                      <div className="space-y-4">
                            {errorDetails.map(err => {
                                const hasError = err.totalFrequency > 0;
                                return (
                                    <div 
                                        key={err.errorId} 
                                        className={`rounded-xl p-4 shadow-sm transition-all duration-200 border ${
                                            hasError 
                                                ? 'bg-red-500/5 border-red-500/30 ring-1 ring-red-500/10' 
                                                : 'bg-zinc-900/40 border-zinc-800/50 opacity-60 grayscale-[0.5]'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <span className={`font-bold ${hasError ? 'text-red-400' : 'text-zinc-400'}`}>{err.code}</span>
                                            {hasError && (
                                                <span className="bg-red-500/10 text-red-400 border border-red-500/20 text-xs px-2 py-1 rounded font-mono font-bold animate-pulse">
                                                    -{err.totalPenalty} pts
                                                </span>
                                            )}
                                            {!hasError && (
                                                <span className="text-[10px] text-zinc-600 uppercase font-bold tracking-tighter">Sạch lỗi</span>
                                            )}
                                        </div>
                                        <p className={`text-xs mb-3 leading-relaxed ${hasError ? 'text-zinc-300' : 'text-zinc-500'}`}>{err.description}</p>
                                        <div className={`flex justify-between items-center text-xs border-t pt-3 mt-1 ${hasError ? 'border-red-900/20' : 'border-zinc-800/50'}`}>
                                            <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Tần suất mắc lỗi</span>
                                            <span className={`px-2 py-1 rounded font-bold ${hasError ? 'bg-red-500/20 text-red-400' : 'bg-zinc-800 text-zinc-500'}`}>
                                                {err.totalFrequency} lần
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                      </div>
                  ) : (
                      <div className="text-center py-16 flex flex-col items-center justify-center">
                          <span className="text-4xl mb-4">🏆</span>
                          <p className="text-zinc-400 font-medium">Không có lỗi nào được ghi nhận.</p>
                          <p className="text-zinc-600 text-sm mt-1">Nhân sự xuất sắc!</p>
                      </div>
                  )}
              </div>
          </div>
      )}
    </div>
  )
}
