'use client'

import React, { useTransition, useRef, useState, useOptimistic } from 'react'
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addWeeks, subWeeks, parseISO, startOfMonth, getWeeksInMonth, eachWeekOfInterval, endOfMonth } from 'date-fns'
import { vi } from 'date-fns/locale'
import { createScheduleException } from '@/actions/schedule-actions'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, CalendarDays, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type ScheduleItem = {
  id: string
  start: string // HH:mm
  end: string   // HH:mm
  reason: string | null
  type: 'RULE' | 'BLOCK' | 'ADD'
  date?: Date   // which day this item is for (for multi-day grids)
}

export type GridUser = {
  id: string
  name: string
  items: ScheduleItem[] // items now have a .date field too
}

interface OptimisticGridProps {
  workspaceId: string
  profileId?: string
  date: Date           // starting reference date (today or selected)
  users: GridUser[]
  readOnly?: boolean   // admin view: no drag, just observe
}

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7) // 07:00 to 22:00

const DAY_NAMES = ['CN', 'Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7']

function getWeekDays(baseDate: Date): Date[] {
  const start = startOfWeek(baseDate, { weekStartsOn: 1 }) // Monday first
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

type Selection = { day: Date; startHour: number; endHour: number } | null

export function OptimisticGrid({ workspaceId, profileId, date, users, readOnly = false }: OptimisticGridProps) {
  const [weekBase, setWeekBase] = useState(date)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(users[0]?.id ?? null)
  const [isPending, startTransition] = useTransition()

  const weekDays = getWeekDays(weekBase)
  const selectedUser = users.find(u => u.id === selectedUserId) ?? users[0]

  // Optimistic state
  const [optimisticItems, addOptimisticItem] = useOptimistic(
    selectedUser?.items ?? [],
    (state, newItem: ScheduleItem) => [...state, newItem]
  )

  // Drag selection
  const isDragging = useRef(false)
  const [selection, setSelection] = useState<Selection>(null)
  const dragStart = useRef<{ day: Date; hour: number } | null>(null)

  const handlePointerDown = (day: Date, hour: number) => {
    if (readOnly) return
    isDragging.current = true
    dragStart.current = { day, hour }
    setSelection({ day, startHour: hour, endHour: hour })
  }

  const handlePointerEnter = (day: Date, hour: number) => {
    if (readOnly) return
    if (!isDragging.current || !dragStart.current) return
    if (!isSameDay(day, dragStart.current.day)) return
    const startHour = Math.min(dragStart.current.hour, hour)
    const endHour = Math.max(dragStart.current.hour, hour)
    setSelection({ day, startHour, endHour })
  }

  const handlePointerUp = () => {
    if (readOnly) return
    if (!isDragging.current || !selection || !selectedUser) return
    isDragging.current = false
    const finalSel = { ...selection }
    setSelection(null)
    dragStart.current = null

    const startStr = `${finalSel.startHour.toString().padStart(2, '0')}:00`
    const endStr = `${(finalSel.endHour + 1).toString().padStart(2, '0')}:00`

    startTransition(async () => {
      addOptimisticItem({
        id: Math.random().toString(),
        start: startStr,
        end: endStr,
        type: 'BLOCK',
        reason: 'Admin đánh dấu bận',
        date: finalSel.day
      })
      try {
        await createScheduleException(workspaceId, profileId, selectedUser.id, finalSel.day, startStr, endStr, 'BLOCK', 'Admin đánh dấu bận', 'Asia/Ho_Chi_Minh')
        toast.success(`Đã đánh dấu ${format(finalSel.day, 'dd/MM')} ${startStr}–${endStr} là bận`)
      } catch (e: any) {
        toast.error('Lỗi cập nhật lịch: ' + e.message)
      }
    })
  }

  // --- Cell status for a given (day, hour) ---
  const getCellStatus = (day: Date, hour: number) => {
    if (!selectedUser) return null
    const itemsForDay = optimisticItems.filter(it => {
      if (!it.date) return false
      return isSameDay(it.date, day)
    })
    const active = itemsForDay.find(it => {
      const sH = parseInt(it.start.split(':')[0])
      const eH = parseInt(it.end.split(':')[0])
      return hour >= sH && hour < eH
    })
    return active ?? null
  }

  // --- Week navigation months ---
  const monthLabel = format(weekDays[0], 'MMMM yyyy', { locale: vi })
  const weekStart = format(weekDays[0], 'dd/MM')
  const weekEnd = format(weekDays[6], 'dd/MM')

  return (
    <div className="space-y-4">
      {/* ─── TOOLBAR ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Staff Dropdown Selector */}
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
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-primary/25 border border-primary/40 inline-block" /> Lịch cố định</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500/30 border border-red-500/50 inline-block" /> Bận / Khóa</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-500/25 border border-green-500/40 inline-block" /> Làm thêm</span>
        {!readOnly && (
          <span className="flex items-center gap-1.5 ml-auto italic">💡 Kéo rê để đánh dấu bận</span>
        )}
      </div>

      {/* ─── GRID ─── */}
      <div
        className="relative border border-border/50 rounded-xl overflow-auto shadow-sm select-none"
        style={{ maxHeight: '72vh' }}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <table className="w-full border-collapse" style={{ minWidth: 680 }}>
          {/* HEADER ROW: Day columns */}
          <thead className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm">
            <tr>
              {/* Corner cell */}
              <th className="sticky left-0 z-30 bg-background/95 border-b border-r w-16 min-w-16 px-2 py-3 text-xs text-muted-foreground font-medium">
                Giờ
              </th>
              {weekDays.map((day, i) => {
                const isToday = isSameDay(day, new Date())
                return (
                  <th key={i} className={cn(
                    'border-b border-r px-2 py-3 text-center min-w-[120px]',
                    isToday ? 'bg-primary/10' : ''
                  )}>
                    <div className={cn('text-xs font-semibold', isToday ? 'text-primary' : 'text-muted-foreground')}>
                      {DAY_NAMES[day.getDay()]}
                    </div>
                    <div className={cn(
                      'text-sm font-bold mt-0.5',
                      isToday ? 'text-primary' : 'text-foreground'
                    )}>
                      {format(day, 'dd/MM')}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>

          {/* BODY: Hour rows */}
          <tbody>
            {HOURS.map(hour => (
              <tr key={hour} className="group">
                {/* Hour label — sticky left */}
                <td className="sticky left-0 z-10 bg-background/95 border-b border-r px-2 py-0 text-xs text-muted-foreground font-mono text-right pr-3 h-12 align-top pt-1.5">
                  {`${hour.toString().padStart(2, '0')}:00`}
                </td>

                {/* Day cells */}
                {weekDays.map((day, dayIdx) => {
                  const cellStatus = getCellStatus(day, hour)
                  const isToday = isSameDay(day, new Date())
                  const isSelected = selection &&
                    isSameDay(selection.day, day) &&
                    hour >= selection.startHour &&
                    hour <= selection.endHour

                  let cellClass = 'bg-transparent'
                  if (cellStatus?.type === 'BLOCK') cellClass = 'bg-red-500/20 border-red-500/30'
                  else if (cellStatus?.type === 'ADD') cellClass = 'bg-green-500/15 border-green-500/30'
                  else if (cellStatus?.type === 'RULE') cellClass = 'bg-primary/10 border-primary/20'
                  if (isToday && !cellStatus) cellClass = 'bg-primary/5'

                  return (
                    <td
                      key={dayIdx}
                      className={cn(
                        'border-b border-r h-12 transition-colors p-0 relative',
                        readOnly ? 'cursor-default' : 'cursor-crosshair',
                        cellClass,
                        isSelected && !readOnly ? '!bg-blue-500/35 border-blue-400/50' : '',
                        !readOnly && 'hover:bg-muted/40'
                      )}
                      onPointerDown={e => {
                        if (readOnly) return
                        e.currentTarget.releasePointerCapture(e.pointerId)
                        handlePointerDown(day, hour)
                      }}
                      onPointerEnter={() => !readOnly && handlePointerEnter(day, hour)}
                    >
                      {cellStatus && hour === parseInt(cellStatus.start.split(':')[0]) && (
                        <div className="absolute inset-x-1 top-0.5 text-[9px] font-semibold truncate px-1 leading-tight">
                          {cellStatus.type === 'BLOCK' ? '🔴' : '🟢'} {cellStatus.reason ?? cellStatus.type}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isPending && (
        <div className="text-xs text-muted-foreground animate-pulse text-center">Đang lưu...</div>
      )}
    </div>
  )
}
