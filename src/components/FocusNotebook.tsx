'use client'

import { useState, useEffect } from 'react'
import { getFocusTasks, completeFocusTask } from '@/actions/focus-actions'
import confetti from 'canvas-confetti'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
// @ts-ignore
import useSWR from 'swr' // Assuming we might want polling later, but likely manual refresh or polling hook if available. I'll stick to useEffect for now or simple interval.

// Reward Messages
const REWARDS = [
    "Đỉnh của chóp! Bạn đã 'phá đảo' hết task hôm nay rồi! 🚀",
    "Mission Complete! Về nhà thôi, 'chiến thần' chạy deadline ơi! 🎮",
    "Sạch bách! Không còn một hạt bụi task nào. Uy tín quá! ✨",
    "10 điểm không có nhưng! Làm ly trà sữa tự thưởng thôi. 🧋",
    "Tuyệt vời ông mặt trời! Năng suất vô cực! ☀️",
    "Xong hết rồi? Bạn là Flash à? ⚡",
    "Respect! Deadline đã bị tiêu diệt hoàn toàn. 🫡",
    "Quá dữ! Team tự hào về bạn. 🥰",
    "Hết việc rồi, chill thôi! 🎵",
    "Siuuuuu! Chiến thắng huy hoàng! ⚽"
]

export default function FocusNotebook({ userId }: { userId: string }) {
    const [tasks, setTasks] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [showReward, setShowReward] = useState(false)
    const [rewardMsg, setRewardMsg] = useState('')

    useEffect(() => {
        loadTasks()
        const interval = setInterval(loadTasks, 15000) // Poll every 15s for new published tasks
        return () => clearInterval(interval)
    }, [userId])

    async function loadTasks() {
        const res = await getFocusTasks(userId)
        // Only show PUBLISHED + Not Done
        const active = res.filter((t: any) => t.status === 'PUBLISHED' && !t.isDone)
        setTasks(active)
        setLoading(false)
    }

    async function handleComplete(task: any) {
        // Optimistic Remove
        const remaining = tasks.filter(t => t.id !== task.id)
        setTasks(remaining)

        // API
        await completeFocusTask(task.id)

        // Check if cleared
        if (remaining.length === 0) {
            triggerReward()
        }
    }

    function triggerReward() {
        setShowReward(true)
        setRewardMsg(REWARDS[Math.floor(Math.random() * REWARDS.length)])

        // Fire Confetti
        const duration = 3000
        const end = Date.now() + duration

        const frame = () => {
            confetti({
                particleCount: 5,
                angle: 60,
                spread: 55,
                origin: { x: 0 },
                colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00']
            })
            confetti({
                particleCount: 5,
                angle: 120,
                spread: 55,
                origin: { x: 1 },
                colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00']
            })

            if (Date.now() < end) {
                requestAnimationFrame(frame)
            }
        }
        frame()
    }

    if (loading) return <div className="p-10 text-center text-gray-400">Loading your notebook...</div>

    // Empty State (Before Reward or just empty)
    if (tasks.length === 0 && !showReward) return (
        <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-400">
            <div className="text-4xl mb-4 opacity-50">🧘</div>
            <p>Trống trơn! Chưa có Focus Task nào được giao.</p>
            <p className="text-xs mt-2">Đợi Admin "Chốt Sổ" nhé...</p>
        </div>
    )

    // Reward State
    if (showReward) return (
        <div className="h-full flex flex-col items-center justify-center text-center p-8 animate-in fade-in zoom-in duration-500">
            <div className="text-6xl mb-6 animate-bounce">🏆</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-4">{rewardMsg}</h2>
            <button
                onClick={() => setShowReward(false)}
                className="text-sm text-gray-400 hover:text-gray-600 underline"
            >
                Quay lại màn hình chính
            </button>
        </div>
    )

    const heroTask = tasks[0]
    const nextTasks = tasks.slice(1)

    return (
        <div className="h-full bg-[#fdfbf7] p-6 relative overflow-hidden font-handwriting shadow-inner rounded-xl border border-[#e5e0d8]">
            {/* Background Lines */}
            <div className="absolute inset-0 pointer-events-none opacity-10"
                style={{
                    backgroundImage: 'linear-gradient(#999 1px, transparent 1px)',
                    backgroundSize: '100% 2rem',
                    marginTop: '2rem'
                }}
            />
            {/* Red Margin Line */}
            <div className="absolute top-0 bottom-0 left-12 w-px bg-red-200/50 pointer-events-none" />

            <div className="relative z-10 max-w-2xl mx-auto h-full flex flex-col">
                <h2 className="text-2xl font-bold text-gray-800 mb-8 pl-8 font-serif italic opacity-70">
                    Focus Notebook 📝
                </h2>

                {/* Hero Task */}
                <div className="mb-12 pl-8">
                    <p className="text-sm text-gray-400 uppercase tracking-widest mb-2 font-sans font-bold">
                        Việc Số 1 (Làm ngay!)
                    </p>
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        key={heroTask.id}
                        className={`
                            relative p-6 rounded-xl border-2 shadow-xl bg-white
                            ${heroTask.isPriority ? 'border-orange-400 shadow-orange-100 ring-4 ring-orange-50' : 'border-gray-800 shadow-gray-200'}
                        `}
                    >
                        {heroTask.isPriority && (
                            <div className="absolute -top-3 -right-3 bg-orange-500 text-white p-2 rounded-full shadow-lg animate-pulse">
                                🔥 Focus!
                            </div>
                        )}

                        <div className="flex items-start gap-4">
                            <button
                                onClick={() => handleComplete(heroTask)}
                                className="mt-1 w-8 h-8 rounded-full border-2 border-gray-300 hover:border-green-500 hover:bg-green-50 transition-all flex items-center justify-center group"
                            >
                                <div className="w-4 h-4 rounded-full bg-green-500 scale-0 group-hover:scale-100 transition-transform" />
                            </button>
                            <span className="text-2xl font-bold text-gray-800 leading-tight">
                                {heroTask.content}
                            </span>
                        </div>
                    </motion.div>
                </div>

                {/* Upcoming Tasks */}
                <div className="flex-1 pl-8 opacity-60 hover:opacity-100 transition-opacity">
                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-4 font-sans font-bold">
                        Tiếp theo ({nextTasks.length})
                    </p>
                    <div className="space-y-3">
                        {nextTasks.slice(0, 3).map((task, i) => (
                            <motion.div
                                key={task.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className="flex items-center gap-3 p-3 bg-white/50 rounded-lg border border-transparent hover:border-gray-200"
                            >
                                <div className="w-4 h-4 rounded-full border border-gray-300" />
                                <span className="text-lg text-gray-600 font-medium truncate">
                                    {task.content}
                                </span>
                                {task.isPriority && <span>🔥</span>}
                            </motion.div>
                        ))}
                        {nextTasks.length > 3 && (
                            <p className="text-sm text-gray-400 italic">... và {nextTasks.length - 3} việc khác</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
