'use client'

import React, { useTransition, useRef, useState, useOptimistic } from 'react'
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addWeeks, subWeeks } from 'date-fns'
import { vi } from 'date-fns/locale'
import { createScheduleException } from '@/actions/schedule-actions'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, CalendarDays, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type ScheduleItem = {
  id: string
  start: string // HH:mm
  end: string   // HH:mm
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
  date: Date
  users: GridUser[]
  readOnly?: boolean
}

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7) // 07:00–22:00
const DAY_NAMES = ['CN', 'Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7']

function getWeekDays(baseDate: Date): Date[] {
  const start = startOfWeek(baseDate, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

type DragSel = { day: Date; startHour: number; endHour: number } | null

type Popup = {
  day: Date
  startHour: number
  endHour: number
  x: number
  y: number
} | null

const STATUS_OPTIONS = [
  { type: 'BLOCK' as const, label: 'Bận / Khóa', emoji: '🔴', color: 'bg-red-500 hover:bg-red-600 text-white' },
  { type: 'ADD' as const,   label: 'Làm thêm / Online', emoji: '🟢', color: 'bg-green-600 hover:bg-green-700 text-white' },
]

export function OptimisticGrid({ workspaceId, profileId, date, users, readOnly = false }: OptimisticGridProps) {
  const [weekBase, setWeekBase] = useState(date)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(users[0]?.id ?? null)
  const [isPending, startTransition] = useTransition()

  const weekDays = getWeekDays(weekBase)
  const selectedUser = users.find(u => u.id === selectedUserId) ?? users[0]

  const [optimisticItems, addOptimisticItem] = useOptimistic(
    selectedUser?.items ?? [],
    (state, newItem: ScheduleItem) => [...state, newItem]
  )

  // --- Drag state ---
  const isDragging = useRef(false)
  const [dragSel, setDragSel] = useState<DragSel>(null)
  const dragStart = useRef<{ day: Date; hour: number } | null>(null)

  // --- Popup state ---
  const [popup, setPopup] = useState<Popup>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const handlePointerDown = (day: Date, hour: number) => {
    if (readOnly) return
    isDragging.current = true
    dragStart.current = { day, hour }
    setDragSel({ day, startHour: hour, endHour: hour })
    setPopup(null)
  }

  const handlePointerEnter = (day: Date, hour: number) => {
    if (readOnly || !isDragging.current || !dragStart.current) return
    if (!isSameDay(day, dragStart.current.day)) return
    const startHour = Math.min(dragStart.current.hour, hour)
    const endHour = Math.max(dragStart.current.hour, hour)
    setDragSel({ day, startHour, endHour })
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (readOnly || !isDragging.current || !dragSel) return
    isDragging.current = false

    // Calculate popup position relative to the grid container
    const rect = gridRef.current?.getBoundingClientRect()
    const x = rect ? Math.min(e.clientX - rect.left, (rect.width - 240)) : e.clientX
    const y = rect ? e.clientY - rect.top + 12 : e.clientY

    setPopup({
      day: dragSel.day,
      startHour: dragSel.startHour,
      endHour: dragSel.endHour,
      x: Math.max(0, x),
      y
    })
    setDragSel(null)
    dragStart.current = null
  }

  const handleSelectStatus = (type: 'BLOCK' | 'ADD') => {
    if (!popup || !selectedUser) return
    const { day, startHour, endHour } = popup
    const startStr = `${startHour.toString().padStart(2, '0')}:00`
    const endStr = `${(endHour + 1).toString().padStart(2, '0')}:00`
    const label = type === 'BLOCK' ? 'Bận / Khóa' : 'Làm thêm'
    setPopup(null)

    startTransition(async () => {
      addOptimisticItem({
        id: Math.random().toString(),
        start: startStr,
        end: endStr,
        type,
        reason: label,
        date: day
      })
      try {
        await createScheduleException(
          workspaceId, profileId, selectedUser.id,
          day, startStr, endStr, type, label, 'Asia/Ho_Chi_Minh'
        )
        toast.success(`${format(day, 'dd/MM')} ${startStr}–${endStr} → ${label}`)
      } catch (e: any) {
        toast.error('Lỗi cập nhật lịch: ' + e.message)
      }
    })
  }

  const handleClearPopup = () => {
    setPopup(null)
    setDragSel(null)
    isDragging.current = false
    dragStart.current = null
  }

  // --- Cell helpers ---
  const getCellStatus = (day: Date, hour: number) => {
    if (!selectedUser) return null
    const dayItems = optimisticItems.filter(it => it.date && isSameDay(it.date, day))
    return dayItems.find(it => {
      const sH = parseInt(it.start.split(':')[0])
      const eH = parseInt(it.end.split(':')[0])
      return hour >= sH && hour < eH
    }) ?? null
  }

  const isInDrag = (day: Date, hour: number) =>
    !!(dragSel && isSameDay(dragSel.day, day) && hour >= dragSel.startHour && hour <= dragSel.endHour)

  const monthLabel = format(weekDays[0], 'MMMM yyyy', { locale: vi })
  const weekStart = format(weekDays[0], 'dd/MM')
  const weekEnd = format(weekDays[6], 'dd/MM')

  return (
    <div className="space-y-4">
      {/* ─── TOOLBAR ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Staff Dropdown */}
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Nhân sự:</span>
          <select
            value={selectedUserId ?? ''}
            onChange={e => setSelectedUserId(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
          >
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          {readOnly && (
            <span className="ml-2 px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1">
              👁 Chỉ xem
            </span>
          )}
        </div>

        {/* Week Navigation */}
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekBase(w => subWeeks(w, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium px-2 text-center min-w-[160px]">
            <div className="text-foreground font-bold capitalize">{monthLabel}</div>
            <div className="text-xs text-muted-foreground">{weekStart} – {weekEnd}</div>
          </div>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekBase(w => addWeeks(w, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setWeekBase(new Date())}>
            Hôm nay
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-primary/25 border border-primary/40 inline-block" /> Lịch cố định</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500/30 border border-red-500/50 inline-block" /> Bận / Khóa</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-500/25 border border-green-500/40 inline-block" /> Làm thêm</span>
        {!readOnly && (
          <span className="flex items-center gap-1.5 ml-auto italic text-muted-foreground/70">💡 Kéo rê → chọn trạng thái</span>
        )}
      </div>

      {/* ─── GRID (relative container for popup) ─── */}
      <div
        ref={gridRef}
        className="relative border border-border/50 rounded-xl overflow-auto shadow-sm select-none"
        style={{ maxHeight: '72vh' }}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => { if (isDragging.current) { isDragging.current = false; setDragSel(null); dragStart.current = null } }}
      >
        <table className="w-full border-collapse" style={{ minWidth: 680 }}>
          <thead className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm">
            <tr>
              <th className="sticky left-0 z-30 bg-background/95 border-b border-r w-16 min-w-16 px-2 py-3 text-xs text-muted-foreground font-medium">
                Giờ
              </th>
              {weekDays.map((day, i) => {
                const isToday = isSameDay(day, new Date())
                return (
                  <th key={i} className={cn('border-b border-r px-2 py-3 text-center min-w-[110px]', isToday && 'bg-primary/10')}>
                    <div className={cn('text-xs font-semibold', isToday ? 'text-primary' : 'text-muted-foreground')}>
                      {DAY_NAMES[day.getDay()]}
                    </div>
                    <div className={cn('text-sm font-bold mt-0.5', isToday ? 'text-primary' : 'text-foreground')}>
                      {format(day, 'dd/MM')}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {HOURS.map(hour => (
              <tr key={hour}>
                <td className="sticky left-0 z-10 bg-background/95 border-b border-r px-2 py-0 text-xs text-muted-foreground font-mono text-right pr-3 h-12 align-top pt-1.5">
                  {`${hour.toString().padStart(2, '0')}:00`}
                </td>
                {weekDays.map((day, dayIdx) => {
                  const cellStatus = getCellStatus(day, hour)
                  const isToday = isSameDay(day, new Date())
                  const dragging = isInDrag(day, hour)

                  let cellClass = isToday ? 'bg-primary/5' : 'bg-transparent'
                  if (cellStatus?.type === 'BLOCK') cellClass = 'bg-red-500/20'
                  else if (cellStatus?.type === 'ADD') cellClass = 'bg-green-500/15'
                  else if (cellStatus?.type === 'RULE') cellClass = 'bg-primary/10'

                  return (
                    <td
                      key={dayIdx}
                      className={cn(
                        'border-b border-r h-12 transition-colors p-0 relative',
                        readOnly ? 'cursor-default' : 'cursor-crosshair',
                        cellClass,
                        dragging && '!bg-blue-400/40 border-blue-400/60',
                        !readOnly && !dragging && 'hover:bg-muted/30'
                      )}
                      onPointerDown={e => {
                        if (readOnly) return
                        e.currentTarget.releasePointerCapture(e.pointerId)
                        handlePointerDown(day, hour)
                      }}
                      onPointerEnter={() => !readOnly && handlePointerEnter(day, hour)}
                    >
                      {cellStatus && hour === parseInt(cellStatus.start.split(':')[0]) && (
                        <div className="absolute inset-x-1 top-0.5 text-[9px] font-semibold truncate px-1 leading-tight pointer-events-none">
                          {cellStatus.type === 'BLOCK' ? '🔴' : cellStatus.type === 'ADD' ? '🟢' : '🔵'} {cellStatus.reason ?? cellStatus.type}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {/* ─── STATUS POPUP ─── */}
        {popup && !readOnly && (
          <div
            className="absolute z-50 bg-popover border border-border rounded-xl shadow-xl p-3 w-56 animate-in fade-in zoom-in-95 duration-150"
            style={{ left: popup.x, top: popup.y }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-foreground">
                {format(popup.day, 'EEEE dd/MM', { locale: vi })}
                <span className="ml-1 text-muted-foreground font-normal">
                  {popup.startHour.toString().padStart(2,'0')}:00 – {(popup.endHour + 1).toString().padStart(2,'0')}:00
                </span>
              </div>
              <button onClick={handleClearPopup} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <p className="text-[10px] text-muted-foreground mb-2">Chọn trạng thái cho khung giờ này:</p>

            <div className="flex flex-col gap-1.5">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.type}
                  onClick={() => handleSelectStatus(opt.type)}
                  className={cn('flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-bold transition-all active:scale-95', opt.color)}
                >
                  <span>{opt.emoji}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
              <button
                onClick={handleClearPopup}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-all"
              >
                <span>✕</span>
                <span>Hủy</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {isPending && (
        <div className="text-xs text-muted-foreground animate-pulse text-center">Đang lưu...</div>
      )}
    </div>
  )
}
