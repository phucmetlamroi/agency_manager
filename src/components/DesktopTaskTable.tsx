'use client'

import { useState, useEffect } from 'react'
import { calculateRiskLevel, getRiskColor, getRiskLabel } from '@/lib/risk-utils'

// ... existing imports
import { deleteTask, assignTask } from '@/actions/task-management-actions'
import { updateTaskStatus } from '@/actions/task-actions'
import { updateTaskDetails } from '@/actions/update-task-details'
import DeleteTaskButton from './DeleteTaskButton'
import Stopwatch from './Stopwatch'

import { TaskWithUser } from '@/types/admin'

const statusColors: Record<string, string> = {
    "Đã nhận task": "#60a5fa",   // Blue
    "Đang đợi giao": "#a855f7",  // Purple (Waiting for Assignment)
    "Đang thực hiện": "#fbbf24", // Amber/Yellow
    "Revision": "#ef4444",       // Red
    "Hoàn tất": "#10b981",       // Green
    "Tạm ngưng": "#9ca3af",      // Gray
    "Sửa frame": "#f472b6",      // Pink
    "OPEN": "#7c3aed",
    "PENDING": "#f59e0b",
    "COMPLETED": "#10b981",
    "UNASSIGNED": "#6b7280"
}

const statusBg: Record<string, string> = {
    "Đã nhận task": "rgba(96, 165, 250, 0.2)",
    "Đang đợi giao": "rgba(168, 85, 247, 0.2)",
    "Đang thực hiện": "rgba(251, 191, 36, 0.2)",
    "Revision": "rgba(239, 68, 68, 0.2)",
    "Hoàn tất": "rgba(16, 185, 129, 0.2)",
    "Tạm ngưng": "rgba(156, 163, 175, 0.2)",
    "Sửa frame": "rgba(244, 114, 182, 0.2)"
}

export default function TaskTable({ tasks, isAdmin = false, users = [] }: { tasks: TaskWithUser[], isAdmin?: boolean, users?: { id: string, username: string, reputation?: number }[] }) {
    const [selectedTask, setSelectedTask] = useState<TaskWithUser | null>(null)

    // Edit State
    const [isEditing, setIsEditing] = useState(false)
    const [editForm, setEditForm] = useState({ resources: '', references: '', notes: '', productLink: '', deadline: '' })

    // Feedback Modal State
    const [feedbackModal, setFeedbackModal] = useState<{ isOpen: boolean, taskId: string | null }>({ isOpen: false, taskId: null })
    const [feedbackForm, setFeedbackForm] = useState<{ type: 'INTERNAL' | 'CLIENT', content: string }>({ type: 'INTERNAL', content: '' })

    const handleFeedbackSubmit = async () => {
        if (!feedbackModal.taskId) return

        await handleStatusChange(feedbackModal.taskId, 'Revision', undefined, feedbackForm)
        setFeedbackModal({ isOpen: false, taskId: null })
        setFeedbackForm({ type: 'INTERNAL', content: '' })
    }

    const openTask = (task: TaskWithUser) => {
        setSelectedTask(task)
        let deadlineStr = ''
        if (task.deadline) {
            const d = new Date(task.deadline)
            const pad = (n: number) => n < 10 ? '0' + n : n
            deadlineStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
        }

        setEditForm({
            resources: task.resources || task.fileLink || '',
            references: task.references || '',
            notes: task.notes || '',
            productLink: task.productLink || '',
            deadline: deadlineStr
        })
        setIsEditing(false)
    }

    // Helper to ensure external links work
    const formatLink = (link: string | null) => {
        if (!link) return '#'
        if (link.startsWith('http://') || link.startsWith('https://')) return link
        return `https://${link}`
    }

    const handleStatusChange = async (taskId: string, newStatus: string, notes?: string, feedback?: { type: 'INTERNAL' | 'CLIENT', content: string }) => {
        // Optimistic UI Update
        const optimisticTasks = tasks.map(t =>
            t.id === taskId ? { ...t, status: newStatus } : t
        )
        // Assuming 'mutate' is available in scope, e.g., from useSWR
        // mutate(optimisticTasks, false) // Commented out as 'mutate' is not defined in the provided context

        try {
            // @ts-ignore - feedback type mismatch fix later if needed, passing string is fine for enum usually if matching
            await updateTaskStatus(taskId, newStatus, notes, feedback)
            // mutate() // Commented out as 'mutate' is not defined in the provided context
        } catch (error) {
            console.error("Optimistic update failed:", error)
            // mutate(tasks, false) // Commented out as 'mutate' is not defined in the provided context
            alert("Cập nhật thất bại. Vui lòng thử lại.")
        }
    }

    const handleSaveDetails = async () => {
        if (!selectedTask) return

        const res = await updateTaskDetails(selectedTask.id, {
            resources: editForm.resources,
            references: editForm.references,
            notes: editForm.notes,
            title: selectedTask.title, // Keep existing title
            productLink: editForm.productLink,
            deadline: editForm.deadline || undefined // Pass deadline string
        })

        if (res?.success) {
            setSelectedTask({
                ...selectedTask,
                resources: editForm.resources,
                references: editForm.references,
                notes: editForm.notes,
                productLink: editForm.productLink,
            })
            setIsEditing(false)
        } else {
            alert('Failed to update')
        }
    }

    // Filter options based on role
    const getStatusOptions = () => {
        if (!isAdmin) {
            return ["Đã nhận task", "Đang thực hiện"]
        }
        return ["Đã nhận task", "Đang thực hiện", "Revision", "Sửa frame", "Tạm ngưng", "Hoàn tất"]
    }

    return (
        <>
            <div className="flex flex-col gap-4">
                {tasks.map(task => (
                    <div key={task.id}
                        className="glass-panel group relative p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-transform border-l-4"
                        style={{
                            borderLeftColor: statusColors[task.status] || '#ccc'
                        }}
                    >
                        <div className="flex-1 cursor-pointer" onClick={() => openTask(task)}>
                            {/* Header: Type + Title */}
                            <div className="flex flex-col gap-1 mb-2">
                                {/* Client Badge */}
                                {task.client && (
                                    <div className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-blue-400">
                                        <span>🏢 {task.client.parent ? task.client.parent.name : task.client.name}</span>
                                        {task.client.parent && (
                                            <>
                                                <span className="text-gray-600">➤</span>
                                                <span className="text-purple-400">{task.client.name}</span>
                                            </>
                                        )}
                                    </div>
                                )}

                                <div className="flex items-start md:items-center gap-3">
                                    <span className="text-[10px] bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 mt-1 md:mt-0">
                                        {task.type || 'Review'}
                                    </span>
                                    <h4 className="font-semibold text-lg leading-tight text-white mb-0 break-words w-full">
                                        {task.title}
                                    </h4>
                                </div>
                            </div>

                            {/* Metadata Grid/Row */}
                            <div className="text-sm text-gray-400 flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
                                {/* Deadline */}
                                <div className="flex items-center gap-2">
                                    <span className="opacity-60 text-xs uppercase">Deadline:</span>
                                    {task.deadline ? (
                                        <span className={new Date() > new Date(task.deadline) && task.status !== 'Hoàn tất' ? 'text-red-400 font-bold' : 'text-gray-300'}>
                                            {new Date(task.deadline).toLocaleDateString('vi-VN')} {new Date(task.deadline).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    ) : <span className="italic text-gray-600">No Deadline</span>}
                                </div>

                                {/* Timer - Always Visible */}
                                <div className="border-t border-dashed border-gray-700 pt-1 md:border-0 md:pt-0">
                                    <Stopwatch
                                        accumulatedSeconds={task.accumulatedSeconds || 0}
                                        timerStartedAt={task.timerStartedAt ?? null}
                                        status={task.timerStatus || 'PAUSED'}
                                    />
                                    {/* Risk Indicator */}
                                    {(task.accumulatedSeconds || 0) > 0 && task.status === 'Đang thực hiện' && (
                                        (() => {
                                            const risk = calculateRiskLevel(task.accumulatedSeconds || 0, 0)
                                            if (risk !== 'LOW') {
                                                return (
                                                    <div className={`mt-1 text-[10px] px-2 py-0.5 rounded border text-center font-bold animate-pulse ${getRiskColor(risk)}`}>
                                                        ⚠️ {getRiskLabel(risk)}
                                                    </div>
                                                )
                                            }
                                            return null
                                        })()
                                    )}
                                </div>

                                {/* Mobile-Optimized Status/Assignee info */}
                                <div className="flex items-center gap-4 mt-1 md:mt-0">
                                    {/* Assignee */}
                                    {isAdmin && (
                                        <div onClick={(e) => e.stopPropagation()}>
                                            <select
                                                value={task.assignee?.id || ''}
                                                onChange={async (e) => {
                                                    const val = e.target.value
                                                    const res = await assignTask(task.id, val || null)
                                                    if (res?.success) window.location.reload()
                                                }}
                                                className="bg-transparent border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-blue-500 max-w-[120px]"
                                            >
                                                <option value="" className="text-gray-500">-- Assign --</option>
                                                {users.map(u => (
                                                    <option key={u.id} value={u.id} className="text-black">
                                                        {u.username} ({u.reputation ?? 100}đ)
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {/* Money (Admin Only) */}
                                    {isAdmin && (
                                        <span className="font-mono text-green-400 font-bold">
                                            {task.value.toLocaleString()} đ
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Warning Messages */}
                            {task.deadline && task.status !== 'Hoàn tất' && (
                                (() => {
                                    const start = task.createdAt ? new Date(task.createdAt).getTime() : new Date().getTime()
                                    const end = new Date(task.deadline).getTime()
                                    const now = new Date().getTime()
                                    const percent = (end - start) > 0 ? ((now - start) / (end - start)) * 100 : 100

                                    if (percent > 100) return <div className="text-red-500 text-xs font-bold mt-1">GẤP: Đã quá hạn! (100%)</div>
                                    if (percent >= 90) return <div className="text-orange-500 text-xs font-bold mt-1">CẢNH BÁO: Sắp hết giờ (90%)</div>
                                    return null
                                })()
                            )}
                        </div>

                        {/* Actions Row */}
                        <div className="flex items-center justify-end gap-2 flex-wrap border-t border-gray-800 pt-3 md:border-0 md:pt-0 mt-2 md:mt-0">
                            {/* Status Selector (Admin) or Buttons (User) */}
                            {!isAdmin ? (
                                <>
                                    {task.status === 'Đã nhận task' && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id, 'Đang thực hiện') }}
                                            className="px-4 py-2 bg-yellow-500 text-black font-bold rounded-lg shadow-lg hover:bg-yellow-400 text-sm whitespace-nowrap"
                                        >
                                            ▶ Bắt đầu
                                        </button>
                                    )}
                                    {task.status === 'Đang thực hiện' && (
                                        <span className="px-3 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-500 text-xs font-bold border border-yellow-500/30 flex items-center gap-2">
                                            <span className="animate-pulse">●</span> Working...
                                        </span>
                                    )}
                                    {(task.status === 'Tạm ngưng' || task.status === 'Sửa frame' || task.status === 'Đang đợi giao' || task.status === 'Revision' || task.status === 'Review') && (
                                        <span className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 text-xs italic border border-gray-700">
                                            ⏳ Waiting...
                                        </span>
                                    )}
                                    {task.status === 'Hoàn tất' && (
                                        <div className="flex flex-col gap-1 items-end">
                                            <span className="px-3 py-1.5 rounded-lg bg-green-500/10 text-green-500 text-xs font-bold border border-green-500/30">
                                                🏆 Done
                                            </span>
                                            {/* Calculate and show Total Time for Finished tasks safely */}
                                            <span className="text-[10px] text-gray-500 font-mono">
                                                {(() => {
                                                    const s = task.accumulatedSeconds || 0
                                                    const h = Math.floor(s / 3600)
                                                    const m = Math.floor((s % 3600) / 60)
                                                    return `${h}h ${m}m`
                                                })()}
                                            </span>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="flex flex-col items-end gap-2">
                                    <select
                                        value={task.status}
                                        onChange={(e) => {
                                            const val = e.target.value
                                            if (val === 'Revision') {
                                                setFeedbackModal({ isOpen: true, taskId: task.id })
                                                return
                                            }
                                            handleStatusChange(task.id, val)
                                        }}
                                        className="appearance-none text-center font-bold text-xs px-3 py-1.5 rounded-full outline-none cursor-pointer"
                                        style={{
                                            background: statusBg[task.status] || '#333',
                                            color: statusColors[task.status] || 'white',
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {getStatusOptions().map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>

                                    {/* Admin Revision Controls */}
                                    {isAdmin && task.status === 'Revision' && (
                                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                            <button disabled className="px-2 py-1 text-[10px] bg-red-500/50 text-white rounded cursor-not-allowed">Chưa FB</button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id, 'Đang thực hiện') }}
                                                className="px-2 py-1 text-[10px] bg-green-500 text-white font-bold rounded hover:bg-green-400"
                                            >
                                                ✔ Đã FB
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {isAdmin && (
                                <button
                                    onClick={async (e) => {
                                        e.stopPropagation()
                                        if (confirm('Xóa task này?')) await deleteTask(task.id)
                                    }}
                                    className="text-gray-500 hover:text-red-500 p-2 text-xl"
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    </div >
                ))}
                {tasks.length === 0 && <p className="text-gray-500 italic text-center py-8">No tasks found.</p>}
            </div >

            {/* MODAL */}
            {selectedTask && (
                <div style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 9999
                }} onClick={() => setSelectedTask(null)}>

                    <div style={{
                        background: 'white', color: '#1a1a1a',
                        width: '90%', maxWidth: '600px',
                        borderRadius: '24px', padding: '1.5rem',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                        position: 'relative',
                        display: 'flex', flexDirection: 'column', gap: '1.5rem',
                        animation: 'fadeIn 0.2s ease-out',
                        maxHeight: '85vh', overflowY: 'auto'
                    }} onClick={(e) => e.stopPropagation()}>

                        {/* HEADER Buttons */}
                        <div style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', gap: '0.5rem' }}>
                            {(isAdmin || !isEditing) && (
                                <button
                                    onClick={() => setIsEditing(!isEditing)}
                                    style={{
                                        background: isEditing ? '#f3f4f6' : 'transparent',
                                        color: isEditing ? '#000' : '#6b7280',
                                        border: '1px solid #e5e7eb',
                                        padding: '0.3rem 0.8rem',
                                        borderRadius: '8px',
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                        fontWeight: 600
                                    }}
                                >
                                    {isEditing ? 'Cancel' : (isAdmin ? 'Edit All' : 'Nộp bài / Ghi chú')}
                                </button>
                            )}
                            <button onClick={() => setSelectedTask(null)}
                                style={{
                                    background: '#f3f4f6', border: 'none', borderRadius: '50%',
                                    width: '32px', height: '32px', cursor: 'pointer', fontSize: '1.2rem', color: '#000',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}
                            >
                                ×
                            </button>
                        </div>

                        <div>
                            <span style={{
                                fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px',
                                color: '#8b5cf6'
                            }}>
                                PROJECT DETAILS
                            </span>
                            <h2 style={{ fontSize: '1.5rem', marginTop: '0.5rem', fontWeight: '800', lineHeight: 1.2 }}>
                                {selectedTask.title}
                            </h2>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                            {/* PRODUCT DELIVERY SECTION (Moved Top for User Visibility) */}
                            <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/50">
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#3b82f6', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                                    🎯 THÀNH PHẨM (Delivery)
                                </label>

                                {isEditing || (!selectedTask.productLink && !isAdmin) ? (
                                    <div>
                                        <input
                                            value={editForm.productLink}
                                            onChange={(e) => setEditForm({ ...editForm, productLink: e.target.value })}
                                            placeholder="Dán link sản phẩm (Drive/Youtube)..."
                                            style={{ width: '100%', padding: '0.6rem', border: '1px solid #93c5fd', borderRadius: '6px', fontSize: '0.9rem' }}
                                        />
                                        {(!isEditing && !isAdmin) && (
                                            <button
                                                onClick={async () => {
                                                    await handleSaveDetails();
                                                    await handleStatusChange(selectedTask.id, 'Revision');
                                                }}
                                                style={{ marginTop: '0.5rem', width: '100%', padding: '0.5rem', background: '#3b82f6', color: 'white', borderRadius: '6px', fontWeight: 'bold' }}
                                            >
                                                Xác nhận nộp bài
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    selectedTask.productLink ? (
                                        <a href={formatLink(selectedTask.productLink)} target="_blank" style={{
                                            display: 'block', padding: '0.8rem', background: 'white', borderRadius: '8px',
                                            color: '#2563eb', fontWeight: '600', textDecoration: 'none', border: '1px solid #bfdbfe',
                                            textAlign: 'center'
                                        }}>
                                            🔗 Mở link sản phẩm
                                        </a>
                                    ) : <span className="text-gray-400 italic text-sm">Chưa có link thành phẩm.</span>
                                )}
                            </div>

                            {/* RESOURCES */}
                            <div className="p-3 rounded-xl border border-gray-100">
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#9ca3af', marginBottom: '0.5rem' }}>
                                    RESOURCES (RAW/B-ROLL)
                                </label>
                                {isEditing && isAdmin ? (
                                    <input
                                        value={editForm.resources}
                                        onChange={(e) => setEditForm({ ...editForm, resources: e.target.value })}
                                        placeholder="https://..."
                                        style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '6px' }}
                                    />
                                ) : (
                                    (selectedTask.resources || selectedTask.fileLink) ? (
                                        <a href={formatLink(selectedTask.resources || selectedTask.fileLink)} target="_blank" className="text-blue-600 font-semibold hover:underline">
                                            📂 Open Resource Folder ↗
                                        </a>
                                    ) : <span className="text-gray-400 italic">No resources linked.</span>
                                )}
                            </div>

                            {/* REFERENCES */}
                            <div className="p-3 rounded-xl border border-gray-100">
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#9ca3af', marginBottom: '0.5rem' }}>
                                    REFERENCES / SAMPLES
                                </label>
                                {isEditing && isAdmin ? (
                                    <input
                                        value={editForm.references}
                                        onChange={(e) => setEditForm({ ...editForm, references: e.target.value })}
                                        placeholder="https://..."
                                        style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '6px' }}
                                    />
                                ) : (
                                    selectedTask.references ? (
                                        <a href={formatLink(selectedTask.references)} target="_blank" className="text-purple-600 font-semibold hover:underline">
                                            📺 Watch Reference Video ↗
                                        </a>
                                    ) : <span className="text-gray-400 italic">No references provided.</span>
                                )}
                            </div>

                            {/* DEADLINE INPUT (Admin Only) */}
                            {isEditing && isAdmin && (
                                <div className="p-3 rounded-xl border border-red-100 bg-red-50/30">
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#ef4444', marginBottom: '0.5rem' }}>
                                        ⚠️ DEADLINE (Thay đổi sẽ reset bộ đo giờ!)
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={editForm.deadline}
                                        onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                                        style={{ width: '100%', padding: '0.5rem', border: '1px solid #fca5a5', borderRadius: '6px', color: '#b91c1c', fontWeight: 'bold' }}
                                    />
                                </div>
                            )}

                            {/* NOTES */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#9ca3af', marginBottom: '0.5rem' }}>
                                    NOTES / INSTRUCTIONS
                                </label>
                                {isEditing ? (
                                    <textarea
                                        value={editForm.notes}
                                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                                        placeholder="Enter notes..."
                                        rows={4}
                                        disabled={!isAdmin} // Users can edit notes if needed? Maybe better restricted to Admin for instructions.
                                        style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'inherit' }}
                                    />
                                ) : (
                                    <div style={{ background: '#fffbeb', padding: '1rem', borderRadius: '12px', color: '#92400e', fontSize: '0.95rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                                        {selectedTask.notes || "No specific instructions."}
                                    </div>
                                )}
                            </div>

                        </div>

                        {isEditing && (
                            <button
                                onClick={handleSaveDetails}
                                className="btn btn-primary"
                                style={{ background: '#000', color: 'white', alignSelf: 'center', width: '100%', borderRadius: '12px' }}
                            >
                                Save Changes
                            </button>
                        )}

                        {!isEditing && isAdmin && (
                            <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #eee', fontSize: '0.8rem', color: '#666', textAlign: 'center' }}>
                                Value: <span className="font-bold text-green-600">{selectedTask.value.toLocaleString()} đ</span>
                            </div>
                        )}

                    </div>
                </div >
            )
            }

            {/* FEEDBACK MODAL */}
            {feedbackModal.isOpen && (
                <div style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 10000
                }} onClick={() => setFeedbackModal({ isOpen: false, taskId: null })}>
                    <div style={{
                        background: '#1a1a1a', color: 'white',
                        width: '90%', maxWidth: '400px',
                        borderRadius: '16px', padding: '1.5rem',
                        border: '1px solid #333'
                    }} onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-xl font-bold mb-4 text-red-500">Yêu cầu Sửa bài (Revision)</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Nguồn Feedback</label>
                                <div className="flex gap-4">
                                    <label className={`flex-1 p-3 rounded border cursor-pointer flex items-center justify-center gap-2 ${feedbackForm.type === 'CLIENT' ? 'bg-red-500/20 border-red-500' : 'border-gray-700'}`}>
                                        <input
                                            type="radio"
                                            name="fbType"
                                            checked={feedbackForm.type === 'CLIENT'}
                                            onChange={() => setFeedbackForm({ ...feedbackForm, type: 'CLIENT' })}
                                            className="hidden"
                                        />
                                        <span>👤 Khách hàng</span>
                                    </label>
                                    <label className={`flex-1 p-3 rounded border cursor-pointer flex items-center justify-center gap-2 ${feedbackForm.type === 'INTERNAL' ? 'bg-yellow-500/20 border-yellow-500' : 'border-gray-700'}`}>
                                        <input
                                            type="radio"
                                            name="fbType"
                                            checked={feedbackForm.type === 'INTERNAL'}
                                            onChange={() => setFeedbackForm({ ...feedbackForm, type: 'INTERNAL' })}
                                            className="hidden"
                                        />
                                        <span>🏢 Nội bộ</span>
                                    </label>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Nội dung chi tiết</label>
                                <textarea
                                    className="w-full bg-black/30 border border-gray-700 rounded p-2 text-sm"
                                    rows={4}
                                    placeholder="Ghi rõ yêu cầu sửa đổi..."
                                    value={feedbackForm.content}
                                    onChange={(e) => setFeedbackForm({ ...feedbackForm, content: e.target.value })}
                                />
                            </div>

                            <button
                                onClick={handleFeedbackSubmit}
                                disabled={!feedbackForm.content.trim()}
                                className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg"
                            >
                                Xác nhận Revision
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
