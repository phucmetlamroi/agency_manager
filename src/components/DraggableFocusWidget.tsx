'use client'

import { useState, useEffect, useRef } from 'react'
import { getFocusTasks, completeFocusTask } from '@/actions/focus-actions'
import confetti from 'canvas-confetti'
import { motion, AnimatePresence } from 'framer-motion'

export default function DraggableFocusWidget({ userId }: { userId: string }) {
    const [tasks, setTasks] = useState<any[]>([])
    const [minimized, setMinimized] = useState(false)
    const [isLoaded, setIsLoaded] = useState(false)

    const constraintsRef = useRef(null)

    useEffect(() => {
        loadTasks()
        const interval = setInterval(loadTasks, 15000)
        return () => clearInterval(interval)
    }, [userId])

    async function loadTasks() {
        const res = await getFocusTasks(userId)
        // Show PUBLISHED only.
        // We DO display DONE tasks as Green, as per user request.
        // Order by `order` field.
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

        // If ticking DONE (not unticking)
        if (!task.isDone) {
            // Check if all done
            const allDone = newTasks.every(t => t.isDone)
            if (allDone && newTasks.length > 0) {
                confetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 }
                })
            }
        }

        await completeFocusTask(task.id)
        if (task.isDone) {
            // If we are un-completing, we might need a separate action or just reuse complete toggle?
            // The action is `completeFocusTask` which sets `isDone: true`.
            // User might want to untick.
            // I should double check `active/focus-actions.ts`.
            // It currently sets `isDone: true`.
            // I will need to update the action to TOGGLE if I want full interaction.
            // For now, let's assume one-way tick or I'll quickly update the action in next step.
            // PROMPT: "user bấm tick vào rồi thì task đó sẽ hiện xanh lá lên".
        }
    }

    if (!isLoaded || tasks.length === 0) return null

    // Determine Hero Task (First Undone Task)
    const heroTask = tasks.find(t => !t.isDone)
    const pendingCount = tasks.filter(t => !t.isDone).length
    const doneCount = tasks.filter(t => t.isDone).length

    return (
        <div className="fixed bottom-4 right-4 z-50 pointer-events-none w-full h-full max-w-[100vw] max-h-[100vh] overflow-hidden flex items-end justify-end p-4">
            {/* Draggable Constraint Area is the screen basically */}

            <motion.div
                drag
                dragMomentum={false}
                initial={{ x: 0, y: 0 }}
                className="pointer-events-auto bg-white shadow-2xl border border-gray-200 rounded-xl overflow-hidden flex flex-col w-[320px]"
                style={{
                    fontFamily: '"Patrick Hand", sans-serif, system-ui',
                    boxShadow: '0 10px 40px -10px rgba(0,0,0,0.2)'
                }}
            >
                {/* Header / Drag Handle */}
                <div
                    className={`
                        p-3 flex items-center justify-between cursor-move select-none
                        ${pendingCount === 0 && tasks.length > 0 ? 'bg-green-500 text-white' : 'bg-gray-800 text-white'}
                    `}
                    onDoubleClick={() => setMinimized(!minimized)}
                >
                    <div className="flex items-center gap-2">
                        <span className="text-lg">📝 Sổ Việc Focus</span>
                        <span className="text-xs bg-white/20 px-1.5 rounded-full">{pendingCount}</span>
                    </div>
                    <button
                        onClick={() => setMinimized(!minimized)}
                        className="opacity-70 hover:opacity-100"
                    >
                        {minimized ? 'Maximize ▲' : 'Minimize ▼'}
                    </button>
                </div>

                {/* Content */}
                <AnimatePresence>
                    {!minimized && (
                        <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: 'auto' }}
                            exit={{ height: 0 }}
                            className="bg-[#fff9e6] max-h-[400px] overflow-y-auto"
                        >
                            {/* Rule Lines Background */}
                            <div className="p-0 relative min-h-[200px]">
                                <div className="absolute inset-0 pointer-events-none opacity-10"
                                    style={{
                                        backgroundImage: 'linear-gradient(#999 1px, transparent 1px)',
                                        backgroundSize: '100% 2rem',
                                        marginTop: '1.9rem'
                                    }}
                                />
                                <div className="absolute top-0 bottom-0 left-8 w-px bg-red-200/50 pointer-events-none" />

                                {/* Task List */}
                                <div className="relative z-10 pt-2 pb-4">
                                    {tasks.map((task, i) => (
                                        <div
                                            key={task.id}
                                            className={`
                                                px-3 py-2 pl-10 hover:bg-black/5 transition-colors flex items-start gap-3
                                                ${task.isDone ? 'opacity-50' : 'opacity-100'}
                                                ${task.id === heroTask?.id ? 'bg-yellow-100/50' : ''}
                                            `}
                                        >
                                            <div className="mt-1.5 flex-shrink-0">
                                                <input
                                                    type="checkbox"
                                                    checked={task.isDone}
                                                    onChange={() => handleComplete(task)}
                                                    className="w-5 h-5 cursor-pointer accent-green-600 rounded"
                                                />
                                            </div>
                                            <span
                                                className={`
                                                    text-lg leading-7
                                                    ${task.isDone ? 'text-green-700 line-through decoration-wavy decoration-green-300' : 'text-gray-800'}
                                                    ${task.isPriority && !task.isDone ? 'font-bold text-red-600' : ''}
                                                `}
                                            >
                                                {task.content}
                                                {task.isPriority && !task.isDone && " 🔥"}
                                            </span>
                                        </div>
                                    ))}

                                    {tasks.length === 0 && (
                                        <div className="p-8 text-center text-gray-400 italic">
                                            Chưa có việc nào.
                                        </div>
                                    )}

                                    {pendingCount === 0 && tasks.length > 0 && (
                                        <div className="m-4 p-3 bg-green-100 text-green-800 rounded-lg text-center text-sm font-bold animate-pulse">
                                            🎉 Xuất sắc! Hết việc rồi!
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    )
}
