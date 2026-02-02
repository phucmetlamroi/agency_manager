'use client'

import { useState, useEffect, useRef } from 'react'
import { getFocusTasks, completeFocusTask } from '@/actions/focus-actions'
import confetti from 'canvas-confetti'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Minus, Maximize2, Check, GripHorizontal } from 'lucide-react' // Using lucide icons if available, or SVG fallback

// SVG Icons fallback if lucide-react not present (safest)
const Icons = {
    Minimize: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>,
    Maximize: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>,
    Grip: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
}

export default function DraggableFocusWidget({ userId }: { userId: string }) {
    const [tasks, setTasks] = useState<any[]>([])
    const [minimized, setMinimized] = useState(false)
    const [isLoaded, setIsLoaded] = useState(false)

    useEffect(() => {
        loadTasks()
        const interval = setInterval(loadTasks, 15000)
        return () => clearInterval(interval)
    }, [userId])

    async function loadTasks() {
        const res = await getFocusTasks(userId)
        // Show PUBLISHED only.
        const active = res.filter((t: any) => t.status === 'PUBLISHED')
        setTasks(active)
        setIsLoaded(true)
    }

    async function handleComplete(task: any) {
        // Optimistic Toggle
        const newTasks = tasks.map(t =>
            t.id === task.id ? { ...t, isDone: !t.isDone } : t
        )
        setTasks(newTasks)

        // Celebrate if ticking DONE
        if (!task.isDone) {
            const allDone = newTasks.every(t => t.isDone)
            if (allDone && newTasks.length > 0) {
                confetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 },
                    colors: ['#a855f7', '#ec4899', '#3b82f6'] // Cyberpunk colors
                })
            }
        }
        await completeFocusTask(task.id)
    }

    if (!isLoaded || tasks.length === 0) return null

    const pendingCount = tasks.filter(t => !t.isDone).length
    const doneCount = tasks.filter(t => t.isDone).length

    // Sort: Undone first, then Done
    // Hero task is first undone
    const sortedTasks = [...tasks].sort((a, b) => {
        if (a.isDone === b.isDone) return a.order - b.order
        return a.isDone ? 1 : -1
    })

    return (
        <div className="fixed bottom-6 right-6 z-50 pointer-events-none w-full h-full max-w-[100vw] max-h-[100vh] overflow-hidden flex items-end justify-end p-4">

            <motion.div
                drag
                dragMomentum={false}
                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="pointer-events-auto flex flex-col w-[340px]"
                style={{
                    fontFamily: '"Outfit", sans-serif', // Modern font
                }}
            >
                {/* Main Card */}
                <div className="bg-white/80 backdrop-blur-xl border border-white/40 shadow-2xl rounded-2xl overflow-hidden ring-1 ring-black/5 dark:bg-black/80 dark:border-white/10">

                    {/* Header with Gradient */}
                    <div
                        className={`
                            h-12 px-4 flex items-center justify-between cursor-move select-none transition-colors
                            ${pendingCount === 0
                                ? 'bg-gradient-to-r from-green-400 to-emerald-600' // Success
                                : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500' // Default Fancy
                            }
                        `}
                        onDoubleClick={() => setMinimized(!minimized)}
                    >
                        <div className="flex items-center gap-2 text-white font-bold tracking-wide text-sm">
                            <Icons.Grip />
                            <span className="drop-shadow-sm">FOCUS MODE</span>
                            {pendingCount > 0 && (
                                <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] backdrop-blur-sm">
                                    {pendingCount} LEFT
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setMinimized(!minimized)}
                                className="text-white/80 hover:text-white p-1 hover:bg-white/10 rounded-md transition-colors"
                            >
                                {minimized ? <Icons.Maximize /> : <Icons.Minimize />}
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <AnimatePresence>
                        {!minimized && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                            >
                                <div className="max-h-[450px] overflow-y-auto custom-scrollbar p-1 bg-gradient-to-b from-white/50 to-white/20 leading-relaxed">

                                    {/* Task List */}
                                    <div className="space-y-1 p-2">
                                        {sortedTasks.map((task, i) => {
                                            const isHero = !task.isDone && i === 0
                                            return (
                                                <motion.div
                                                    key={task.id}
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    className={`
                                                        relative group rounded-xl p-3 transition-all duration-200 border
                                                        ${task.isDone
                                                            ? 'bg-gray-50/50 border-transparent opacity-60 hover:opacity-100'
                                                            : isHero
                                                                ? 'bg-white border-purple-100 shadow-lg shadow-purple-500/10 scale-[1.02] z-10 my-2'
                                                                : 'bg-white/40 border-transparent hover:bg-white hover:shadow-sm'
                                                        }
                                                    `}
                                                >
                                                    {/* Hero Glow */}
                                                    {isHero && <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-purple-500/5 rounded-xl pointer-events-none" />}

                                                    {/* Priority Badge */}
                                                    {task.isPriority && !task.isDone && (
                                                        <div className="absolute -top-1.5 -right-1.5 z-20">
                                                            <span className="relative flex h-3 w-3">
                                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                                            </span>
                                                        </div>
                                                    )}

                                                    <div className="flex items-start gap-3 relative z-10">
                                                        {/* Custom Checkbox */}
                                                        <div className="pt-1">
                                                            <button
                                                                onClick={() => handleComplete(task)}
                                                                className={`
                                                                    w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-300
                                                                    ${task.isDone
                                                                        ? 'bg-green-500 border-green-500 text-white'
                                                                        : isHero
                                                                            ? 'border-purple-400 bg-white hover:border-purple-600'
                                                                            : 'border-gray-300 bg-white/50 hover:border-gray-400'
                                                                    }
                                                                `}
                                                            >
                                                                {task.isDone && (
                                                                    <motion.svg
                                                                        initial={{ scale: 0 }}
                                                                        animate={{ scale: 1 }}
                                                                        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
                                                                    >
                                                                        <polyline points="20 6 9 17 4 12"></polyline>
                                                                    </motion.svg>
                                                                )}
                                                            </button>
                                                        </div>

                                                        <div className="flex-1 min-w-0">
                                                            <p className={`
                                                                text-sm font-medium transition-all duration-300 break-words
                                                                ${task.isDone
                                                                    ? 'text-gray-400 line-through decoration-gray-300'
                                                                    : isHero
                                                                        ? 'text-gray-900 text-base font-semibold leading-snug'
                                                                        : 'text-gray-700'
                                                                }
                                                            `}>
                                                                {task.content}
                                                            </p>
                                                            {isHero && !task.isDone && (
                                                                <p className="text-[10px] uppercase font-bold text-purple-600/70 mt-1 tracking-wider">
                                                                    High Priority • Doing Now
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )
                                        })}

                                        {tasks.length === 0 && (
                                            <div className="text-center py-8 text-gray-400 text-sm">
                                                All clear! Relax & Chill. ☕
                                            </div>
                                        )}

                                        {pendingCount === 0 && tasks.length > 0 && (
                                            <div className="mt-2 p-3 rounded-xl bg-green-50/50 border border-green-100 flex flex-col items-center">
                                                <span className="text-2xl animate-bounce">🎉</span>
                                                <span className="text-xs font-bold text-green-700 uppercase tracking-widest mt-1">Completion 100%</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Shadow/Reflection fake */}
                <div className="h-4 mx-4 bg-black/5 blurred-lg rounded-[100%] blur-md -mt-2 z-[-1]" />
            </motion.div>
        </div>
    )
}
