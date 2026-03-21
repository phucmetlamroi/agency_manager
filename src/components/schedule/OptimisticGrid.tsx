'use client'

import React, { useTransition, useRef, useState, useOptimistic, useCallback, useEffect } from 'react'
import { format, addDays, startOfWeek, addWeeks, subWeeks, isSameDay, isWithinInterval, eachDayOfInterval } from 'date-fns'
import { vi } from 'date-fns/locale'
import {
  createBatchScheduleExceptions,
  deleteScheduleExceptionsByIds,
  deleteScheduleExceptionsForDay
} from '@/actions/schedule-actions'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, CalendarDays, Users, Trash2, X, Clock, LayoutGrid, User, Copy, ClipboardCheck, Info } from 'lucide-react'
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

const PRESETS = [
  { label: '8:00 - 17:00 (Hành chính)', start: 8, end: 17, icon: '⏰' },
  { label: '8:00 - 12:00 (Sáng)',      start: 8, end: 12, icon: '☀️' },
  { label: '13:00 - 18:00 (Chiều)',    start: 13, end: 18, icon: '🌇' },
  { label: '18:00 - 22:00 (Tối)',      start: 18, end: 22, icon: '🌙' },
]

// ─── Component ───────────────────────────────────────────────────────────────

export function OptimisticGrid({
  workspaceId, profileId, dateStr, users, readOnly = false
}: OptimisticGridProps) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const initialDate = new Date(y, m - 1, d)

  const [viewMode, setViewMode] = useState<'SINGLE_WEEK' | 'TEAM_DAY'>('SINGLE_WEEK')
  const [isCompact, setIsCompact] = useState(false)
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

  // Copy/Paste state
  const [copyData, setCopyData] = useState<ScheduleItem[] | null>(null)

  const weekDays = getWeekDays(weekBase)
  const selectedUser = users.find(u => u.id === selectedUserId) ?? users[0]

  // Optimistic updates
  const [optimisticItems, dispatch] = useOptimistic(
    selectedUser?.items ?? [],
    (state: ScheduleItem[], action: any) => {
      if (action.op === 'ADD') return [...state, ...action.items]
      if (action.op === 'REMOVE') return state.filter(it => !action.ids.includes(it.id))
      return state
    }
  )

  // Multi-day Drag state
  const isDragging = useRef(false)
  const [dragSel, setDragSel] = useState<{ startDay: Date; endDay: Date; startHour: number; endHour: number } | null>(null)
  const dragStart = useRef<{ day: Date; hour: number } | null>(null)
  
  const [popup, setPopup] = useState<{ 
    startDay: Date; 
    endDay: Date; 
    startHour: number; 
    endHour: number; 
    x: number; 
    y: number 
  } | null>(null)

  const [hoverTooltip, setHoverTooltip] = useState<{
    day: Date;
    hour: number;
    x: number;
    y: number;
    stats: { free: number; busy: number; tentative: number; busyUsers: string[] };
  } | null>(null)

  const gridRef = useRef<HTMLDivElement>(null)

  // ─── Cell Helpers ─────────────────────────────────────────────────────────

  const getCellItem = useCallback((userItems: ScheduleItem[], day: Date, hour: number) => {
    return userItems.find(it => {
      if (!it.date || !isSameDay(it.date, day)) return false
      const sH = parseInt(it.start)
      const eH = parseInt(it.end)
      return hour >= sH && hour < eH
    }) ?? null
  }, [])

  const getDayStats = useCallback((day: Date) => {
    const dayItems = optimisticItems.filter(it => it.date && isSameDay(it.date, day))
    let busyTotal = 0
    let addTotal = 0
    dayItems.forEach(it => {
      const hours = parseInt(it.end) - parseInt(it.start)
      if (it.type === 'BLOCK') busyTotal += hours
      else if (it.type === 'ADD') addTotal += hours
    })
    return { busyTotal, addTotal }
  }, [optimisticItems])

  const isInDrag = (day: Date, hour: number) => {
    if (!dragSel) return false
    const dSorted = [dragSel.startDay, dragSel.endDay].sort((a, b) => a.getTime() - b.getTime())
    const hSorted = [dragSel.startHour, dragSel.endHour].sort((a,b) => a-b)
    const inDayRange = day >= dSorted[0] && day <= dSorted[1]
    const inHourRange = hour >= hSorted[0] && hour <= hSorted[1]
    return inDayRange && inHourRange
  }

  // Calculate Now Snapshot Stats
  const getNowStats = useCallback(() => {
    let free = 0, busy = 0, tentative = 0
    const currentHour = now.getHours()
    
    users.forEach(u => {
      const item = getCellItem(u.items, now, currentHour)
      if (!item) tentative++ // No status = tentative/unknown
      else if (item.type === 'BLOCK') busy++
      else if (item.type === 'ADD' || item.type === 'RULE') free++
    })
    
    return { free, busy, tentative }
  }, [now, users, getCellItem])

  const getCellStats = useCallback((day: Date, hour: number) => {
    let free = 0, busy = 0, tentative = 0
    const busyUsers: string[] = []

    users.forEach(u => {
      const item = getCellItem(u.items, day, hour)
      if (!item) {
        tentative++
      } else if (item.type === 'BLOCK') {
        busy++
        if (busyUsers.length < 5) busyUsers.push(u.name)
      } else if (item.type === 'ADD' || item.type === 'RULE') {
        free++
      }
    })

    return { free, busy, tentative, busyUsers }
  }, [users, getCellItem])

  // ─── Hover Handlers ───────────────────────────────────────────────────────

  const handleCellHover = (e: React.MouseEvent, day: Date, hour: number) => {
    if (viewMode !== 'TEAM_DAY' || isDragging.current || popup) return

    const rect = gridRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.min(e.clientX - rect.left + 15, rect.width - 200)
    const y = Math.min(e.clientY - rect.top + 15, rect.height - 150)

    const stats = getCellStats(day, hour)
    setHoverTooltip({ day, hour, x, y, stats })
  }

  // ─── Drag Handlers ────────────────────────────────────────────────────────

  const handlePointerDown = (day: Date, hour: number) => {
    if (readOnly || viewMode === 'TEAM_DAY') return
    isDragging.current = true
    dragStart.current = { day, hour }
    setDragSel({ startDay: day, endDay: day, startHour: hour, endHour: hour })
    setPopup(null)
  }

  const handlePointerEnter = (day: Date, hour: number) => {
    if (readOnly || !isDragging.current || !dragStart.current) return
    setDragSel({
      startDay: dragStart.current.day,
      endDay: day,
      startHour: Math.min(dragStart.current.hour, hour),
      endHour: Math.max(dragStart.current.hour, hour)
    })
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (readOnly || !isDragging.current || !dragSel) { isDragging.current = false; return }
    isDragging.current = false
    const rect = gridRef.current?.getBoundingClientRect()
    const x = rect ? Math.min(e.clientX - rect.left, rect.width - 250) : e.clientX
    const y = rect ? Math.min(e.clientY - rect.top + 12, (rect.height - 300)) : e.clientY
    
    // Sort coordinates for the popup
    const startDay = dragSel.startDay < dragSel.endDay ? dragSel.startDay : dragSel.endDay
    const endDay = dragSel.startDay > dragSel.endDay ? dragSel.startDay : dragSel.endDay

    setPopup({ 
      startDay, 
      endDay, 
      startHour: dragSel.startHour, 
      endHour: dragSel.endHour, 
      x: Math.max(0, x), 
      y 
    })
    setDragSel(null)
  }

  // ─── Save Logic ───────────────────────────────────────────────────────────

  const applyStatusRange = async (type: 'BLOCK' | 'ADD', preset?: typeof PRESETS[0]) => {
    if (!popup || !selectedUser) return
    const { startDay, endDay, startHour, endHour } = popup
    
    const finalStartHour = preset ? preset.start : startHour
    const finalEndHour = preset ? preset.end - 1 : endHour
    const startStr = `${finalStartHour.toString().padStart(2, '0')}:00`
    const endStr   = `${(finalEndHour + 1).toString().padStart(2, '0')}:00`
    
    const days = eachDayOfInterval({ start: startDay, end: endDay })
    const entries = days.map(d => ({
      dateStr: format(d, 'yyyy-MM-dd'),
      startTime: startStr,
      endTime: endStr,
      type,
      reason: preset?.label || ''
    }))

    setPopup(null)

    startTransition(async () => {
      dispatch({ 
        op: 'ADD', 
        items: days.map(d => ({ 
          id: `opt-${Math.random()}`, 
          start: startStr, 
          end: endStr, 
          type, 
          reason: preset?.label || '', 
          date: d 
        })) 
      })

      try {
        await createBatchScheduleExceptions(workspaceId, profileId, selectedUser.id, entries)
        toast.success(`Đã áp dụng cho ${days.length} ngày thành công!`)
      } catch (err: any) {
        toast.error('Lỗi: ' + err.message)
      }
    })
  }

  const handleCopyDay = (day: Date) => {
    const items = optimisticItems.filter(it => it.date && isSameDay(it.date, day) && it.type !== 'RULE')
    if (items.length === 0) { toast.error('Ngày này trống, không có gì để copy!'); return }
    setCopyData(items)
    toast.success(`Đã sao chép lịch ngày ${format(day, 'dd/MM')}. Bạn có thể Dán (Paste) vào các ngày khác.`, { duration: 4000 })
  }

  const handlePasteDay = (day: Date, mode: 'ONE' | 'WEEK' | 'WEEKDAYS') => {
    if (!copyData || !selectedUser) return
    
    let targetDays: Date[] = []
    if (mode === 'ONE') targetDays = [day]
    else if (mode === 'WEEK') targetDays = weekDays
    else if (mode === 'WEEKDAYS') targetDays = weekDays.slice(0, 5)

    // Filter out 'RULE' items because they cannot be pasted as exceptions
    const pasteableItems = copyData.filter(it => it.type === 'BLOCK' || it.type === 'ADD')

    if (pasteableItems.length === 0) {
      toast.error('Không tìm thấy trạng thái Bận hoặc Sẵn sàng để dán. Lịch cố định không được copy.')
      return
    }

    const entries = targetDays.flatMap(d => pasteableItems.map(it => ({
      dateStr: format(d, 'yyyy-MM-dd'),
      startTime: it.start,
      endTime: it.end,
      type: it.type as 'BLOCK' | 'ADD',
      reason: it.reason || ''
    })))

    startTransition(async () => {
      dispatch({ op: 'ADD', items: targetDays.flatMap(d => pasteableItems.map(it => ({ ...it, id: `opt-${Math.random()}`, date: d }))) })
      try {
        await createBatchScheduleExceptions(workspaceId, profileId, selectedUser.id, entries)
        toast.success(`Đã dán lịch vào ${targetDays.length} ngày!`)
      } catch (err: any) { toast.error(err.message) }
    })
  }

  const handleClearRange = () => {
    if (!popup || !selectedUser) return
    const { startDay, endDay, startHour, endHour } = popup
    setPopup(null)

    const days = eachDayOfInterval({ start: startDay, end: endDay })
    const overlapping = (selectedUser.items).filter(it => {
      if (it.type === 'RULE' || !it.date) return false
      const isInDayRange = days.some(d => isSameDay(it.date!, d))
      if (!isInDayRange) return false
      const sH = parseInt(it.start)
      const eH = parseInt(it.end)
      return sH <= endHour && eH > startHour
    })
    
    if (!overlapping.length) { toast('Không có trạng thái nào để xóa trong vùng này'); return }
    const ids = overlapping.map(it => it.id)

    startTransition(async () => {
      dispatch({ op: 'REMOVE', ids })
      try {
        await deleteScheduleExceptionsByIds(workspaceId, profileId, ids)
        toast.success(`Đã xóa ${ids.length} mục lịch.`)
      } catch (err: any) { toast.error(err.message) }
    })
  }

  const handleContextMenu = (e: React.PointerEvent | React.MouseEvent, day: Date, hour: number) => {
    if (readOnly) return
    e.preventDefault()
    const item = getCellItem(selectedUser.items, day, hour)
    if (!item || item.type === 'RULE') return

    startTransition(async () => {
      dispatch({ op: 'REMOVE', ids: [item.id] })
      try {
        await deleteScheduleExceptionsByIds(workspaceId, profileId, [item.id])
        toast.success(`Đã xóa trạng thái ${format(day, 'dd/MM')} ${hour}:00`)
      } catch (err: any) { toast.error(err.message) }
    })
  }

  const handleClearDay = (day: Date) => {
    if (readOnly || !selectedUser) return
    if (!confirm(`Bạn có chắc muốn xóa toàn bộ lịch ngoại lệ ngày ${format(day, 'dd/MM')}?`)) return
    
    const dayStr = format(day, 'yyyy-MM-dd')
    const ids = selectedUser.items.filter(it => it.date && isSameDay(it.date, day) && it.type !== 'RULE').map(it => it.id)
    if (!ids.length) return

    startTransition(async () => {
      dispatch({ op: 'REMOVE', ids })
      try {
        await deleteScheduleExceptionsForDay(workspaceId, profileId, selectedUser.id, dayStr)
        toast.success(`Đã xóa lịch ngày ${format(day, 'dd/MM')}`)
      } catch (err: any) { toast.error(err.message) }
    })
  }

  // ─── UI Rendering ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 font-sans">
      {/* ── HEADER ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="flex bg-muted/50 p-1 rounded-xl">
             <button onClick={() => setViewMode('SINGLE_WEEK')} className={cn('flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-black transition-all', viewMode === 'SINGLE_WEEK' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-muted-foreground hover:bg-muted')}>
                <User className="h-4 w-4" /> CÁ NHÂN
             </button>
             <button onClick={() => setViewMode('TEAM_DAY')} className={cn('flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-black transition-all', viewMode === 'TEAM_DAY' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-muted-foreground hover:bg-muted')}>
                <LayoutGrid className="h-4 w-4" /> NHÓM
             </button>
          </div>
          
          <div className="h-10 w-px bg-border/60" />

          {viewMode === 'SINGLE_WEEK' ? (
            <div className="flex items-center gap-2 bg-background/80 backdrop-blur-md border border-border px-3 py-1.5 rounded-xl shadow-sm">
               <Users className="h-4 w-4 text-primary" />
               <select 
                 value={selectedUserId ?? ''} 
                 onChange={e => setSelectedUserId(e.target.value)} 
                 className="bg-transparent text-sm font-bold text-foreground outline-none border-none cursor-pointer appearance-none pr-4"
               >
                  {users.map(u => (
                    <option key={u.id} value={u.id} className="bg-slate-900 text-white">
                      {u.name}
                    </option>
                  ))}
               </select>
            </div>
          ) : (
            <div className="flex items-center gap-3">
               <div className="flex items-center gap-2 bg-background border border-border px-3 py-1.5 rounded-xl shadow-sm">
                 <CalendarDays className="h-4 w-4 text-primary" />
                 <input type="date" value={format(selectedDay, 'yyyy-MM-dd')} onChange={e => setSelectedDay(new Date(e.target.value))} className="bg-transparent text-sm font-bold outline-none border-none" />
               </div>
               
               {/* Now Snapshot */}
               <div className="hidden md:flex items-center gap-3 px-3 py-1.5 bg-background border border-border rounded-xl shadow-sm text-[11px] font-bold">
                 <span className="flex items-center gap-1.5 text-muted-foreground uppercase tracking-widest border-r pr-3"><Clock className="h-3.5 w-3.5"/> NOW</span>
                 <span className="flex items-center gap-1 text-green-600" title="Sẵn sàng"><div className="w-1.5 h-1.5 rounded-full bg-green-600"/> {getNowStats().free}</span>
                 <span className="flex items-center gap-1 text-red-500" title="Bận"><div className="w-1.5 h-1.5 rounded-full bg-red-500"/> {getNowStats().busy}</span>
                 <span className="flex items-center gap-1 text-muted-foreground/60" title="Chưa rõ"><div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30"/> {getNowStats().tentative}</span>
               </div>
               
               {/* Compact Toggle */}
               <button onClick={() => setIsCompact(!isCompact)} className={cn('px-3 py-1.5 rounded-xl border text-xs font-bold transition-all', isCompact ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-background border-border text-muted-foreground')}>
                 {isCompact ? 'THU GỌN' : 'MẶC ĐỊNH'}
               </button>
            </div>
          )}
        </div>

        {/* Date Nav */}
        <div className="flex items-center gap-1.5 px-2 bg-muted/30 rounded-2xl p-1">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => (viewMode === 'SINGLE_WEEK' ? setWeekBase(subWeeks(weekBase, 1)) : setSelectedDay(addDays(selectedDay, -1)))}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-[150px] text-center">
             <div className="text-[12px] font-black uppercase text-primary tracking-tighter">
                {viewMode === 'SINGLE_WEEK' ? format(weekBase, 'MMMM yyyy', { locale: vi }) : format(selectedDay, 'EEEE dd/MM', { locale: vi })}
             </div>
             {viewMode === 'SINGLE_WEEK' && <div className="text-[10px] text-muted-foreground font-black opacity-60">Tuần {format(weekDays[0], 'dd/MM')} – {format(weekDays[6], 'dd/MM')}</div>}
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => (viewMode === 'SINGLE_WEEK' ? setWeekBase(addWeeks(weekBase, 1)) : setSelectedDay(addDays(selectedDay, 1)))}>
            <ChevronRight className="h-5 w-5" />
          </Button>
          <Button variant="ghost" className="text-[10px] font-black h-9 px-3 rounded-xl hover:bg-primary/10 hover:text-primary" onClick={() => { setWeekBase(new Date()); setSelectedDay(new Date()) }}>TIẾP THEO</Button>
        </div>
      </div>

      {/* Stats Preview Bar */}
      {viewMode === 'SINGLE_WEEK' && (
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
           <div className="flex-1 min-w-[64px]" /> {/* Spacer for hour col */}
           {weekDays.map((day, i) => {
              const { busyTotal, addTotal } = getDayStats(day)
              return (
                <div key={i} className="flex-1 min-w-[100px] flex gap-1.5 items-center justify-center p-2 bg-card rounded-xl border border-border/50 text-[10px] font-bold">
                   <span className="flex items-center gap-1 text-red-500"><div className="w-2 h-2 rounded-full bg-red-500" /> {busyTotal}h</span>
                   <span className="flex items-center gap-1 text-green-600"><div className="w-2 h-2 rounded-full bg-green-600" /> {addTotal}h</span>
                </div>
              )
           })}
        </div>
      )}

      {/* Main Grid */}
      <div ref={gridRef} className="relative border border-border/80 rounded-[28px] overflow-auto shadow-2xl bg-background/50 backdrop-blur-3xl select-none" style={{ maxHeight: '70vh' }} onPointerUp={handlePointerUp}>
        <table className="w-full border-separate border-spacing-0" style={{ minWidth: viewMode === 'TEAM_DAY' ? 220 * users.length : 900 }}>
           <thead className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl">
              <tr>
                 <th className="sticky left-0 z-50 bg-background border-b border-r py-3 px-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">TIME</th>
                 {(viewMode === 'SINGLE_WEEK' ? weekDays : users).map((obj, i) => {
                    const isWeek = viewMode === 'SINGLE_WEEK'
                    const day = isWeek ? (obj as Date) : selectedDay
                    const isToday = isSameDay(day, new Date())
                    return (
                      <th key={i} className={cn('border-b border-r px-4 py-4 text-center transition-all min-w-[120px]', isToday && 'bg-primary/5', isCompact && 'py-2 px-2')}>
                        <div className={cn('text-[11px] font-black uppercase tracking-widest mb-1', isToday ? 'text-primary' : 'text-muted-foreground/50')}>
                           {isWeek ? DAY_NAMES[day.getDay()] : (obj as GridUser).name}
                        </div>
                        <div className="flex items-center justify-center gap-2">
                           <span className={cn('font-black tracking-tighter', isToday ? 'text-primary' : 'text-foreground', isCompact ? 'text-sm' : 'text-lg')}>{isWeek ? format(day, 'dd/MM') : 'Member'}</span>
                           {isWeek && !readOnly && (
                             <div className="flex gap-1 group">
                                <button title="Copy day" onClick={() => handleCopyDay(day)} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground/30 hover:text-primary transition-all"><Copy className="h-3.5 w-3.5" /></button>
                                {copyData && <button title="Paste here" onClick={() => handlePasteDay(day, 'ONE')} className="p-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20"><ClipboardCheck className="h-3.5 w-3.5" /></button>}
                                <button title="Clear day" onClick={() => handleClearDay(day)} className="p-1.5 hover:bg-red-50 rounded-lg text-muted-foreground/30 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                             </div>
                           )}
                        </div>
                      </th>
                    )
                 })}
              </tr>
           </thead>

           <tbody>
              {HOURS.map(hour => (
                <tr key={hour} className="group/row">
                   <td className={cn('sticky left-0 z-20 bg-background border-b border-r p-4 text-[12px] font-black text-muted-foreground text-right align-top group-hover/row:text-foreground group-hover/row:bg-muted/50 transition-all', isCompact ? 'h-10 p-2 text-[10px]' : 'h-14')}>
                      {hour < 10 ? `0${hour}` : hour}:00
                   </td>
                   {(viewMode === 'SINGLE_WEEK' ? weekDays : users).map((col, idx) => {
                      const day = viewMode === 'SINGLE_WEEK' ? (col as Date) : selectedDay
                      const items = viewMode === 'SINGLE_WEEK' ? optimisticItems : (col as GridUser).items
                      const item = getCellItem(items, day, hour)
                      const dragging = isInDrag(day, hour)
                      
                      let cellClass = ''
                      if (item?.type === 'BLOCK') cellClass = 'bg-red-500/15 border-l-4 border-red-500'
                      else if (item?.type === 'ADD') cellClass = 'bg-green-500/10 border-l-4 border-green-500'
                      else if (item?.type === 'RULE') cellClass = 'bg-primary/5 border-l-4 border-primary/30'

                      return (
                        <td key={idx} className={cn('border-b border-r relative transition-all', isCompact ? 'h-10' : 'h-14', cellClass, dragging && '!bg-primary/10 !border-primary/40', !readOnly && viewMode === 'SINGLE_WEEK' && !item && 'hover:bg-muted/50 cursor-crosshair')} onPointerDown={() => handlePointerDown(day, hour)} onPointerEnter={() => handlePointerEnter(day, hour)} onMouseOver={(e) => handleCellHover(e, day, hour)} onMouseLeave={() => setHoverTooltip(null)} onContextMenu={(e) => handleContextMenu(e, day, hour)}>
                           {item && hour === parseInt(item.start) && (
                              <div className={cn("absolute inset-x-2 z-10 bg-background shadow-lg border border-border/50 font-black truncate flex items-center gap-2", isCompact ? 'top-0.5 px-1 py-0.5 text-[8px] rounded' : 'top-1.5 px-2 py-1.5 text-[9px] rounded-lg')}>
                                 {item.type === 'BLOCK' ? '🔴' : item.type === 'ADD' ? '🟢' : '🔵'}
                                 <span className="uppercase tracking-tight opacity-70">{item.reason || item.type}</span>
                              </div>
                           )}
                        </td>
                      )
                   })}
                </tr>
              ))}
           </tbody>
        </table>

        {/* Status Popup Upgrade */}
        {popup && (
          <div className="absolute z-[100] bg-background border border-border shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)] rounded-[32px] p-5 w-[280px] animate-in zoom-in-95 ease-out duration-200" style={{ left: popup.x, top: popup.y }}>
             <div className="flex justify-between items-start mb-4">
                <div className="space-y-1">
                   <div className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">CẬP NHẬT LỊCH</div>
                   <div className="text-sm font-black tracking-tighter">
                      {format(popup.startDay, 'dd/MM')} {!isSameDay(popup.startDay, popup.endDay) && `- ${format(popup.endDay, 'dd/MM')}`}
                      <span className="text-muted-foreground font-normal ml-2">{popup.startHour}:00 - {popup.endHour+1}:00</span>
                   </div>
                </div>
                <button onClick={() => setPopup(null)} className="p-1.5 hover:bg-muted rounded-full transition-all"><X className="h-5 w-5" /></button>
             </div>

             <div className="space-y-4">
                <div className="space-y-1.5">
                   <div className="text-[9px] font-black text-muted-foreground uppercase pl-1">PRESETS</div>
                   <div className="grid grid-cols-2 gap-1.5">
                      {PRESETS.map(p => (
                        <button key={p.label} onClick={() => applyStatusRange('ADD', p)} className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/50 hover:bg-primary/10 hover:text-primary text-[10px] font-black transition-all text-left leading-none">
                           <span>{p.icon}</span> <span>{p.label.split(' ')[0]}</span>
                        </button>
                      ))}
                   </div>
                </div>

                <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
                   <button onClick={() => applyStatusRange('BLOCK')} className="w-full flex items-center gap-3 px-5 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-xs font-black shadow-xl shadow-red-500/20 transition-all active:scale-95">
                      🔴 BẬN / KHÔNG ONLINE
                   </button>
                   <button onClick={() => applyStatusRange('ADD')} className="w-full flex items-center gap-3 px-5 py-3 rounded-2xl bg-green-600 hover:bg-green-700 text-white text-xs font-black shadow-xl shadow-green-500/20 transition-all active:scale-95">
                      🟢 SẴN SÀNG / ĐI LÀM
                   </button>
                   <button onClick={handleClearRange} className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl text-[10px] font-black text-red-500 hover:bg-red-50 transition-all">
                      <Trash2 className="h-4 w-4" /> XÓA LỊCH
                   </button>
                </div>
             </div>
          </div>
        )}
      </div>

      {/* Hover Tooltip cho Team View */}
      {hoverTooltip && viewMode === 'TEAM_DAY' && !popup && (
        <div 
          className="absolute z-[120] bg-background border border-border shadow-xl rounded-xl p-3 w-48 pointer-events-none animate-in fade-in duration-100"
          style={{ left: hoverTooltip.x, top: hoverTooltip.y }}
        >
          <div className="text-[10px] font-black text-muted-foreground uppercase mb-2">
            {format(hoverTooltip.day, 'dd/MM')} @ {hoverTooltip.hour}:00
          </div>
          <div className="flex justify-between text-xs font-bold mb-1">
            <span className="text-green-600">Sẵn sàng: {hoverTooltip.stats.free}</span>
            <span className="text-red-500">Bận: {hoverTooltip.stats.busy}</span>
          </div>
          <div className="text-xs font-bold text-muted-foreground mb-2">
            Chưa rõ: {hoverTooltip.stats.tentative}
          </div>
          
          {hoverTooltip.stats.busyUsers.length > 0 && (
            <div className="pt-2 border-t border-border/50">
              <div className="text-[9px] font-black text-muted-foreground/70 uppercase mb-1">Đang bận:</div>
              <ul className="text-[10px] font-bold text-foreground space-y-0.5">
                {hoverTooltip.stats.busyUsers.map((name, i) => (
                  <li key={i} className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-red-500"/> {name}</li>
                ))}
                {hoverTooltip.stats.busy > 5 && <li><span className="text-muted-foreground">+{hoverTooltip.stats.busy - 5} người khác</span></li>}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-center p-2 bg-primary/5 border border-primary/20 rounded-2xl">
         <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-primary/60">
            <Info className="h-5 w-5" />
            <span>TIPS: Kéo từ T2-T6 để áp dụng hàng loạt | Chuột phải để xóa nhanh | Bật "Theo Nhóm" để xem ai đang rảnh</span>
         </div>
      </div>
    </div>
  )
}
