'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, RefreshCw, ShoppingBag, Sparkles, TrendingUp, Download, CheckCircle2 } from 'lucide-react'
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    useDroppable,
    pointerWithin,
    type DragStartEvent,
    type DragEndEvent,
    type DropAnimation,
} from '@dnd-kit/core'
import { getMarketplaceTasks, claimTask } from '@/actions/claim-actions'
import { MarketTaskCard, MarketTaskCardOverlay, type MarketTask } from './MarketTaskCard'
import { toast } from 'sonner'

const CLAIM_ZONE_ID = 'claim-drop-zone'

const dropAnimation: DropAnimation = {
    duration: 220,
    easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
}

// ══════════════════════════════════════════════════════════════════
// A. FULL-SCREEN DROP ZONE — entire viewport is the hitbox
//    Appears OVER everything (z-9997) except DragOverlay (z-9999)
//    Drop anywhere = claim task. Only Escape = cancel.
// ══════════════════════════════════════════════════════════════════
function FullScreenDropZone() {
    const { isOver, setNodeRef } = useDroppable({ id: CLAIM_ZONE_ID })

    return (
        <motion.div
            ref={setNodeRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[9997]"
        >
            {/* ── Tinted backdrop: dark → indigo when active ── */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-gradient-to-b from-indigo-950/20 via-indigo-950/30 to-indigo-950/50"
            />

            {/* ── Pulsing edge glow (viewport border) ── */}
            <motion.div
                animate={{
                    boxShadow: [
                        'inset 0 0 60px rgba(99,102,241,0.08), inset 0 0 120px rgba(99,102,241,0.04)',
                        'inset 0 0 80px rgba(99,102,241,0.15), inset 0 0 160px rgba(99,102,241,0.08)',
                        'inset 0 0 60px rgba(99,102,241,0.08), inset 0 0 120px rgba(99,102,241,0.04)',
                    ],
                }}
                transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                className="absolute inset-0 pointer-events-none"
            />

            {/* ── Animated scan-line edges ── */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {/* Top edge */}
                <motion.div
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                    className="absolute top-0 left-0 w-1/3 h-[2px] bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent"
                />
                {/* Bottom edge */}
                <motion.div
                    animate={{ x: ['100%', '-100%'] }}
                    transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                    className="absolute bottom-0 right-0 w-1/3 h-[2px] bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent"
                />
                {/* Left edge */}
                <motion.div
                    animate={{ y: ['-100%', '100%'] }}
                    transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
                    className="absolute top-0 left-0 w-[2px] h-1/3 bg-gradient-to-b from-transparent via-indigo-400/40 to-transparent"
                />
                {/* Right edge */}
                <motion.div
                    animate={{ y: ['100%', '-100%'] }}
                    transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
                    className="absolute top-0 right-0 w-[2px] h-1/3 bg-gradient-to-b from-transparent via-indigo-400/40 to-transparent"
                />
            </div>

            {/* ── C. Bottom indicator bar — glowing confirmation zone ── */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
                <motion.div
                    initial={{ y: 40, opacity: 0, scale: 0.9 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 28, delay: 0.1 }}
                >
                    <motion.div
                        animate={{
                            boxShadow: [
                                '0 0 24px rgba(99,102,241,0.2), 0 0 0 1px rgba(99,102,241,0.3)',
                                '0 0 48px rgba(99,102,241,0.35), 0 0 0 1px rgba(99,102,241,0.5)',
                                '0 0 24px rgba(99,102,241,0.2), 0 0 0 1px rgba(99,102,241,0.3)',
                            ],
                            borderColor: [
                                'rgba(99,102,241,0.4)',
                                'rgba(129,140,248,0.7)',
                                'rgba(99,102,241,0.4)',
                            ],
                        }}
                        transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                        className="flex items-center gap-4 px-10 py-5 rounded-2xl bg-indigo-950/85 border-2 border-dashed backdrop-blur-2xl"
                    >
                        <motion.div
                            animate={{
                                y: [0, -6, 0],
                                scale: [1, 1.12, 1],
                            }}
                            transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
                            className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center"
                        >
                            <Download className="w-5 h-5 text-indigo-400" strokeWidth={2} />
                        </motion.div>
                        <div>
                            <p className="text-base font-extrabold text-indigo-300 uppercase tracking-widest">
                                Thả ra để nhận task
                            </p>
                            <p className="text-[11px] text-indigo-400/60 mt-0.5 font-medium">
                                Nhả chuột ở bất kỳ đâu · Nhấn <kbd className="px-1.5 py-0.5 bg-indigo-500/15 rounded text-indigo-300/80 text-[10px] border border-indigo-500/20">Esc</kbd> để hủy
                            </p>
                        </div>
                        <motion.div
                            animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
                            transition={{ repeat: Infinity, duration: 2 }}
                        >
                            <CheckCircle2 className="w-6 h-6 text-emerald-400/70" strokeWidth={1.5} />
                        </motion.div>
                    </motion.div>
                </motion.div>
            </div>
        </motion.div>
    )
}

interface TaskMarketplaceProps {
    isOpen: boolean
    onClose: () => void
    workspaceId: string
    onTaskCountChange?: (count: number) => void
}

export function TaskMarketplace({ isOpen, onClose, workspaceId, onTaskCountChange }: TaskMarketplaceProps) {
    const [tasks, setTasks] = useState<MarketTask[]>([])
    const [loading, setLoading] = useState(false)
    const [activeTask, setActiveTask] = useState<MarketTask | null>(null)

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        })
    )

    const fetchTasks = useCallback(async () => {
        setLoading(true)
        const res = await getMarketplaceTasks(workspaceId)
        setLoading(false)
        if (res.error) {
            console.error('[Marketplace] Error:', res.error)
            toast.error(res.error)
        }
        if (res.tasks) {
            setTasks(res.tasks as MarketTask[])
            onTaskCountChange?.(res.tasks.length)
        }
    }, [workspaceId, onTaskCountChange])

    useEffect(() => {
        if (isOpen) fetchTasks()
    }, [isOpen, fetchTasks])

    useEffect(() => {
        if (!isOpen) return
        const interval = setInterval(fetchTasks, 10000)
        return () => clearInterval(interval)
    }, [isOpen, fetchTasks])

    // ══════════════════════════════════════════
    // B. CLAIM FLOW (verified):
    //    1. onDragEnd → get taskId from activeTask
    //    2. userId extracted from session inside claimTask()
    //    3. claimTask(taskId, workspaceId) → DB update
    //    4. Success → toast + remove from list
    //    5. Error → rollback + error toast
    // ══════════════════════════════════════════
    const handleClaim = useCallback(async (taskId: string) => {
        const taskToRemove = tasks.find(t => t.id === taskId)
        const updatedTasks = tasks.filter(t => t.id !== taskId)

        // Optimistic: remove immediately
        setTasks(updatedTasks)

        const res = await claimTask(taskId, workspaceId)
        if (res.error) {
            // Rollback on failure
            if (taskToRemove) setTasks(prev => [...prev, taskToRemove])
            toast.error(res.error)
            return
        }

        toast.success('Task đã được nhận thành công!')
        onTaskCountChange?.(updatedTasks.length)
        if (updatedTasks.length === 0) setTimeout(onClose, 500)
    }, [tasks, workspaceId, onClose, onTaskCountChange])

    const onDragStart = useCallback(({ active }: DragStartEvent) => {
        const task = tasks.find(t => t.id === active.id)
        if (task) setActiveTask(task)
    }, [tasks])

    const onDragEnd = useCallback(({ over }: DragEndEvent) => {
        // Full-screen zone: any drop = claim (unless over is null, which shouldn't happen)
        if (over?.id === CLAIM_ZONE_ID && activeTask) {
            handleClaim(activeTask.id)
        }
        setActiveTask(null)
    }, [activeTask, handleClaim])

    const onDragCancel = useCallback(() => {
        setActiveTask(null)
    }, [])

    return (
        <AnimatePresence>
            {isOpen && (
                <DndContext
                    sensors={sensors}
                    collisionDetection={pointerWithin}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onDragCancel={onDragCancel}
                >
                    <div className="fixed inset-0 z-50 flex items-center justify-center">
                        {/* ── Backdrop ── */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0"
                            onClick={onClose}
                        >
                            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
                            <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-amber-500/8 rounded-full blur-[120px] pointer-events-none" />
                            <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-orange-500/6 rounded-full blur-[100px] pointer-events-none" />
                        </motion.div>

                        {/* ── Marketplace panel ── */}
                        <motion.div
                            initial={{ scale: 0.92, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.92, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
                            onClick={(e) => e.stopPropagation()}
                            className="relative w-[62vw] max-w-[940px] max-h-[82vh] flex flex-col overflow-hidden z-[1]
                                rounded-[28px] border border-amber-500/15
                                bg-gradient-to-b from-zinc-900/98 via-zinc-950/98 to-zinc-950/98
                                backdrop-blur-2xl
                                shadow-[0_0_0_1px_rgba(245,158,11,0.06),0_8px_40px_rgba(0,0,0,0.7),0_0_80px_rgba(245,158,11,0.08)]"
                        >
                            <div className="absolute top-0 left-8 right-8 h-[1px] bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

                            {/* ── Header ── */}
                            <div className="relative px-8 py-6 flex justify-between items-center flex-shrink-0">
                                <div className="flex items-center gap-4">
                                    <motion.div
                                        animate={{
                                            boxShadow: [
                                                '0 0 20px rgba(245,158,11,0.15)',
                                                '0 0 35px rgba(245,158,11,0.25)',
                                                '0 0 20px rgba(245,158,11,0.15)',
                                            ]
                                        }}
                                        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                                        className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/25 to-orange-600/15 border border-amber-500/30 flex items-center justify-center"
                                    >
                                        <ShoppingBag className="w-5 h-5 text-amber-400" strokeWidth={1.5} />
                                    </motion.div>
                                    <div>
                                        <div className="flex items-center gap-2.5">
                                            <h2 className="text-xl font-extrabold text-white tracking-tight">Phiên Chợ Task</h2>
                                            {tasks.length > 0 && (
                                                <motion.div
                                                    initial={{ scale: 0 }}
                                                    animate={{ scale: 1 }}
                                                    className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/12 border border-emerald-500/25 rounded-full"
                                                >
                                                    <TrendingUp className="w-3 h-3 text-emerald-400" strokeWidth={2} />
                                                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">Live</span>
                                                </motion.div>
                                            )}
                                        </div>
                                        <p className="text-xs text-zinc-500 mt-0.5 font-medium">
                                            <span className="text-amber-400/80 font-bold">{tasks.length}</span>
                                            <span className="mx-1.5">task khả dụng</span>
                                            <span className="text-zinc-600">·</span>
                                            <span className="text-zinc-600 ml-1.5 italic">
                                                {activeTask ? '🎯 Thả ở bất kỳ đâu để nhận task' : 'Kéo thẻ ra để nhận'}
                                            </span>
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    <motion.button
                                        whileHover={{ rotate: 180, scale: 1.05 }}
                                        whileTap={{ scale: 0.9 }}
                                        transition={{ duration: 0.35 }}
                                        onClick={fetchTasks}
                                        disabled={loading}
                                        className="p-2.5 hover:bg-white/5 rounded-xl transition-colors text-zinc-500 hover:text-zinc-300 disabled:opacity-40"
                                        title="Làm mới"
                                    >
                                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.5} />
                                    </motion.button>
                                    <motion.button
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={onClose}
                                        className="p-2.5 hover:bg-white/5 rounded-xl transition-colors text-zinc-500 hover:text-zinc-300"
                                    >
                                        <X className="w-5 h-5" strokeWidth={1.5} />
                                    </motion.button>
                                </div>

                                <div className="absolute bottom-0 left-6 right-6 h-[1px] bg-gradient-to-r from-transparent via-white/8 to-transparent" />
                            </div>

                            {/* ── Task Grid ── */}
                            <div className="flex-1 overflow-y-auto p-6 pt-4 custom-scrollbar">
                                {tasks.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-24 text-center">
                                        <motion.div
                                            animate={{ scale: [1, 1.08, 1], rotate: [0, 3, -3, 0] }}
                                            transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
                                            className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/15 flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/5"
                                        >
                                            <Sparkles className="w-8 h-8 text-emerald-400/70" strokeWidth={1.5} />
                                        </motion.div>
                                        <h3 className="text-lg font-extrabold text-zinc-300 tracking-tight">Chợ đang trống!</h3>
                                        <p className="text-sm text-zinc-600 mt-2 max-w-[260px] leading-relaxed">
                                            Tất cả task đã được nhận. Quay lại sau nhé.
                                        </p>
                                    </div>
                                ) : (
                                    <motion.div layout className="grid grid-cols-2 gap-4">
                                        <AnimatePresence>
                                            {tasks.map((task, i) => (
                                                <MarketTaskCard
                                                    key={task.id}
                                                    task={task}
                                                    index={i}
                                                />
                                            ))}
                                        </AnimatePresence>
                                    </motion.div>
                                )}
                            </div>

                            <div className="absolute bottom-0 left-8 right-8 h-[1px] bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
                        </motion.div>
                    </div>

                    {/* ══════════════════════════════════════════
                        A. FULL-SCREEN DROP ZONE
                        Covers entire viewport (z-9997)
                        Above modal, below DragOverlay
                        Drop ANYWHERE = claim task
                    ══════════════════════════════════════════ */}
                    <AnimatePresence>
                        {activeTask && <FullScreenDropZone />}
                    </AnimatePresence>

                    {/* ── DragOverlay: Portal → document.body (z-9999, above drop zone) ── */}
                    <DragOverlay dropAnimation={dropAnimation}>
                        {activeTask ? <MarketTaskCardOverlay task={activeTask} /> : null}
                    </DragOverlay>
                </DndContext>
            )}
        </AnimatePresence>
    )
}
