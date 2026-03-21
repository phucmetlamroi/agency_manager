'use client'

import React, { useTransition, useRef, useState, useOptimistic, useCallback } from 'react'
import { format, addDays, startOfWeek, addWeeks, subWeeks, isSameDay } from 'date-fns'
import { vi } from 'date-fns/locale'
import {
  createScheduleException,
  deleteScheduleExceptionsByIds,
  deleteScheduleExceptionsForDay
} from '@/actions/schedule-actions'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, CalendarDays, Users, Trash2, X } from 'lucide-react'
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
  dateStr: string   // "YYYY-MM-DD" — timezone-safe
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

// Optimistic reducer handles add AND remove
type OptAction =
  | { op: 'ADD';       item: ScheduleItem }
  | { op: 'REMOVE';    ids: string[] }
  | { op: 'CLEAR_DAY'; dateStr: string }

function scheduleReducer(state: ScheduleItem[], action: OptAction): ScheduleItem[] {
  switch (action.op) {
    case 'ADD':
      return [...state, action.item]
    case 'REMOVE':
      return state.filter(it => !action.ids.includes(it.id))
    case 'CLEAR_DAY':
      return state.filter(it => {
        if (!it.date) return true
        return format(it.date, 'yyyy-MM-dd') !== action.dateStr
      })
    default:
      return state
  }
}

// ─── Status options (popup) ──────────────────────────────────────────────────

const STATUS_OPTIONS = [
  {
    type: 'BLOCK' as const,
    label: 'Bận / Không thể nhận',
    emoji: '🔴',
    color: 'bg-red-500 hover:bg-red-600 text-white',
    bgCell: 'bg-red-500/20'
  },
  {
    type: 'ADD' as const,
    label: 'Sẵn sàng / Online',
    emoji: '🟢',
    color: 'bg-green-600 hover:bg-green-700 text-white',
    bgCell: 'bg-green-500/15'
  },
]

type Popup = { day: Date; startHour: number; endHour: number; x: number; y: number } | null
type DragSel = { day: Date; startHour: number; endHour: number } | null
type ConfirmClearDay = { day: Date; dateStr: string } | null

// ─── Component ───────────────────────────────────────────────────────────────

export function OptimisticGrid({
  workspaceId, profileId, dateStr, users, readOnly = false
}: OptimisticGridProps) {
  // Parse dateStr as LOCAL midnight (split to avoid UTC parse bug)
  const [y, m, d] = dateStr.split('-').map(Number)
  const parsedDate = new Date(y, m - 1, d)

  const [weekBase, setWeekBase] = useState(parsedDate)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(users[0]?.id ?? null)
  const [isPending, startTransition] = useTransition()

  const weekDays = getWeekDays(weekBase)
  const selectedUser = users.find(u => u.id === selectedUserId) ?? users[0]

  // Unified optimistic state: handles ADD, REMOVE, CLEAR_DAY
  const [optimisticItems, dispatch] = useOptimistic(
    selectedUser?.items ?? [],
    scheduleReducer
  )

  // Drag state
  const isDragging = useRef(false)
  const [dragSel, setDragSel] = useState<DragSel>(null)
  const dragStart = useRef<{ day: Date; hour: number } | null>(null)

  // Popup & confirmation
  const [popup, setPopup] = useState<Popup>(null)
  const [confirmClearDay, setConfirmClearDay] = useState<ConfirmClearDay>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // ─── Cell helpers ─────────────────────────────────────────────────────────

  const getCellItem = useCallback((day: Date, hour: number): ScheduleItem | null => {
    const dayItems = optimisticItems.filter(it => it.date && isSameDay(it.date, day))
    return dayItems.find(it => {
      const sH = parseInt(it.start)
      const eH = parseInt(it.end)
      return hour >= sH && hour < eH
    }) ?? null
  }, [optimisticItems])

  const getItemsForDay = useCallback((day: Date): ScheduleItem[] => {
    return optimisticItems.filter(it => it.date && isSameDay(it.date, day) && it.type !== 'RULE')
  }, [optimisticItems])

  const isInDrag = (day: Date, hour: number) =>
    !!(dragSel && isSameDay(dragSel.day, day) && hour >= dragSel.startHour && hour <= dragSel.endHour)

  // ─── Drag handlers ────────────────────────────────────────────────────────

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
    setDragSel({
      day,
      startHour: Math.min(dragStart.current.hour, hour),
      endHour: Math.max(dragStart.current.hour, hour)
    })
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (readOnly || !isDragging.current || !dragSel) { isDragging.current = false; return }
    isDragging.current = false
    dragStart.current = null

    const rect = gridRef.current?.getBoundingClientRect()
    const x = rect ? Math.min(e.clientX - rect.left, rect.width - 250) : e.clientX
    const y = rect ? e.clientY - rect.top + 12 : e.clientY

    setPopup({ day: dragSel.day, startHour: dragSel.startHour, endHour: dragSel.endHour, x: Math.max(0, x), y })
    setDragSel(null)
  }

  // ─── Apply status from popup ──────────────────────────────────────────────

  const handleSelectStatus = (type: 'BLOCK' | 'ADD') => {
    if (!popup || !selectedUser) return
    const { day, startHour, endHour } = popup
    const startStr = `${startHour.toString().padStart(2, '0')}:00`
    const endStr   = `${(endHour + 1).toString().padStart(2, '0')}:00`
    const label    = type === 'BLOCK' ? 'Bận / Khóa' : 'Sẵn sàng'
    const dayStr   = format(day, 'yyyy-MM-dd')  // local date parts, timezone-safe
    setPopup(null)

    startTransition(async () => {
      dispatch({ op: 'ADD', item: { id: `opt-${Math.random()}`, start: startStr, end: endStr, type, reason: label, date: day } })
      try {
        await createScheduleException(workspaceId, profileId, selectedUser.id, dayStr, startStr, endStr, type, label)
        toast.success(`${format(day, 'EEE dd/MM', { locale: vi })} ${startStr}–${endStr} → ${label}`)
      } catch (err: any) {
        toast.error('Lỗi lưu lịch: ' + err.message)
      }
    })
  }

  // ─── Clear range from popup ───────────────────────────────────────────────

  const handleClearRange = () => {
    if (!popup || !selectedUser) return
    const { day, startHour, endHour } = popup
    setPopup(null)

    // Find real Exception IDs that overlap this range (only BLOCK/ADD, not RULE)
    const overlapping = (selectedUser.items).filter(it => {
      if (it.type === 'RULE' || !it.date || !isSameDay(it.date, day)) return false
      const sH = parseInt(it.start)
      const eH = parseInt(it.end)
      // Overlap: item starts before endHour+1 AND item ends after startHour
      return sH <= endHour && eH > startHour
    })
    if (!overlapping.length) { toast('Không có trạng thái nào để xóa trong vùng này'); return }

    const ids = overlapping.map(it => it.id)

    startTransition(async () => {
      dispatch({ op: 'REMOVE', ids })
      try {
        await deleteScheduleExceptionsByIds(workspaceId, profileId, ids)
        toast.success(`Đã xóa ${ids.length} mục trong ${format(day, 'EEE dd/MM', { locale: vi })}`)
      } catch (err: any) {
        toast.error('Lỗi xóa lịch: ' + err.message)
      }
    })
  }

  // ─── Right-click single cell: instant clear ───────────────────────────────

  const handleContextMenu = (e: React.MouseEvent, day: Date, hour: number) => {
    if (readOnly) return
    e.preventDefault()
    const item = getCellItem(day, hour)
    if (!item || item.type === 'RULE') {
      toast('Ô này không có trạng thái ngoại lệ để xóa')
      return
    }
    startTransition(async () => {
      dispatch({ op: 'REMOVE', ids: [item.id] })
      try {
        await deleteScheduleExceptionsByIds(workspaceId, profileId, [item.id])
        toast.success(`Đã xóa trạng thái ${format(day, 'dd/MM')} ${hour.toString().padStart(2,'0')}:00`)
      } catch (err: any) {
        toast.error('Lỗi: ' + err.message)
      }
    })
  }

  // ─── Clear entire day ─────────────────────────────────────────────────────

  const handleClearDay = (day: Date) => {
    if (!selectedUser) return
    const dayStr = format(day, 'yyyy-MM-dd')
    setConfirmClearDay({ day, dateStr: dayStr })
  }

  const confirmClearDayAction = () => {
    if (!confirmClearDay || !selectedUser) return
    const { day, dateStr } = confirmClearDay
    setConfirmClearDay(null)

    startTransition(async () => {
      dispatch({ op: 'CLEAR_DAY', dateStr })
      try {
        const res = await deleteScheduleExceptionsForDay(workspaceId, profileId, selectedUser.id, dateStr)
        toast.success(`Đã xóa ${res.deleted} mục lịch ngày ${format(day, 'dd/MM')}`)
      } catch (err: any) {
        toast.error('Lỗi: ' + err.message)
      }
    })
  }

  const closePopup = () => { setPopup(null); setDragSel(null); isDragging.current = false; dragStart.current = null }

  // ─── Week info ────────────────────────────────────────────────────────────

  const monthLabel = format(weekDays[0], 'MMMM yyyy', { locale: vi })

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">

      {/* ── TOOLBAR ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Staff selector */}
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium text-muted-foreground">Nhân sự:</span>
          <select
            value={selectedUserId ?? ''}
            onChange={e => setSelectedUserId(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
          >
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          {readOnly && (
            <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              👁 Chỉ xem
            </span>
          )}
        </div>

        {/* Week nav */}
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekBase(w => subWeeks(w, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium px-2 text-center min-w-[160px]">
            <div className="font-bold capitalize">{monthLabel}</div>
            <div className="text-xs text-muted-foreground">{format(weekDays[0], 'dd/MM')} – {format(weekDays[6], 'dd/MM')}</div>
          </div>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekBase(w => addWeeks(w, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setWeekBase(new Date())}>Hôm nay</Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-primary/25 border border-primary/40 inline-block" /> Lịch cố định</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500/30 border border-red-500/50 inline-block" /> Bận</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-500/25 border border-green-500/40 inline-block" /> Sẵn sàng</span>
        {!readOnly && (
          <span className="ml-auto text-[10px] italic text-muted-foreground/70">
            💡 Kéo rê → chọn trạng thái &nbsp;|&nbsp; Chuột phải → xóa nhanh &nbsp;|&nbsp; 🗑️ → xóa cả ngày
          </span>
        )}
      </div>

      {/* ── GRID ── */}
      <div
        ref={gridRef}
        className="relative border border-border/50 rounded-xl overflow-auto shadow-sm select-none"
        style={{ maxHeight: '72vh' }}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          if (isDragging.current) { isDragging.current = false; setDragSel(null); dragStart.current = null }
        }}
      >
        <table className="w-full border-collapse" style={{ minWidth: 700 }}>
          {/* HEADER */}
          <thead className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm">
            <tr>
              <th className="sticky left-0 z-30 bg-background/95 border-b border-r w-16 min-w-16 px-2 py-2 text-xs text-muted-foreground font-medium">
                Giờ
              </th>
              {weekDays.map((day, i) => {
                const isToday = isSameDay(day, new Date())
                const hasItems = !readOnly && getItemsForDay(day).length > 0
                return (
                  <th key={i} className={cn('border-b border-r px-1 py-2 text-center min-w-[105px]', isToday && 'bg-primary/10')}>
                    <div className={cn('text-[11px] font-semibold', isToday ? 'text-primary' : 'text-muted-foreground')}>
                      {DAY_NAMES[day.getDay()]}
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      <span className={cn('text-sm font-bold', isToday ? 'text-primary' : 'text-foreground')}>
                        {format(day, 'dd/MM')}
                      </span>
                      {!readOnly && (
                        <button
                          onClick={() => handleClearDay(day)}
                          title={`Xóa tất cả lịch ngày ${format(day, 'dd/MM')}`}
                          className={cn(
                            'p-0.5 rounded transition-all',
                            hasItems
                              ? 'text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-100'
                              : 'text-muted-foreground/30 hover:text-muted-foreground/60 hover:bg-muted/50 opacity-60'
                          )}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>

          {/* BODY */}
          <tbody>
            {HOURS.map(hour => (
              <tr key={hour}>
                {/* Hour label */}
                <td className="sticky left-0 z-10 bg-background/95 border-b border-r px-2 py-0 text-xs text-muted-foreground font-mono text-right pr-3 h-12 align-top pt-1.5">
                  {`${hour.toString().padStart(2, '0')}:00`}
                </td>

                {/* Day cells */}
                {weekDays.map((day, dayIdx) => {
                  const cellItem   = getCellItem(day, hour)
                  const isToday    = isSameDay(day, new Date())
                  const dragging   = isInDrag(day, hour)
                  const isFirstRow = cellItem && hour === parseInt(cellItem.start)

                  let cellClass = isToday ? 'bg-primary/5' : ''
                  if (cellItem?.type === 'BLOCK') cellClass = 'bg-red-500/20'
                  else if (cellItem?.type === 'ADD') cellClass = 'bg-green-500/15'
                  else if (cellItem?.type === 'RULE') cellClass = 'bg-primary/10'

                  return (
                    <td
                      key={dayIdx}
                      className={cn(
                        'border-b border-r h-12 transition-colors p-0 relative',
                        readOnly ? 'cursor-default' : (cellItem && cellItem.type !== 'RULE' ? 'cursor-pointer' : 'cursor-crosshair'),
                        cellClass,
                        dragging && '!bg-blue-400/40 !border-blue-400/60',
                        !readOnly && !dragging && !cellItem && 'hover:bg-muted/30',
                        !readOnly && cellItem && cellItem.type !== 'RULE' && 'hover:brightness-90'
                      )}
                      onPointerDown={e => {
                        if (readOnly) return
                        e.currentTarget.releasePointerCapture(e.pointerId)
                        handlePointerDown(day, hour)
                      }}
                      onPointerEnter={() => !readOnly && handlePointerEnter(day, hour)}
                      onContextMenu={e => handleContextMenu(e, day, hour)}
                    >
                      {/* Status label — only on first row of the block */}
                      {isFirstRow && (
                        <div className="absolute inset-x-1 top-0.5 text-[9px] font-semibold truncate px-1 leading-tight pointer-events-none">
                          {cellItem.type === 'BLOCK' ? '🔴' : cellItem.type === 'ADD' ? '🟢' : '🔵'} {cellItem.reason ?? cellItem.type}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── STATUS POPUP ── */}
        {popup && !readOnly && (
          <div
            className="absolute z-50 bg-popover border border-border rounded-xl shadow-2xl p-3.5 w-60 animate-in fade-in zoom-in-95 duration-150"
            style={{ left: popup.x, top: popup.y }}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-2.5 gap-2">
              <div className="text-xs font-bold text-foreground leading-tight">
                <div>{format(popup.day, 'EEEE dd/MM/yyyy', { locale: vi })}</div>
                <div className="text-muted-foreground font-normal mt-0.5">
                  {popup.startHour.toString().padStart(2,'0')}:00 – {(popup.endHour + 1).toString().padStart(2,'0')}:00
                </div>
              </div>
              <button onClick={closePopup} className="text-muted-foreground hover:text-foreground mt-0.5 shrink-0">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <p className="text-[10px] text-muted-foreground mb-2.5 font-medium uppercase tracking-wider">Chọn trạng thái:</p>

            <div className="flex flex-col gap-1.5">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.type}
                  onClick={() => handleSelectStatus(opt.type)}
                  className={cn('flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-bold transition-all active:scale-95', opt.color)}
                >
                  <span className="text-sm">{opt.emoji}</span>
                  <span>{opt.label}</span>
                </button>
              ))}

              {/* Clear / Delete option */}
              <button
                onClick={handleClearRange}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800 transition-all active:scale-95"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Xóa trạng thái / Trống</span>
              </button>

              <button
                onClick={closePopup}
                className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-[11px] text-muted-foreground hover:bg-muted transition-all mt-0.5"
              >
                <X className="h-3 w-3" />
                <span>Hủy</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── CONFIRM CLEAR DAY DIALOG ── */}
      {confirmClearDay && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-background border border-border rounded-2xl shadow-2xl p-6 w-80 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <div className="font-bold text-foreground">Xóa toàn bộ lịch?</div>
                <div className="text-sm text-muted-foreground">
                  Ngày {format(confirmClearDay.day, 'EEEE dd/MM/yyyy', { locale: vi })}
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Tất cả trạng thái Bận / Sẵn sàng trong ngày này sẽ bị xóa vĩnh viễn. Lịch cố định (định kỳ) sẽ được giữ nguyên.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmClearDay(null)}
                className="flex-1 px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-all"
              >
                Hủy
              </button>
              <button
                onClick={confirmClearDayAction}
                className="flex-1 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-all active:scale-95"
              >
                Xóa tất cả
              </button>
            </div>
          </div>
        </div>
      )}

      {isPending && (
        <div className="text-xs text-muted-foreground animate-pulse text-center">Đang lưu...</div>
      )}
    </div>
  )
}
