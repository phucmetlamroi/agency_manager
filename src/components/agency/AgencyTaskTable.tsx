'use client'

import { useState, useEffect } from 'react'
import { calculateRiskLevel, getRiskColor, getRiskLabel } from '@/lib/risk-utils'

// ... existing imports
import { assignTask } from '@/actions/task-management-actions'
import { updateTaskStatus } from '@/actions/task-actions'
import { updateTaskDetails } from '@/actions/update-task-details'
import Stopwatch from '@/components/Stopwatch'

import { TaskWithUser } from '@/types/admin'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { toast } from 'sonner'
import { checkUserAvailability } from '@/actions/schedule-actions'

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

// RENAMED PROP: 'users' -> 'members' to match calling code in Agency Page
export default function AgencyTaskTable({ tasks, members }: { tasks: TaskWithUser[], members: any[] }) {
    const { confirm } = useConfirm()
    const [selectedTask, setSelectedTask] = useState<TaskWithUser | null>(null)

    // Edit State
    const [isEditing, setIsEditing] = useState(false)
    const [isEditingLink, setIsEditingLink] = useState(false) // Local state for Product Link editing
    const [editForm, setEditForm] = useState({
        resources: '', // Kept for backward compatibility or direct access
        linkRaw: '',
        linkBroll: '',
        references: '',
        notes: '',
        productLink: '',
        deadline: '',
        jobPriceUSD: 0,
        value: 0,
        collectFilesLink: ''
    })

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

        // Parse Resources for RAW/BROLL
        let raw = ''
        let broll = ''
        const resString = task.resources || task.fileLink || ''

        if (resString.includes('RAW:') && resString.includes('| BROLL:')) {
            const parts = resString.split('| BROLL:')
            raw = parts[0].replace('RAW:', '').trim()
            broll = parts[1].trim()
        } else {
            // Fallback for old links -> treat as RAW or Generic
            raw = resString
        }

        setEditForm({
            resources: resString,
            linkRaw: raw,
            linkBroll: broll,
            references: task.references || '',
            notes: task.notes || '',
            productLink: task.productLink || '',
            deadline: deadlineStr,
            jobPriceUSD: task.jobPriceUSD || 0,
            value: task.value || 0,
            collectFilesLink: task.collectFilesLink || ''
        })
        setIsEditing(false)
        setIsEditingLink(false)
    }

    // Helper to ensure external links work
    const formatLink = (link: string | null) => {
        if (!link) return '#'
        if (link.startsWith('http://') || link.startsWith('https://')) return link
        return `https://${link}`
    }

    const handleStatusChange = async (taskId: string, newStatus: string, notes?: string, feedback?: { type: 'INTERNAL' | 'CLIENT', content: string }) => {
        try {
            // Find current task version for OL
            const task = tasks.find(t => t.id === taskId)
            const version = task?.version

            const result = await updateTaskStatus(taskId, newStatus, notes, feedback, version)

            if (result?.error) {
                toast.error(result.error)
                return
            }

            // Ideally revalidate or optimistic update
            // For now, let standard revalidation handling work or page reload
            toast.success("Trạng thái đã được cập nhật")
        } catch (error) {
            console.error("Update failed:", error)
            toast.error("Cập nhật thất bại. Vui lòng thử lại.")
        }
    }

    const handleSaveDetails = async () => {
        if (!selectedTask) return

        const combinedResources = (editForm.linkRaw || editForm.linkBroll)
            ? `RAW: ${editForm.linkRaw.trim()} | BROLL: ${editForm.linkBroll.trim()}`
            : editForm.resources

        // Agency Admin usually CANNOT edit financials or official deadlines, but they CAN edit notes/resources if needed for their team?
        // Let's allow editing Notes, Resources, ProductLink.
        // Block Financials/Deadline edits for now to be safe, or just ignore them.

        const res = await updateTaskDetails(selectedTask.id, {
            resources: combinedResources,
            references: editForm.references,
            notes: editForm.notes,
            title: selectedTask.title,
            productLink: editForm.productLink,
            collectFilesLink: editForm.collectFilesLink,
            // Exclude deadline/prices from Agency update
        })

        if (res?.success) {
            setSelectedTask({
                ...selectedTask,
                resources: combinedResources,
                references: editForm.references,
                notes: editForm.notes,
                productLink: editForm.productLink,
            })
            setIsEditing(false)
            toast.success('Đã cập nhật chi tiết task')
        } else {
            toast.error('Failed to update')
        }
    }

    // Agency Status Options
    const getStatusOptions = () => {
        return ["Đã nhận task", "Đang thực hiện", "Revision", "Sửa frame", "Tạm ngưng", "Hoàn tất"]
    }

    return (
        <>
            <div className="flex flex-col gap-4">
                {tasks.map(task => {
                    return (
                        <div key={task.id}
                            className="bg-[#1a1a1a] border border-white/5 p-4 rounded-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-transform border-l-4 group hover:border-blue-500/30"
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

                                    <div className="flex items-start md:items-center gap-3 relative">
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
                                    </div>

                                    {/* Assignee Control for Agency Manager */}
                                    <div className="flex items-center gap-4 mt-1 md:mt-0">
                                        <div onClick={(e) => e.stopPropagation()}>
                                            <select
                                                value={task.assignee?.id || ''}
                                                onChange={async (e) => {
                                                    const val = e.target.value
                                                    if (val) {
                                                        const res = await checkUserAvailability(val, new Date())
                                                        if (!res.available) {
                                                            if (!await confirm({
                                                                title: '⚠️ CẢNH BÁO LỊCH TRÌNH',
                                                                message: `Nhân sự này đang có lịch BẬN (Busy). Vẫn giao?`,
                                                                type: 'danger',
                                                                confirmText: 'Vẫn giao',
                                                                cancelText: 'Chọn người khác'
                                                            })) return
                                                        }
                                                    }
                                                    await assignTask(task.id, val || null)
                                                    toast.success('Đã cập nhật phân công')
                                                }}
                                                className="bg-transparent border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-blue-500 max-w-[120px]"
                                            >
                                                <option value="" className="text-gray-500">-- Assign --</option>
                                                {members.map(u => (
                                                    <option key={u.id} value={u.id} className="text-black">
                                                        {u.nickname || u.username}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Money (Visible to Agency Admin) */}
                                        <span className="font-mono text-green-400 font-bold">
                                            {task.value.toLocaleString()} đ
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Actions Row */}
                            <div className="flex items-center justify-end gap-2 flex-wrap border-t border-gray-800 pt-3 md:border-0 md:pt-0 mt-2 md:mt-0">
                                <div className="flex flex-col items-end gap-2">
                                    <select
                                        value={task.status}
                                        onChange={(e) => {
                                            const val = e.target.value
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
                                </div>
                            </div>
                        </div >
                    )
                })}
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
                        background: '#1a1a1a', color: 'white',
                        width: '90%', maxWidth: '600px',
                        borderRadius: '24px', padding: '1.5rem',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                        position: 'relative',
                        display: 'flex', flexDirection: 'column', gap: '1.5rem',
                        animation: 'fadeIn 0.2s ease-out',
                        maxHeight: '85vh', overflowY: 'auto',
                        border: '1px solid #333'
                    }} onClick={(e) => e.stopPropagation()}>

                        {/* HEADER Buttons */}
                        <div style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', gap: '0.5rem' }}>
                            <button
                                onClick={() => setIsEditing(!isEditing)}
                                style={{
                                    background: isEditing ? '#333' : 'transparent',
                                    color: isEditing ? '#fff' : '#6b7280',
                                    border: '1px solid #333',
                                    padding: '0.3rem 0.8rem',
                                    borderRadius: '8px',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    fontWeight: 600
                                }}
                            >
                                {isEditing ? 'Cancel' : 'Edit / Delivery'}
                            </button>

                            <button onClick={() => setSelectedTask(null)}
                                style={{
                                    background: '#333', border: 'none', borderRadius: '50%',
                                    width: '32px', height: '32px', cursor: 'pointer', fontSize: '1.2rem', color: '#fff',
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
                            {selectedTask.client && (
                                <div className="text-gray-400 text-sm mt-1">
                                    🏢 {selectedTask.client.parent?.name} ➤ {selectedTask.client.name}
                                    {selectedTask.project && ` | Project: ${selectedTask.project.name}`}
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                            {/* PRODUCT DELIVERY SECTION */}
                            <div className="p-4 rounded-xl border border-blue-900 bg-blue-900/10">
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#60a5fa', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                                    🎯 THÀNH PHẨM (Delivery)
                                </label>

                                {(!selectedTask.productLink) || isEditingLink ? (
                                    /* EDIT MODE */
                                    <div className="flex bg-[#111] rounded-md border border-blue-800 overflow-hidden">
                                        <input
                                            value={editForm.productLink}
                                            onChange={(e) => setEditForm({ ...editForm, productLink: e.target.value })}
                                            placeholder="Dán link sản phẩm (Drive/Youtube)..."
                                            className="flex-1 p-2 text-sm outline-none text-white bg-transparent"
                                        />
                                        <div className="flex border-l border-blue-800">
                                            <button
                                                onClick={async () => {
                                                    await handleSaveDetails();
                                                    await handleStatusChange(selectedTask.id, 'Revision'); // Auto move to Revision/Review on Submit
                                                    setIsEditingLink(false);
                                                }}
                                                className="px-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1 transition-colors"
                                            >
                                                <span>✓ Nộp</span>
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    /* VIEW MODE */
                                    selectedTask.productLink ? (
                                        <div className="flex flex-col gap-2">
                                            <a href={formatLink(selectedTask.productLink)} target="_blank" className="block p-3 bg-blue-900/20 rounded-lg border border-blue-500/30 text-blue-400 font-bold hover:bg-blue-900/40 transition-colors text-center">
                                                🔗 Mở link sản phẩm
                                            </a>
                                            <div className="flex justify-end gap-2 text-xs">
                                                <button
                                                    onClick={() => setIsEditingLink(true)}
                                                    className="text-gray-500 hover:text-blue-400 underline"
                                                >
                                                    Sửa link (Edit)
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setIsEditingLink(true)}
                                            className="text-sm text-blue-400 hover:text-blue-300 underline italic"
                                        >
                                            + Nhấn vào đây để nộp bài
                                        </button>
                                    )
                                )}
                            </div>

                            {/* RESOURCES SECTION */}
                            <div className="p-3 rounded-xl border border-gray-800 bg-gray-900/50">
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#9ca3af', marginBottom: '0.5rem' }}>
                                    RESOURCES
                                </label>
                                {isEditing ? (
                                    <div className="flex flex-col gap-2">
                                        <input
                                            value={editForm.linkRaw}
                                            onChange={(e) => setEditForm({ ...editForm, linkRaw: e.target.value })}
                                            placeholder="Link RAW..."
                                            className="w-full p-2 border border-gray-700 rounded text-sm bg-[#222] text-white"
                                        />
                                        <input
                                            value={editForm.linkBroll}
                                            onChange={(e) => setEditForm({ ...editForm, linkBroll: e.target.value })}
                                            placeholder="Link B-Roll..."
                                            className="w-full p-2 border border-purple-900 rounded text-sm bg-[#222] text-white"
                                        />
                                        <input
                                            value={editForm.collectFilesLink}
                                            onChange={(e) => setEditForm({ ...editForm, collectFilesLink: e.target.value })}
                                            placeholder="Link Collect Files..."
                                            className="w-full p-2 border border-yellow-900 rounded text-sm bg-[#222] text-white"
                                        />
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        {(() => {
                                            const resString = selectedTask.resources || selectedTask.fileLink
                                            if (resString && resString.includes('RAW:') && resString.includes('| BROLL:')) {
                                                const parts = resString.split('| BROLL:')
                                                return (
                                                    <>
                                                        <a href={formatLink(parts[0].replace('RAW:', '').trim())} target="_blank" className="text-blue-400 font-semibold hover:underline flex items-center gap-2 bg-blue-500/10 p-2 rounded">
                                                            📁 RAW Link ↗
                                                        </a>
                                                        <a href={formatLink(parts[1].trim())} target="_blank" className="text-purple-400 font-semibold hover:underline flex items-center gap-2 bg-purple-500/10 p-2 rounded">
                                                            🎨 B-Roll Link ↗
                                                        </a>
                                                    </>
                                                )
                                            } else if (resString) {
                                                return (
                                                    <a href={formatLink(resString)} target="_blank" className="text-blue-400 font-semibold hover:underline flex items-center gap-2 bg-blue-500/10 p-2 rounded">
                                                        📂 Open Resources ↗
                                                    </a>
                                                )
                                            }
                                            return null
                                        })()}

                                        {selectedTask.collectFilesLink && (
                                            <a href={formatLink(selectedTask.collectFilesLink)} target="_blank" className="text-yellow-500 font-bold hover:underline flex items-center gap-2 mt-1 bg-yellow-500/10 p-2 rounded">
                                                🌼 Collect Files (Project Mẫu) ↗
                                            </a>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* REFERENCES */}
                            <div className="p-3 rounded-xl border border-gray-800 bg-gray-900/50">
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#9ca3af', marginBottom: '0.5rem' }}>
                                    REFERENCES
                                </label>
                                {isEditing ? (
                                    <input
                                        value={editForm.references}
                                        onChange={(e) => setEditForm({ ...editForm, references: e.target.value })}
                                        placeholder="Reference Link..."
                                        className="w-full p-2 border border-gray-700 rounded text-sm bg-[#222] text-white"
                                    />
                                ) : (
                                    selectedTask.references ? (
                                        <a href={formatLink(selectedTask.references)} target="_blank" className="text-purple-400 font-semibold hover:underline">
                                            📺 Watch Reference Video ↗
                                        </a>
                                    ) : <span className="text-gray-500 italic">No references provided.</span>
                                )}
                            </div>

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
                                        className="w-full p-2 border border-gray-700 rounded text-sm bg-[#222] text-white"
                                    />
                                ) : (
                                    <div style={{ background: '#222', padding: '1rem', borderRadius: '12px', color: '#ddd', fontSize: '0.95rem', lineHeight: '1.5', whiteSpace: 'pre-wrap', border: '1px solid #333' }}>
                                        {selectedTask.notes || "No specific instructions."}
                                    </div>
                                )}
                            </div>

                        </div>

                        {isEditing && (
                            <button
                                onClick={handleSaveDetails}
                                className="btn btn-primary"
                                style={{ background: '#3b82f6', color: 'white', alignSelf: 'center', width: '100%', borderRadius: '12px', padding: '0.75rem', fontWeight: 'bold' }}
                            >
                                Save Changes
                            </button>
                        )}

                    </div>
                </div >
            )
            }
        </>
    )
}
