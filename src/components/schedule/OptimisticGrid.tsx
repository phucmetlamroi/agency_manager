'use client'

import React, { useTransition, useRef, useState, useOptimistic, useCallback } from 'react'
import { format, addHours, startOfDay, isSameMinute, parseISO } from 'date-fns'
import { createScheduleException } from '@/actions/schedule-actions'
import { DndContext, useSensor, useSensors, PointerSensor } from '@dnd-kit/core'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export type ScheduleItem = {
  id: string
  start: string // HH:mm
  end: string   // HH:mm
  reason: string | null
  type: 'RULE' | 'BLOCK' | 'ADD'
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
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8) // 8:00 to 22:00

export function OptimisticGrid({ workspaceId, profileId, date, users }: OptimisticGridProps) {
  const [isPending, startTransition] = useTransition()
  
  // Optimistic state updates
  const [optimisticUsers, addOptimisticException] = useOptimistic(
    users,
    (state, newException: { userId: string, start: string, end: string, type: 'BLOCK'|'ADD', reason?: string }) => {
      return state.map(user => {
        if (user.id === newException.userId) {
          return {
            ...user,
            items: [...user.items, {
              id: Math.random().toString(), // temp ID
              start: newException.start,
              end: newException.end,
              type: newException.type,
              reason: newException.reason || null
            }]
          }
        }
        return user
      })
    }
  )

  const [selection, setSelection] = useState<{ userId: string, startHour: number, endHour: number } | null>(null)
  const isDragging = useRef(false)
  const startSelection = useRef<{ userId: string, hour: number } | null>(null)

  const handlePointerDown = (userId: string, hour: number) => {
    isDragging.current = true
    startSelection.current = { userId, hour }
    setSelection({ userId, startHour: hour, endHour: hour })
  }

  const handlePointerEnter = (userId: string, hour: number) => {
    if (!isDragging.current || !startSelection.current) return
    if (startSelection.current.userId !== userId) return // restrict to single row
    
    const startHour = Math.min(startSelection.current.hour, hour)
    const endHour = Math.max(startSelection.current.hour, hour)
    setSelection({ userId, startHour, endHour })
  }

  const handlePointerUp = () => {
    if (!isDragging.current || !selection) return
    
    isDragging.current = false
    const finalSelection = { ...selection }
    setSelection(null)
    startSelection.current = null

    // Fire Server Action using drag selection
    handleAction(finalSelection)
  }

  const handleAction = (sel: { userId: string, startHour: number, endHour: number }) => {
    const startStr = `${sel.startHour.toString().padStart(2, '0')}:00`
    const endStr = `${(sel.endHour + 1).toString().padStart(2, '0')}:00`
    
    // We assume dragging creates a BLOCK (e.g., admin marks user as busy)
    startTransition(async () => {
      addOptimisticException({ userId: sel.userId, start: startStr, end: endStr, type: 'BLOCK', reason: 'Admin override' })
      try {
        await createScheduleException(
          workspaceId,
          profileId,
          sel.userId,
          date,
          startStr,
          endStr,
          'BLOCK',
          'Admin override',
          'Asia/Ho_Chi_Minh'
        )
        toast.success("Đã đánh dấu lịch thành công")
      } catch (e: any) {
        toast.error("Lỗi khi cập nhật lịch: " + e.message)
      }
    })
  }

  // Render a cell for a specific hour
  const renderCell = (user: GridUser, hour: number) => {
    // Determine if this cell falls into any existing items
    const hourStr = `${hour.toString().padStart(2, '0')}:00`
    
    // Simplistic check for overlapping hour blocks (assumes exact hour matching for simplicity in this artifact)
    const matchingItems = user.items.filter(item => {
      const sH = parseInt(item.start.split(':')[0])
      const eH = parseInt(item.end.split(':')[0])
      return hour >= sH && hour < eH
    })

    const isRule = matchingItems.some(i => i.type === 'RULE')
    const isBlock = matchingItems.some(i => i.type === 'BLOCK')
    const isAdd = matchingItems.some(i => i.type === 'ADD')

    let bgColor = "bg-background"
    if (isBlock) bgColor = "bg-red-500/20 border-red-500/50"
    else if (isAdd) bgColor = "bg-green-500/20 border-green-500/50"
    else if (isRule) bgColor = "bg-primary/10 border-primary/20"

    const isSelected = selection && selection.userId === user.id && hour >= selection.startHour && hour <= selection.endHour

    return (
      <div 
        key={hour}
        className={cn(
          "w-20 min-w-20 pl-2 border-r  h-12 flex items-center justify-center transition-colors cursor-crosshair select-none relative",
          bgColor,
          isSelected ? "bg-blue-500/40" : ""
        )}
        onPointerDown={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); handlePointerDown(user.id, hour) }}
        onPointerEnter={() => handlePointerEnter(user.id, hour)}
      >
         {/* Optional: Add content inside blocks */}
      </div>
    )
  }

  return (
    <div 
      className="max-w-full overflow-x-auto overflow-y-auto border border-border/50 rounded-lg shadow-sm"
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{ maxHeight: '70vh' }}
    >
      <table className="w-full border-collapse relative">
        <thead className="sticky top-0 z-20 bg-background/95 backdrop-blur shadow-sm">
          <tr>
            <th className="sticky left-0 min-w-40 w-40 z-30 bg-background/95 border-b border-r px-4 py-3 text-left text-sm font-semibold text-muted-foreground">
              Nhân sự
            </th>
            {HOURS.map(hour => (
              <th key={hour} className="min-w-20 w-20 border-b border-r px-2 py-3 text-center text-xs font-medium text-muted-foreground whitespace-nowrap">
                {`${hour.toString().padStart(2, '0')}:00`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {optimisticUsers.map(user => (
            <tr key={user.id} className="group hover:bg-muted/30 transition-colors">
              <td className="sticky left-0 min-w-40 w-40 z-10 bg-background/95 border-b border-r px-4 py-3 text-sm font-medium">
                {user.name}
              </td>
              {HOURS.map(hour => (
                <td key={hour} className="border-b p-0">
                  {renderCell(user, hour)}
                </td>
              ))}
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={HOURS.length + 1} className="p-8 text-center text-muted-foreground">
                Không tìm thấy nhân sự phù hợp
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
