'use client'

import { useState, useEffect } from 'react'
import { createFocusTask, deleteFocusTask, toggleFocusPriority, swapFocusOrder, publishFocusTasks, getFocusTasks } from '@/actions/focus-actions'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Sortable Item Component
function SortableItem({ task, onDelete, onTogglePriority }: { task: any, onDelete: (id: string) => void, onTogglePriority: (id: string) => void }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: task.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.5 : 1
    }

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="touch-none mb-2">
            <div className={`
                relative flex items-center gap-3 p-3 rounded-lg border shadow-sm select-none
                ${task.isPriority ? 'bg-red-50 border-red-200 ring-1 ring-red-100' : 'bg-white border-gray-200'}
                ${task.isDone ? 'bg-green-50 border-green-200 ring-1 ring-green-100' : ''}
                ${task.status === 'PUBLISHED' && !task.isDone ? 'opacity-90' : ''}
                hover:border-gray-400 transition-all cursor-grab active:cursor-grabbing
            `}>
                {/* Drag Handle Icon */}
                <span className="text-gray-300 text-xl">⋮⋮</span>

                <div className="flex-1">
                    <span className={`font-medium 
                        ${task.isDone ? 'text-green-700 line-through decoration-green-500/50' : task.isPriority ? 'text-red-700' : 'text-gray-700'}
                    `}>
                        {task.content}
                    </span>
                    <div className="flex gap-2 text-[10px] mt-1">
                        {task.status === 'PUBLISHED' && <span className="bg-gray-100 text-gray-500 px-1 rounded uppercase">Published</span>}
                        {task.isDone && <span className="bg-green-100 text-green-700 px-1 rounded uppercase font-bold">DONE</span>}
                    </div>
                </div>

                <button
                    onPointerDown={(e) => { e.stopPropagation() }} // Prevent drag start
                    onClick={(e) => {
                        e.stopPropagation()
                        onTogglePriority(task.id)
                    }}
                    className={`p-1.5 rounded-md transition-colors ${task.isPriority ? 'text-red-500 bg-red-100' : 'text-gray-300 hover:text-red-400 hover:bg-gray-100'}`}
                    title="Ưu tiên tối thượng"
                >
                    🔥
                </button>

                <button
                    onPointerDown={(e) => { e.stopPropagation() }} // Prevent drag start
                    onClick={(e) => {
                        e.stopPropagation()
                        onDelete(task.id)
                    }}
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-gray-100 rounded-md transition-colors"
                >
                    ×
                </button>
            </div>
        </div>
    )
}

export default function FocusBoard({ userId }: { userId: string }) {
    const [tasks, setTasks] = useState<any[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [activeId, setActiveId] = useState<string | null>(null)

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    useEffect(() => {
        loadTasks()
    }, [userId])

    async function loadTasks() {
        const res = await getFocusTasks(userId)
        // Show ALL tasks for Admin to manage, or maybe filter out very old ones?
        // Prompt implies showing what the user sees + what is done.
        // Let's keep all for now to be safe, logic can be refined.
        setTasks(res)
    }

    async function handleAdd(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter' && input.trim()) {
            const tempId = 'temp-' + Date.now()
            const newTask = { id: tempId, content: input, isPriority: false, status: 'DRAFT', isDone: false, order: tasks.length }
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

    function handleDragStart(event: any) {
        setActiveId(event.active.id)
    }

    async function handleDragEnd(event: any) {
        const { active, over } = event

        if (active.id !== over.id) {
            setTasks((items) => {
                const oldIndex = items.findIndex(t => t.id === active.id)
                const newIndex = items.findIndex(t => t.id === over.id)

                const newItems = arrayMove(items, oldIndex, newIndex)

                // Sync to Server
                const updates = newItems.map((t, i) => ({ id: t.id, order: i }))
                // Filter out temps if any
                const validUpdates = updates.filter(u => !u.id.startsWith('temp-'))
                swapFocusOrder(validUpdates)

                return newItems
            })
        }
        setActiveId(null)
    }

    return (
        <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <div>
                    <h3 className="font-bold text-gray-800">Bảng Điều Phối (Dispatch Board)</h3>
                    <p className="text-xs text-gray-500">Kéo thả để sắp xếp • Việc xanh là Đã xong</p>
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
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={tasks.map(t => t.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {tasks.map((task) => (
                            <SortableItem
                                key={task.id}
                                task={task}
                                onDelete={async (id) => {
                                    setTasks(tasks.filter(t => t.id !== id))
                                    await deleteFocusTask(id)
                                }}
                                onTogglePriority={async (id) => {
                                    const newTasks = [...tasks]
                                    const t = newTasks.find(x => x.id === id)
                                    if (t) t.isPriority = !t.isPriority
                                    setTasks(newTasks)
                                    await toggleFocusPriority(id)
                                }}
                            />
                        ))}
                    </SortableContext>

                    {/* Drag Overlay for smooth animation */}
                    <DragOverlay>
                        {activeId ? (
                            <div className="p-3 bg-white rounded-lg border border-blue-500 shadow-xl opacity-90 scale-105 cursor-grabbing">
                                <span className="font-medium text-gray-800">
                                    {tasks.find(t => t.id === activeId)?.content}
                                </span>
                            </div>
                        ) : null}
                    </DragOverlay>
                </DndContext>

                {tasks.length === 0 && (
                    <div className="text-center py-10 text-gray-400 italic text-sm border-2 border-dashed border-gray-200 rounded-xl bg-white">
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
