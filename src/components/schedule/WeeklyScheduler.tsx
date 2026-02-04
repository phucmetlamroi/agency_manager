'use client'

import { useState, useTransition } from 'react'
import { startOfWeek, addDays, format, setHours, setMinutes, isSameDay } from 'date-fns'
import { vi } from 'date-fns/locale'
import { createScheduleBlock, deleteScheduleBlock } from '@/actions/schedule-actions'
import { toast } from 'sonner'
import { Loader2, Trash2 } from 'lucide-react'

type ScheduleType = 'BUSY' | 'OVERTIME' | 'AVAILABLE' | 'TASK'

const TYPE_COLORS = {
    BUSY: 'bg-red-500/20 border-red-500 text-red-300',
    OVERTIME: 'bg-yellow-500/20 border-yellow-500 text-yellow-300',
    AVAILABLE: 'bg-green-500/20 border-green-500 text-green-300',
    TASK: 'bg-blue-500/20 border-blue-500 text-blue-300'
}

type ScheduleBlock = {
    id: string
    startTime: Date
    endTime: Date
    type: ScheduleType
    note?: string | null
}

export default function WeeklyScheduler({ initialSchedule }: { initialSchedule: any[] }) {
    const [currentDate, setCurrentDate] = useState(new Date())
    const [isPending, startTransition] = useTransition()

    // Normalize DB dates
    const schedule = initialSchedule.map(s => ({
        ...s,
        startTime: new Date(s.startTime),
        endTime: new Date(s.endTime)
    }))

    const startOfCurrentWeek = startOfWeek(currentDate, { weekStartsOn: 1 }) // Monday start
    const days = Array.from({ length: 7 }).map((_, i) => addDays(startOfCurrentWeek, i))
    const hours = Array.from({ length: 17 }).map((_, i) => i + 7) // 07:00 to 23:00

    // Modal State
    const [selectedSlot, setSelectedSlot] = useState<{ date: Date, hour: number } | null>(null)
    const [formType, setFormType] = useState<ScheduleType>('BUSY')
    const [formNote, setFormNote] = useState('')

    const handleCellClick = (date: Date, hour: number) => {
        setSelectedSlot({ date, hour })
        setFormType('BUSY')
        setFormNote('')
    }

    const handleCreate = () => {
        if (!selectedSlot) return

        const start = setMinutes(setHours(selectedSlot.date, selectedSlot.hour), 0)
        const end = setMinutes(setHours(selectedSlot.date, selectedSlot.hour + 1), 0)

        startTransition(async () => {
            const res = await createScheduleBlock({
                startTime: start,
                endTime: end,
                type: formType as any,
                note: formNote
            })

            if (res.success) {
                toast.success('Đã tạo lịch!')
                setSelectedSlot(null)
            } else {
                toast.error(res.error)
            }
        })
    }

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!confirm('Xóa lịch này?')) return

        startTransition(async () => {
            const res = await deleteScheduleBlock(id)
            if (res.success) toast.success('Đã xóa')
            else toast.error('Lỗi khi xóa')
        })
    }

    return (
        <div className="flex flex-col h-full bg-[#111] rounded-xl border border-[#333] overflow-hidden">
            {/* Header / Navigation */}
            <div className="p-4 border-b border-[#333] flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">
                    {format(startOfCurrentWeek, "'Tuần' w, MMMM yyyy", { locale: vi })}
                </h2>
                <div className="flex gap-2">
                    <button
                        onClick={() => setCurrentDate(addDays(currentDate, -7))}
                        className="px-3 py-1 bg-[#222] rounded hover:bg-[#333] text-sm"
                    >
                        Prev
                    </button>
                    <button
                        onClick={() => setCurrentDate(new Date())}
                        className="px-3 py-1 bg-purple-600 rounded hover:bg-purple-500 text-sm font-bold"
                    >
                        Today
                    </button>
                    <button
                        onClick={() => setCurrentDate(addDays(currentDate, 7))}
                        className="px-3 py-1 bg-[#222] rounded hover:bg-[#333] text-sm"
                    >
                        Next
                    </button>
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto relative">
                <div className="grid grid-cols-8 min-w-[800px]">
                    {/* Time Column Header */}
                    <div className="sticky top-0 z-10 bg-[#1a1a1a] p-2 border-b border-r border-[#333] text-xs text-gray-500 text-center font-mono">
                        GMT+7
                    </div>
                    {/* Day Headers */}
                    {days.map(day => (
                        <div key={day.toString()} className={`sticky top-0 z-10 bg-[#1a1a1a] p-2 border-b border-r border-[#333] text-center ${isSameDay(day, new Date()) ? 'bg-purple-900/20 text-purple-300' : 'text-gray-400'}`}>
                            <div className="text-xs uppercase">{format(day, 'EEE', { locale: vi })}</div>
                            <div className="font-bold text-lg">{format(day, 'dd')}</div>
                        </div>
                    ))}

                    {/* Time Slots */}
                    {hours.map(hour => (
                        <>
                            {/* Time Label */}
                            <div key={`time-${hour}`} className="border-b border-r border-[#333] text-xs text-gray-600 p-2 text-center h-[60px] relative">
                                <span className="relative -top-3 bg-[#111] px-1">{hour}:00</span>
                            </div>

                            {/* Cells */}
                            {days.map(day => {
                                const cellTime = setHours(day, hour)
                                // Find blocks in this cell
                                // Simple logic: Block starts in this hour or covers this hour
                                const blocks = schedule.filter(s => {
                                    const sHour = s.startTime.getHours()
                                    const sDate = s.startTime
                                    return isSameDay(sDate, day) && sHour === hour
                                })

                                return (
                                    <div
                                        key={`${day}-${hour}`}
                                        onClick={() => handleCellClick(day, hour)}
                                        className="border-b border-r border-[#333] h-[60px] relative hover:bg-white/5 cursor-pointer transition-colors"
                                    >
                                        {blocks.map(block => (
                                            <div
                                                key={block.id}
                                                className={`absolute inset-1 rounded p-1 text-[10px] border flex flex-col justify-between overflow-hidden cursor-default group ${TYPE_COLORS[block.type as ScheduleType]}`}
                                                onClick={(e) => e.stopPropagation()} // Prevent creating new on click existing
                                            >
                                                <div className="font-bold truncate">{block.note || block.type}</div>
                                                <button
                                                    onClick={(e) => handleDelete(block.id, e)}
                                                    className="opacity-0 group-hover:opacity-100 absolute top-1 right-1 text-red-500 bg-black/50 rounded p-0.5 hover:bg-black"
                                                >
                                                    <Trash2 size={10} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )
                            })}
                        </>
                    ))}
                </div>
            </div>

            {/* Create Modal */}
            {selectedSlot && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
                    onClick={() => setSelectedSlot(null)}
                >
                    <div className="bg-[#1a1a1a] p-6 rounded-xl border border-[#333] w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-white">
                            Thêm lịch lúc {selectedSlot.hour}:00, {format(selectedSlot.date, 'dd/MM')}
                        </h3>

                        <div className="space-y-2">
                            <label className="text-xs text-gray-500">Trạng thái</label>
                            <div className="grid grid-cols-3 gap-2">
                                {['BUSY', 'OVERTIME', 'AVAILABLE'].map(type => (
                                    <button
                                        key={type}
                                        onClick={() => setFormType(type as ScheduleType)}
                                        className={`p-2 rounded border text-xs font-bold transition-all ${formType === type
                                            ? TYPE_COLORS[type as ScheduleType]
                                            : 'border-[#333] text-gray-500 hover:border-gray-500'
                                            }`}
                                    >
                                        {type}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-gray-500">Ghi chú (Tuỳ chọn)</label>
                            <input
                                value={formNote}
                                onChange={e => setFormNote(e.target.value)}
                                placeholder="VD: Đi học, Ngủ bù..."
                                className="w-full bg-[#111] border border-[#333] rounded p-2 text-sm text-white"
                            />
                        </div>

                        <button
                            onClick={handleCreate}
                            disabled={isPending}
                            className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold flex items-center justify-center gap-2"
                        >
                            {isPending && <Loader2 className="animate-spin w-4 h-4" />}
                            Lưu lịch
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
