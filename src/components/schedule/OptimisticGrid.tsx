'use client'

import React, { useTransition, useRef, useState, useOptimistic, useCallback, useEffect } from 'react'
import { format, addDays, startOfWeek, addWeeks, subWeeks, isSameDay, isWithinInterval, setHours, setMinutes } from 'date-fns'
import { vi } from 'date-fns/locale'
import {
  createScheduleException,
  deleteScheduleExceptionsByIds,
  deleteScheduleExceptionsForDay
} from '@/actions/schedule-actions'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, CalendarDays, Users, Trash2, X, Clock, LayoutGrid, User } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ScheduleItem = {
  id: string
  start: string   // "HH:mm"
  end: string     // "HH:mm"
  reason: string | null
  type: 'RULE' | 'BLOCK' | 'ADD'
  date?: Date
}

export type GridUser = {
  id: string
  name: string
  items: ScheduleItem[]
}

interface OptimisticGridProps {
  workspaceId: string
  profileId?: string
  dateStr: string   // "YYYY-MM-DD"
  users: GridUser[]
  readOnly?: boolean
}

// ─── Constants ───────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7) // 07–22
const DAY_NAMES = ['CN', 'Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7']

function getWeekDays(base: Date): Date[] {
  const start = startOfWeek(base, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

const STATUS_OPTIONS = [
  { type: 'BLOCK' as const, label: 'Bận / Không thể nhận', emoji: '🔴', color: 'bg-red-500 hover:bg-red-600 text-white' },
  { type: 'ADD' as const,   label: 'Sẵn sàng / Online',   emoji: '🟢', color: 'bg-green-600 hover:bg-green-700 text-white' },
]

// ─── Component ───────────────────────────────────────────────────────────────

export function OptimisticGrid({
  workspaceId, profileId, dateStr, users, readOnly = false
}: OptimisticGridProps) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const initialDate = new Date(y, m - 1, d)

  // View state
  const [viewMode, setViewMode] = useState<'SINGLE_WEEK' | 'TEAM_DAY'>('SINGLE_WEEK')
  const [weekBase, setWeekBase] = useState(initialDate)
  const [selectedDay, setSelectedDay] = useState(initialDate)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(users[0]?.id ?? null)
  const [isPending, startTransition] = useTransition()

  // Real-time markers
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  const weekDays = getWeekDays(weekBase)
  const selectedUser = users.find(u => u.id === selectedUserId) ?? users[0]

  // Optimistic updates (we filter based on selected user in Single mode)
  const [optimisticItems, dispatch] = useOptimistic(
    selectedUser?.items ?? [],
    (state, action: any) => {
      if (action.op === 'ADD') return [...state, action.item]
      if (action.op === 'REMOVE') return state.filter((it: any) => !action.ids.includes(it.id))
      return state
    }
  )

  // For TEAM VIEW, we need items for ALL users. 
  // Since useOptimistic is scoped to one user currently, 
  // we'll just use raw items for Team Mode for now (read-only for team mode anyway usually)
  // or we could make the whole users list optimistic. Let's keep it simple for now.

  const isDragging = useRef(false)
  const [dragSel, setDragSel] = useState<{ day: Date; startHour: number; endHour: number } | null>(null)
  const dragStart = useRef<{ day: Date; hour: number } | null>(null)
  const [popup, setPopup] = useState<{ day: Date; startHour: number; endHour: number; x: number; y: number } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // ─── Helper: Get Current Time Indicator Position ───────────────────────────
  const getTimeIndicatorY = () => {
    const h = now.getHours()
    const min = now.getMinutes()
    if (h < 7 || h >= 23) return null
    const topOffset = (h - 7) * 48 // 48px per row
    const minOffset = (min / 60) * 48
    return topOffset + minOffset
  }

  // ─── Cell Helpers ─────────────────────────────────────────────────────────

  const getCellItem = useCallback((userItems: ScheduleItem[], day: Date, hour: number) => {
    return userItems.find(it => {
      if (!it.date || !isSameDay(it.date, day)) return false
      const sH = parseInt(it.start)
      const eH = parseInt(it.end)
      return hour >= sH && hour < eH
    }) ?? null
  }, [])

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handlePointerDown = (day: Date, hour: number) => {
    if (readOnly || viewMode === 'TEAM_DAY') return
    isDragging.current = true
    dragStart.current = { day, hour }
    setDragSel({ day, startHour: hour, endHour: hour })
    setPopup(null)
  }

  const handlePointerEnter = (day: Date, hour: number) => {
    if (readOnly || !isDragging.current || !dragStart.current) return
    setDragSel({
      day,
      startHour: Math.min(dragStart.current.hour, hour),
      endHour: Math.max(dragStart.current.hour, hour)
    })
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (readOnly || !isDragging.current || !dragSel) { isDragging.current = false; return }
    isDragging.current = false
    const rect = gridRef.current?.getBoundingClientRect()
    const x = rect ? Math.min(e.clientX - rect.left, rect.width - 250) : e.clientX
    const y = rect ? e.clientY - rect.top + 12 : e.clientY
    setPopup({ ...dragSel, x: Math.max(0, x), y })
    setDragSel(null)
  }

  const handleApplyStatus = (type: 'BLOCK' | 'ADD') => {
    if (!popup || !selectedUser) return
    const { day, startHour, endHour } = popup
    const startStr = `${startHour.toString().padStart(2, '0')}:00`
    const endStr   = `${(endHour + 1).toString().padStart(2, '0')}:00`
    const dateStr  = format(day, 'yyyy-MM-dd')
    setPopup(null)

    startTransition(async () => {
      dispatch({ op: 'ADD', item: { id: `opt-${Math.random()}`, start: startStr, end: endStr, type, reason: '', date: day } })
      try {
        await createScheduleException(workspaceId, profileId, selectedUser.id, dateStr, startStr, endStr, type)
      } catch (err: any) { toast.error('Lỗi: ' + err.message) }
    })
  }

  const handleClearRange = () => {
    if (!popup || !selectedUser) return
    const { day, startHour, endHour } = popup
    setPopup(null)
    const ids = selectedUser.items.filter(it => it.type !== 'RULE' && it.date && isSameDay(it.date, day) && parseInt(it.start) <= endHour && parseInt(it.end) > startHour).map(it => it.id)
    if (!ids.length) return
    startTransition(async () => {
      dispatch({ op: 'REMOVE', ids })
      try { await deleteScheduleExceptionsByIds(workspaceId, profileId, ids) } catch (err: any) { toast.error(err.message) }
    })
  }

  // ─── Toolbar UI ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── HEADER TOOLBAR ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-muted/30 p-2 rounded-xl border border-border/50">
        <div className="flex items-center gap-3">
          <div className="flex bg-background border border-border p-0.5 rounded-lg shadow-sm">
            <button
              onClick={() => setViewMode('SINGLE_WEEK')}
              className={cn('flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all', viewMode === 'SINGLE_WEEK' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted text-muted-foreground')}
            >
              <User className="h-3.5 w-3.5" /> Cá nhân
            </button>
            <button
              onClick={() => setViewMode('TEAM_DAY')}
              className={cn('flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all', viewMode === 'TEAM_DAY' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted text-muted-foreground')}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Theo Nhóm
            </button>
          </div>

          <div className="h-8 w-px bg-border/60 mx-1" />

          {viewMode === 'SINGLE_WEEK' ? (
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <select
                value={selectedUserId ?? ''}
                onChange={e => setSelectedUserId(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-semibold focus:ring-2 focus:ring-primary/20 outline-none"
              >
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <input 
                type="date"
                value={format(selectedDay, 'yyyy-MM-dd')}
                onChange={e => setSelectedDay(new Date(e.target.value))}
                className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-bold"
              />
            </div>
          )}
        </div>

        {/* Date Nav */}
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => (viewMode === 'SINGLE_WEEK' ? setWeekBase(subWeeks(weekBase, 1)) : setSelectedDay(addDays(selectedDay, -1)))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[140px] text-center">
            <div className="text-xs font-bold uppercase tracking-tight text-primary">
              {viewMode === 'SINGLE_WEEK' ? format(weekBase, 'MMMM yyyy', { locale: vi }) : format(selectedDay, 'EEEE dd/MM', { locale: vi })}
            </div>
            {viewMode === 'SINGLE_WEEK' && (
              <div className="text-[10px] text-muted-foreground font-medium">Week {format(weekDays[0], 'dd/MM')} – {format(weekDays[6], 'dd/MM')}</div>
            )}
          </div>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => (viewMode === 'SINGLE_WEEK' ? setWeekBase(addWeeks(weekBase, 1)) : setSelectedDay(addDays(selectedDay, 1)))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="hidden sm:inline-flex text-[10px] font-bold h-8 px-2" onClick={() => { setWeekBase(new Date()); setSelectedDay(new Date()) }}>
            Hôm nay
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div 
        ref={gridRef}
        className="relative border border-border/60 rounded-2xl overflow-auto shadow-xl bg-background select-none transition-all"
        style={{ maxHeight: '74vh' }}
        onPointerUp={handlePointerUp}
      >
        <table className="w-full border-collapse" style={{ minWidth: viewMode === 'TEAM_DAY' ? 200 * users.length : 800 }}>
          <thead className="sticky top-0 z-40 bg-background/90 backdrop-blur-md">
            <tr>
              <th className="sticky left-0 z-50 bg-background/90 border-b border-r w-16 p-2 text-[10px] uppercase font-black text-muted-foreground tracking-widest">
                Giờ
              </th>
              {(viewMode === 'SINGLE_WEEK' ? weekDays : users).map((obj, i) => {
                const label = viewMode === 'SINGLE_WEEK' ? DAY_NAMES[(obj as Date).getDay()] : (obj as GridUser).name
                const subLabel = viewMode === 'SINGLE_WEEK' ? format(obj as Date, 'dd/MM') : 'Member'
                const isHighlight = viewMode === 'SINGLE_WEEK' ? isSameDay(obj as Date, now) : false
                
                return (
                  <th key={i} className={cn('border-b border-r px-2 py-3 text-center transition-colors', isHighlight && 'bg-primary/5')}>
                    <div className={cn('text-[10px] font-black uppercase tracking-tighter', isHighlight ? 'text-primary' : 'text-muted-foreground/70')}>
                      {label}
                    </div>
                    <div className={cn('text-sm font-bold', isHighlight ? 'text-primary scale-110' : 'text-foreground')}>
                      {subLabel}
                    </div>
                    {viewMode === 'SINGLE_WEEK' && !readOnly && (
                      <button onClick={(e) => { e.stopPropagation(); handleClearDay(obj as Date) }} className="mt-1 p-1 hover:bg-red-50 text-muted-foreground/20 hover:text-red-500 rounded transition-all">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody className="relative">
            {/* Timeline Cursor */}
            {getTimeIndicatorY() !== null && viewMode === 'SINGLE_WEEK' && isWithinInterval(now, { start: weekDays[0], end: addDays(weekDays[6], 1) }) && (
              <div 
                className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
                style={{ top: getTimeIndicatorY()! + 40 }} // 40px offsets header
              >
                <div className="w-16 h-[1.5px] bg-red-500/80 flex items-center justify-end pr-1">
                   <div className="w-2 h-2 rounded-full bg-red-500 shadow-sm" />
                </div>
                <div className="flex-1 h-[1.5px] bg-red-500/30" />
              </div>
            )}

            {HOURS.map(hour => (
              <tr key={hour}>
                <td className="sticky left-0 z-20 bg-background/90 border-b border-r p-2 text-[11px] font-black text-muted-foreground text-right pr-4 h-12 leading-none align-top pt-2">
                  {hour < 10 ? `0${hour}` : hour}:00
                </td>
                {(viewMode === 'SINGLE_WEEK' ? weekDays : users).map((col, idx) => {
                  const day = viewMode === 'SINGLE_WEEK' ? (col as Date) : selectedDay
                  const items = viewMode === 'SINGLE_WEEK' ? optimisticItems : (col as GridUser).items
                  const item = getCellItem(items, day, hour)
                  const drag = isInDrag(day, hour)
                  
                  let cellBg = ''
                  if (item?.type === 'BLOCK') cellBg = 'bg-red-500/15'
                  else if (item?.type === 'ADD') cellBg = 'bg-green-500/10'
                  else if (item?.type === 'RULE') cellBg = 'bg-blue-500/5 border-l-2 border-blue-500/20'

                  return (
                    <td
                      key={idx}
                      className={cn(
                        'border-b border-r h-12 relative transition-all',
                        cellBg,
                        drag && '!bg-primary/20 !border-primary/50',
                        !readOnly && viewMode === 'SINGLE_WEEK' && !drag && 'hover:bg-muted/30 cursor-crosshair'
                      )}
                      onPointerDown={() => handlePointerDown(day, hour)}
                      onPointerEnter={() => handlePointerEnter(day, hour)}
                      onContextMenu={(e) => { e.preventDefault(); /* quick delete item id */ }}
                    >
                      {item && hour === parseInt(item.start) && (
                        <div className="absolute inset-x-1 top-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold truncate leading-tight flex items-center gap-1">
                           {item.type === 'BLOCK' ? '🔴' : item.type === 'ADD' ? '🟢' : '🔵'}
                           <span className="opacity-70">{item.reason || item.type}</span>
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Status Popup */}
        {popup && (
          <div className="absolute z-[100] bg-popover border border-border shadow-2xl rounded-2xl p-4 w-60 animate-in zoom-in-95" style={{ left: popup.x, top: popup.y }}>
            <div className="flex justify-between items-start mb-3">
               <div>
                 <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">Chọn trạng thái</div>
                 <div className="text-sm font-bold">{format(popup.day, 'dd/MM')} @ {popup.startHour}:00 - {popup.endHour+1}:00</div>
               </div>
               <button onClick={() => setPopup(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-col gap-2">
               {STATUS_OPTIONS.map(opt => (
                 <button key={opt.type} onClick={() => handleApplyStatus(opt.type)} className={cn('flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-xs font-black transition-all active:scale-95', opt.color)}>
                    <span>{opt.emoji}</span> {opt.label}
                 </button>
               ))}
               <button onClick={handleClearRange} className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-xs font-black text-red-500 border border-red-500/20 hover:bg-red-50 transition-all">
                  <Trash2 className="h-4 w-4" /> Xóa trạng thái
               </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
