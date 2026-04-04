'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, RefreshCw, ShoppingBag } from 'lucide-react'
import { getMarketplaceTasks, claimTask } from '@/actions/claim-actions'
import { MarketTaskCard, type MarketTask } from './MarketTaskCard'
import { toast } from 'sonner'

interface TaskMarketplaceProps {
    isOpen: boolean
    onClose: () => void
    workspaceId: string
    onTaskCountChange?: (count: number) => void
}

export function TaskMarketplace({ isOpen, onClose, workspaceId, onTaskCountChange }: TaskMarketplaceProps) {
    const [tasks, setTasks] = useState<MarketTask[]>([])
    const [loading, setLoading] = useState(false)

    const fetchTasks = useCallback(async () => {
        setLoading(true)
        const res = await getMarketplaceTasks(workspaceId)
        setLoading(false)
        if (res.tasks) {
            setTasks(res.tasks as MarketTask[])
            onTaskCountChange?.(res.tasks.length)
        }
    }, [workspaceId, onTaskCountChange])

    // Load tasks on open
    useEffect(() => {
        if (isOpen) fetchTasks()
    }, [isOpen, fetchTasks])

    // Auto-refresh every 10s
    useEffect(() => {
        if (!isOpen) return
        const interval = setInterval(fetchTasks, 10000)
        return () => clearInterval(interval)
    }, [isOpen, fetchTasks])

    const handleClaim = async (taskId: string) => {
        // Optimistic: remove from local state
        const taskToRemove = tasks.find(t => t.id === taskId)
        setTasks(prev => prev.filter(t => t.id !== taskId))

        const res = await claimTask(taskId, workspaceId)
        if (res.error) {
            // Restore on error
            if (taskToRemove) setTasks(prev => [...prev, taskToRemove])
            toast.error(res.error)
            return
        }

        toast.success('Task đã được nhận!')
        onTaskCountChange?.(tasks.length - 1)

        // Close if no more tasks
        if (tasks.length <= 1) {
            setTimeout(onClose, 500)
        }
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
                        onClick={onClose}
                    />

                    {/* Marketplace panel */}
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 20 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 32 }}
                        onClick={(e) => e.stopPropagation()}
                        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] max-w-[900px] max-h-[80vh] bg-zinc-950/95 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden z-[51]"
                    >
                        {/* Header */}
                        <div className="px-8 py-5 border-b border-white/5 flex justify-between items-center flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/20 flex items-center justify-center">
                                    <ShoppingBag className="w-5 h-5 text-amber-400" strokeWidth={1.5} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white">Phiên Chợ Task</h2>
                                    <p className="text-xs text-zinc-400 mt-0.5">
                                        {tasks.length} task khả dụng
                                        <span className="text-zinc-600 ml-2">· Kéo thẻ ra ngoài để nhận</span>
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <motion.button
                                    whileHover={{ rotate: 180 }}
                                    transition={{ duration: 0.3 }}
                                    onClick={fetchTasks}
                                    disabled={loading}
                                    className="p-2 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 disabled:opacity-50"
                                    title="Làm mới"
                                >
                                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.5} />
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={onClose}
                                    className="p-2 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400"
                                >
                                    <X className="w-5 h-5" strokeWidth={1.5} />
                                </motion.button>
                            </div>
                        </div>

                        {/* Task Grid */}
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            {tasks.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-center">
                                    <motion.div
                                        animate={{ scale: [1, 1.1, 1] }}
                                        transition={{ repeat: Infinity, duration: 3 }}
                                        className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4"
                                    >
                                        <ShoppingBag className="w-7 h-7 text-emerald-400" strokeWidth={1.5} />
                                    </motion.div>
                                    <h3 className="text-lg font-bold text-zinc-300">Chợ đang trống!</h3>
                                    <p className="text-sm text-zinc-500 mt-1">Tất cả task đã được nhận. Quay lại sau nhé.</p>
                                </div>
                            ) : (
                                <motion.div layout className="grid grid-cols-2 gap-5">
                                    <AnimatePresence>
                                        {tasks.map((task, i) => (
                                            <MarketTaskCard
                                                key={task.id}
                                                task={task}
                                                onClaim={handleClaim}
                                                index={i}
                                            />
                                        ))}
                                    </AnimatePresence>
                                </motion.div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
