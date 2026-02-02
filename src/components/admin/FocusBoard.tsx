'use client'

import { useState, useEffect } from 'react'
import { createFocusTask, deleteFocusTask, toggleFocusPriority, swapFocusOrder, publishFocusTasks, getFocusTasks } from '@/actions/focus-actions'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

// Simple Sortable List without complex DnD lib for reliability in this environment
// We can use simple Up/Down or simple HTML5 drag if needed.
// Let's try simple Up/Down first but styled "Fast".

export default function FocusBoard({ userId }: { userId: string }) {
    const [tasks, setTasks] = useState<any[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        loadTasks()
    }, [userId])

    async function loadTasks() {
        const res = await getFocusTasks(userId)
        // Sort by order
        // Filter out completed? Maybe show them at bottom?
        // Prompt says "Admin cần một nơi thao tác cực nhanh để giao việc đầu ngày".
        // Likely we show pending tasks.
        setTasks(res.filter((t: any) => !t.isDone))
    }

    async function handleAdd(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter' && input.trim()) {
            // Optimistic
            const tempId = 'temp-' + Date.now()
            const newTask = { id: tempId, content: input, isPriority: false, status: 'DRAFT', order: tasks.length }
            setTasks([...tasks, newTask])
            setInput('')

            await createFocusTask(userId, input)
            loadTasks()
        }
    }

    async function handlePublish() {
        setLoading(true)
        await publishFocusTasks(userId)
        await loadTasks()
        setLoading(false)
        toast.success('Đã Chốt Sổ! Editor sẽ thấy việc ngay.')
    }

    async function move(index: number, direction: -1 | 1) {
        if (index + direction < 0 || index + direction >= tasks.length) return

        const newTasks = [...tasks]
        const temp = newTasks[index]
        newTasks[index] = newTasks[index + direction]
        newTasks[index + direction] = temp

        // Update order fields
        newTasks.forEach((t, i) => t.order = i)
        setTasks(newTasks)

        // Sync to server
        const updates = newTasks.map((t, i) => ({ id: t.id, order: i }))
        // Filter out temps
        const validUpdates = updates.filter(u => !u.id.startsWith('temp-'))
        await swapFocusOrder(validUpdates)
    }

    return (
        <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <div>
                    <h3 className="font-bold text-gray-800">Bảng Điều Phối (Dispatch Board)</h3>
                    <p className="text-xs text-gray-500">Giao việc tập trung cho Editor</p>
                </div>
                <button
                    onClick={handlePublish}
                    disabled={loading}
                    className="px-4 py-2 bg-black text-white text-sm font-bold rounded-lg hover:bg-gray-800 transition-colors shadow-lg flex items-center gap-2"
                >
                    {loading ? 'Processing...' : '🚀 Chốt Sổ'}
                </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                <AnimatePresence>
                    {tasks.map((task, index) => (
                        <motion.div
                            key={task.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            layout
                            className={`
                                group flex items-center gap-3 p-3 rounded-lg border 
                                ${task.isPriority ? 'bg-red-50 border-red-200 ring-1 ring-red-100' : 'bg-white border-gray-200 hover:border-gray-300'}
                                ${task.status === 'PUBLISHED' ? 'opacity-70 grayscale-[0.3]' : ''}
                                transition-all
                            `}
                        >
                            {/* Drag Handle Substitute (Up/Down) */}
                            <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => move(index, -1)} className="text-gray-400 hover:text-black leading-none">▲</button>
                                <button onClick={() => move(index, 1)} className="text-gray-400 hover:text-black leading-none">▼</button>
                            </div>

                            {/* Content */}
                            <div className="flex-1">
                                <span className={`font-medium ${task.isPriority ? 'text-red-700' : 'text-gray-700'}`}>
                                    {task.content}
                                </span>
                                {task.status === 'PUBLISHED' && <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-1 rounded uppercase">Published</span>}
                            </div>

                            {/* Actions */}
                            <button
                                onClick={async () => {
                                    // Optimistic
                                    const newTasks = [...tasks]
                                    newTasks[index].isPriority = !newTasks[index].isPriority
                                    setTasks(newTasks)
                                    await toggleFocusPriority(task.id)
                                }}
                                className={`p-1.5 rounded-md transition-colors ${task.isPriority ? 'text-red-500 bg-red-100' : 'text-gray-300 hover:text-red-400 hover:bg-gray-100'}`}
                                title="Ưu tiên tối thượng"
                            >
                                🔥
                            </button>

                            <button
                                onClick={async () => {
                                    setTasks(tasks.filter(t => t.id !== task.id))
                                    await deleteFocusTask(task.id)
                                }}
                                className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-gray-100 rounded-md transition-colors"
                            >
                                ×
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {tasks.length === 0 && (
                    <div className="text-center py-10 text-gray-400 italic text-sm border-2 border-dashed border-gray-100 rounded-xl">
                        Chưa có việc nào. Nhập bên dưới để giao việc! ✨
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-gray-100 bg-white">
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleAdd}
                    placeholder="Gõ nội dung việc -> Enter (xuống dòng thêm mới)..."
                    className="w-full p-3 bg-gray-50 border-none rounded-xl text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-black/5 outline-none font-medium"
                    autoFocus
                />
            </div>
        </div>
    )
}
