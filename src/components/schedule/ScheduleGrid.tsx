'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, addDays, startOfWeek, getHours, setHours, setMinutes, isSameDay, startOfDay } from 'date-fns'
import { vi } from 'date-fns/locale'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { toast } from 'sonner'
import { createUserSchedule, deleteUserSchedule, ScheduleType } from '@/actions/schedule-actions'

// CN Helper
function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs))
}

type ScheduleBlock = {
    id: string
    startTime: Date
    endTime: Date
    type: ScheduleType
    note?: string | null
}

type Props = {
    userId: string
    initialSchedule: ScheduleBlock[]
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8) // 8:00 - 22:00

export default function ScheduleGrid({ userId, initialSchedule }: Props) {
    const [schedules, setSchedules] = useState<ScheduleBlock[]>(initialSchedule)
    const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))

    // Selection State
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState<{ day: Date, hour: number } | null>(null)
    const [dragEnd, setDragEnd] = useState<{ day: Date, hour: number } | null>(null)

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, day: Date, startHour: number, endHour: number } | null>(null)

    // Computed Days for Grid
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i))

    // --- Handlers ---

    const handleMouseDown = (day: Date, hour: number, e: React.MouseEvent) => {
        // Prevent dragging if right click? No, left click drag.
        if (e.button !== 0) return
        setIsDragging(true)
        setDragStart({ day, hour })
        setDragEnd({ day, hour })
        setContextMenu(null) // Close menu
    }

    const handleMouseEnter = (day: Date, hour: number) => {
        if (!isDragging || !dragStart) return
        // Only allow selection within the SAME DAY for simplicity in this MVP
        if (!isSameDay(day, dragStart.day)) return
        setDragEnd({ day, hour })
    }

    const handleMouseUp = (e: React.MouseEvent) => {
        if (!isDragging || !dragStart || !dragEnd) {
            setIsDragging(false)
            return
        }

        setIsDragging(false)

        // Calculate selection range
        const startHour = Math.min(dragStart.hour, dragEnd.hour)
        const endHour = Math.max(dragStart.hour, dragEnd.hour) + 1 // +1 because selection includes the end hour block

        // Open Context Menu at mouse position
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            day: dragStart.day,
            startHour,
            endHour
        })
    }

    const handleCreateSchedule = async (type: ScheduleType) => {
        if (!contextMenu) return

        const startTime = setMinutes(setHours(contextMenu.day, contextMenu.startHour), 0)
        const endTime = setMinutes(setHours(contextMenu.day, contextMenu.endHour), 0)

        toast.promise(
            createUserSchedule(userId, { startTime, endTime, type }),
            {
                loading: 'Đang lưu lịch...',
                success: (res) => {
                    if (res.success && Array.isArray(res.data)) {
                        // Handle array of created blocks
                        const newBlocks = res.data.map(d => ({
                            ...d,
                            startTime: new Date(d.startTime),
                            endTime: new Date(d.endTime)
                        }))
                        setSchedules([...schedules, ...newBlocks])
                        setContextMenu(null)
                        return `Đã báo ${type === 'BUSY' ? 'Bận' : 'Nhận việc'} (${contextMenu.startHour}h-${contextMenu.endHour}h)`
                    } else {
                        throw new Error(res.error)
                    }
                },
                error: 'Lỗi khi lưu lịch'
            }
        )
    }

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        // Confirm?
        if (!confirm('Xóa lịch này?')) return

        const res = await deleteUserSchedule(id, userId)
        if (res.success) {
            setSchedules(prev => prev.filter(s => s.id !== id))
            toast.success('Đã xóa')
        } else {
            toast.error('Lỗi xóa')
        }
    }

    // --- Render Helpers ---

    const getBlockStyle = (type: ScheduleType) => {
        switch (type) {
            case 'BUSY': return 'bg-red-500/20 border-red-500/50 text-red-200'
            case 'OVERTIME': return 'bg-yellow-500/20 border-yellow-500/50 text-yellow-200'
            case 'TASK': return 'bg-blue-500/20 border-blue-500/50 text-blue-200'
            default: return 'bg-gray-500/20'
        }
    }

    return (
        <div className="select-none" onMouseUp={handleMouseUp}> {/* Catch mouse up anywhere */}

            {/* Header Controls */}
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
                    Lịch Trình Tuần Này
                </h2>
                <div className="flex gap-2">
                    <button onClick={() => setCurrentWeekStart(d => addDays(d, -7))} className="px-3 py-1 rounded bg-white/5 hover:bg-white/10 text-sm">Prev</button>
                    <span className="px-3 py-1 font-mono text-gray-400">
                        {format(currentWeekStart, 'dd/MM')} - {format(addDays(currentWeekStart, 6), 'dd/MM')}
                    </span>
                    <button onClick={() => setCurrentWeekStart(d => addDays(d, 7))} className="px-3 py-1 rounded bg-white/5 hover:bg-white/10 text-sm">Next</button>
                </div>
            </div>

            {/* GRID CONTAINER */}
            <div className="rounded-xl overflow-hidden border border-white/10 bg-black/20 backdrop-blur-sm relative">

                {/* Header Row (Days) */}
                <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-white/10 bg-white/5">
                    <div className="p-3 text-xs text-gray-500 border-r border-white/10 text-center flex items-center justify-center">GMT+7</div>
                    {weekDays.map((day, i) => (
                        <div key={i} className={cn("p-3 text-center border-r border-white/10 last:border-0", isSameDay(day, new Date()) && "bg-blue-500/10")}>
                            <div className="text-xs text-gray-400 uppercase">{format(day, 'EEE', { locale: vi })}</div>
                            <div className={cn("text-lg font-bold", isSameDay(day, new Date()) ? "text-blue-400" : "text-white")}>
                                {format(day, 'dd')}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Body Rows (Hours) */}
                <div className="relative">
                    {/* Hour Grid */}
                    {HOURS.map(hour => (
                        <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-white/5 h-12">
                            <div className="text-[10px] text-gray-500 text-right pr-2 pt-1 border-r border-white/10">
                                {hour}:00
                            </div>
                            {weekDays.map((day, i) => {
                                const isSelected = isDragging && dragStart && dragEnd &&
                                    isSameDay(day, dragStart.day) &&
                                    hour >= Math.min(dragStart.hour, dragEnd.hour) &&
                                    hour <= Math.max(dragStart.hour, dragEnd.hour)

                                return (
                                    <div
                                        key={i}
                                        className={cn(
                                            "border-r border-white/5 relative group transition-colors",
                                            isSelected && "bg-purple-500/20"
                                        )}
                                        onMouseDown={(e) => handleMouseDown(day, hour, e)}
                                        onMouseEnter={() => handleMouseEnter(day, hour)}
                                    >
                                        {/* Plus Icon on Hover (if not occupied) */}
                                        {!isSelected && !isDragging && (
                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
                                                <span className="text-white/20 text-xs">+</span>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    ))}

                    {/* RENDER EXISTING SCHEDULE BLOCKS */}
                    {/* Logic: We iterate through schedules and position them absolutely based on Time */}
                    {/* This is more performant than rendering inside each cell for spanning blocks */}
                    {schedules.map(block => {
                        const blockDate = startOfDay(block.startTime)

                        // Check if block is in current view
                        const dayIndex = weekDays.findIndex(d => isSameDay(d, blockDate))
                        if (dayIndex === -1) return null

                        const startH = getHours(block.startTime)
                        // Filter out blocks outside 8-22 range for now, or clamp them?
                        // Let's assume data is clean or visual clamping.

                        // Calculate Grid Position
                        // Row Height = 3rem (h-12 = 48px).
                        // Top Offset = (StartHour - 8) * 3rem.
                        // Height = DurationHours * 3rem.

                        const durationHours = (block.endTime.getTime() - block.startTime.getTime()) / (1000 * 60 * 60)
                        const topRem = (startH - 8) * 3
                        const heightRem = durationHours * 3

                        // Column 2 starts after 60px. width = (100% - 60px) / 7.
                        // Actually, CSS Grid is easier if we match the grid above.
                        // But mixing Grid and Absolute is tricky. 
                        // Let's use pure Absolute overlay on top of the grid container.

                        // Left = 60px + (dayIndex * (1/7 of remaining))
                        // This is hard with responsive.
                        // BETTER : Render inside a separate Overlay Grid that matches exact columns.

                        return null // Moving render logic below to avoid mapping confusion
                    })}

                    {/* Helper Overlay for Blocks */}
                    <div className="absolute inset-0 grid grid-cols-[60px_repeat(7,1fr)] pointer-events-none">
                        <div /> {/* Skip Time Col */}
                        {weekDays.map((day, i) => (
                            <div key={i} className="relative h-full border-r border-transparent">
                                {schedules.filter(s => isSameDay(s.startTime, day)).map(block => {
                                    const startH = getHours(block.startTime) + (block.startTime.getMinutes() / 60)
                                    const endH = getHours(block.endTime) + (block.endTime.getMinutes() / 60)

                                    if (endH < 8 || startH > 23) return null // Out of view

                                    // Clamp visual to 8-23
                                    const visualStart = Math.max(startH, 8)
                                    const visualEnd = Math.min(endH, 23)
                                    const duration = visualEnd - visualStart

                                    const top = (visualStart - 8) * 3 // 3rem per hour
                                    const height = duration * 3

                                    return (
                                        <motion.div
                                            key={block.id}
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            layoutId={block.id}
                                            className={cn(
                                                "absolute left-1 right-1 rounded px-2 py-1 text-[10px] border pointer-events-auto cursor-pointer overflow-hidden",
                                                getBlockStyle(block.type)
                                            )}
                                            style={{
                                                top: `${top}rem`,
                                                height: `${height}rem`,
                                                zIndex: 10
                                            }}
                                            onClick={(e) => handleDelete(block.id, e)}
                                        >
                                            <div className="font-bold uppercase tracking-wider mb-0.5 opacity-80">
                                                {block.type === 'TASK' ? '⚡ System Task' : (block.type === 'BUSY' ? '⛔ Bận' : '🌟 OT')}
                                            </div>
                                            <div className="truncate opacity-75">
                                                {format(block.startTime, 'HH:mm')} - {format(block.endTime, 'HH:mm')}
                                            </div>
                                            {block.note && <div className="italic opacity-60 truncate">"{block.note}"</div>}
                                        </motion.div>
                                    )
                                })}
                            </div>
                        ))}
                    </div>

                </div>
            </div>

            {/* CONTEXT MENU POPUP */}
            <AnimatePresence>
                {contextMenu && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setContextMenu(null)}> {/* Backdrop to close */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            style={{
                                position: 'fixed',
                                left: Math.min(contextMenu.x, window.innerWidth - 200),
                                top: Math.min(contextMenu.y, window.innerHeight - 200)
                            }}
                            className="bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-2xl p-2 w-48 flex flex-col gap-1 overflow-hidden"
                            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking menu
                        >
                            <div className="text-xs text-center text-gray-500 py-1 border-b border-gray-800 mb-1">
                                {format(contextMenu.day, 'dd/MM')} • {contextMenu.startHour}:00 - {contextMenu.endHour}:00
                            </div>

                            <button
                                onClick={() => handleCreateSchedule('BUSY')}
                                className="flex items-center gap-3 px-3 py-2 hover:bg-red-500/20 hover:text-red-400 text-gray-300 rounded-lg text-sm transition-colors text-left"
                            >
                                <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>
                                <div className="flex flex-col">
                                    <span className="font-bold">Báo Bận</span>
                                    <span className="text-[10px] opacity-60">Không nhận việc</span>
                                </div>
                            </button>

                            <button
                                onClick={() => handleCreateSchedule('OVERTIME')}
                                className="flex items-center gap-3 px-3 py-2 hover:bg-yellow-500/20 hover:text-yellow-400 text-gray-300 rounded-lg text-sm transition-colors text-left"
                            >
                                <span className="w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]"></span>
                                <div className="flex flex-col">
                                    <span className="font-bold">Nhận Thêm</span>
                                    <span className="text-[10px] opacity-60">Sẵn sàng OT</span>
                                </div>
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <div className="mt-4 flex gap-6 justify-center text-xs text-gray-500">
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-red-500/20 border border-red-500/50"></span>
                    <span>Bận (Busy)</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-yellow-500/20 border border-yellow-500/50"></span>
                    <span>Sẵn sàng (Overtime)</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-blue-500/20 border border-blue-500/50"></span>
                    <span>Task (Hệ thống)</span>
                </div>
            </div>
        </div>
    )
}
