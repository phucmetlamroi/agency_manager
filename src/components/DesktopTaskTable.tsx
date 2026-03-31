'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { calculateRiskLevel, getRiskColor, getRiskLabel } from '@/lib/risk-utils'
import { validateTransition } from '@/lib/fsm-config'

// ... existing imports
import { deleteTask, assignTask } from '@/actions/task-management-actions'
import { updateTaskStatus } from '@/actions/task-actions'
import { updateTaskDetails } from '@/actions/update-task-details'
import DeleteTaskButton from './DeleteTaskButton'
import ManagerReviewChecklist from './tasks/ManagerReviewChecklist'

import { TaskWithUser } from '@/types/admin'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'


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

export default function TaskTable({ tasks, isAdmin = false, users = [], workspaceId }: { tasks: TaskWithUser[], isAdmin?: boolean, users?: { id: string, username: string }[], workspaceId: string }) {
    const router = useRouter()
    const { confirm } = useConfirm()
    const [selectedTask, setSelectedTask] = useState<TaskWithUser | null>(null)
    const [selectedIds, setSelectedIds] = useState<string[]>([])

    // Edit State
    const [isEditing, setIsEditing] = useState(false)
    const [isEditingLink, setIsEditingLink] = useState(false) // Local state for Product Link editing
    const [editForm, setEditForm] = useState({
        resources: '', // Kept for backward compatibility or direct access
        linkRaw: '',
        linkBroll: '',
        references: '',
        notes_vi: '',
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

        if (!isAdmin && task.status === 'Đã nhận task') {
            toast.warning('Vui lòng bấm nút "Bắt đầu" để xem chi tiết task!')
            return
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
            notes_vi: task.notes_vi || '',
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
        // Bulk Sync Logic: If the task being changed is part of a selection, update all selected tasks.
        const tasksToUpdate = selectedIds.includes(taskId) ? selectedIds : [taskId]

        try {
            // Parallel updates for better performance in bulk
            const results = await Promise.all(tasksToUpdate.map(async (id) => {
                try {
                    // @ts-ignore
                    return await updateTaskStatus(id, newStatus, workspaceId, notes, feedback)
                } catch (e) {
                    return { error: 'Failed' }
                }
            }))

            const errors = results.filter(r => r.error)
            if (errors.length > 0) {
                toast.error(`Cập nhật thất bại cho ${errors.length}/${tasksToUpdate.length} tasks.`)
            } else {
                toast.success(`Đã cập nhật trạng thái cho ${tasksToUpdate.length} tasks.`)
                if (selectedIds.includes(taskId)) setSelectedIds([]) // Clear selection after success
            }
            router.refresh()
        } catch (error) {
            console.error("Bulk update failed:", error)
            toast.error("Cập nhật thất bại. Vui lòng thử lại.")
        }
    }

    const handleSaveDetails = async () => {
        if (!selectedTask) return

        const combinedResources = (editForm.linkRaw || editForm.linkBroll)
            ? `RAW: ${editForm.linkRaw.trim()} | BROLL: ${editForm.linkBroll.trim()}`
            : editForm.resources

        const res = await updateTaskDetails(selectedTask.id, {
            resources: combinedResources,
            references: editForm.references,
            notes: editForm.notes_vi,
            title: selectedTask.title, // Keep existing title
            productLink: editForm.productLink,
            deadline: editForm.deadline || undefined, // Pass deadline string
            jobPriceUSD: isAdmin ? Number(editForm.jobPriceUSD) : undefined,
            value: isAdmin ? Number(editForm.value) : undefined,
            collectFilesLink: editForm.collectFilesLink
        }, workspaceId)

        if (res?.success) {
            setSelectedTask({
                ...selectedTask,
                resources: combinedResources,
                references: editForm.references,
                notes_vi: editForm.notes_vi,
                productLink: editForm.productLink,
            })
            setIsEditing(false)
            toast.success('Đã cập nhật chi tiết task')
        } else {
            toast.error('Failed to update')
        }
    }

    // Filter options based on role and FSM
    const getStatusOptions = (currentStatus: string) => {
        const allOptions = ["Đã nhận task", "Đang thực hiện", "Revision", "Sửa frame", "Tạm ngưng", "Hoàn tất", "Đang đợi giao"]

        if (!isAdmin) {
            // User limited view
            return ["Đã nhận task", "Đang thực hiện"]
        }

        // Admin: Filter by FSM validity
        return allOptions.filter(target => {
            if (target === currentStatus) return true
            return validateTransition(currentStatus, target).isValid
        })
    }

    return (
        <>
            <div className="flex flex-col gap-4 optimize-visibility">
                {/* Bulk Actions Bar */}
                {isAdmin && selectedIds.length > 0 && (
                    <div className="sticky top-0 z-20 bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center justify-between shadow-xl animate-in slide-in-from-top duration-300">
                        <div className="flex items-center gap-4">
                            <span className="text-sm font-bold"> Đã chọn {selectedIds.length} tasks</span>
                            <button onClick={() => setSelectedIds([])} className="text-xs bg-indigo-500 hover:bg-indigo-400 px-2 py-1 rounded">Hủy chọn</button>
                        </div>
                        <p className="text-[10px] opacity-80 uppercase tracking-widest font-black italic">Đổi trạng thái 1 task trong lô để áp dụng tất cả</p>
                    </div>
                )}

                {isAdmin && tasks.length > 0 && (
                  <div className="flex items-center gap-2 px-2">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-gray-700 bg-zinc-800"
                      checked={selectedIds.length === tasks.length && tasks.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(tasks.map(t => t.id))
                        else setSelectedIds([])
                      }}
                    />
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Chọn tất cả</span>
                  </div>
                )}

                {tasks.map(task => {
                    const isLocked = !isAdmin && task.status === 'Đã nhận task';
                    const isSelected = selectedIds.includes(task.id);
                    return (
                        <div key={task.id}
                            className={`glass-panel group relative p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-all border-l-4 ${isSelected ? 'ring-2 ring-indigo-500 border-indigo-500 bg-indigo-500/5' : ''}`}
                            style={{
                                borderLeftColor: isSelected ? '#6366f1' : (statusColors[task.status] || '#ccc')
                            }}
                        >
                            {/* Checkbox for Admin */}
                            {isAdmin && (
                              <div className="absolute -left-3 top-1/2 -translate-y-1/2 z-10" onClick={(e) => e.stopPropagation()}>
                                <input 
                                  type="checkbox" 
                                  className="w-5 h-5 rounded-md border-2 border-indigo-500/50 bg-zinc-900 checked:bg-indigo-500 cursor-pointer shadow-lg transition-all hover:scale-110"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) setSelectedIds(prev => [...prev, task.id])
                                    else setSelectedIds(prev => prev.filter(id => id !== task.id))
                                  }}
                                />
                              </div>
                            )}

                            <div className={`flex-1 ${isLocked ? 'opacity-50 grayscale pointer-events-none' : 'cursor-pointer'}`} onClick={() => openTask(task)}>
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
                                        {isLocked && (
                                            <span className="absolute -left-8 top-1 text-xl" title="Locked until Started">🔒</span>
                                        )}
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

                                    {/* Mobile-Optimized Status/Assignee info */}
                                    <div className="flex items-center gap-4 mt-1 md:mt-0">
                                        {/* Assignee */}
                                        {isAdmin && (
                                            <div onClick={(e) => e.stopPropagation()}>
                                                <select
                                                    value={task.assignee?.id || ''}
                                                    onChange={async (e) => {
                                                        const val = e.target.value
                                                        const resAssign = await assignTask(task.id, val || null, workspaceId)
                                                        if (resAssign?.success) router.refresh()
                                                    }}
                                                    className="bg-transparent border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-blue-500 max-w-[120px]"
                                                >
                                                    <option value="sys:revoke" className="text-red-500 font-bold">⛔ Thu hồi về System</option>
                                                    <option value="" className="text-gray-500">-- Hủy giao (Unassign User) --</option>
                                                    <optgroup label="Nhân viên">
                                                        {users
                                                            .filter(u => {
                                                                const role = (u as any).role
                                                                return role !== 'CLIENT' && role !== 'LOCKED'
                                                            })
                                                            .map(u => {
                                                                return (
                                                                    <option key={u.id} value={u.id} className="text-black">
                                                                        {u.username}
                                                                    </option>
                                                                )
                                                            })}
                                                    </optgroup>
                                                </select>
                                            </div>
                                        )}

                                        {/* Money (Visible to All) */}
                                        <span className="font-mono text-green-400 font-bold">
                                            {task.value.toLocaleString()} đ
                                        </span>
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
                                            {getStatusOptions(task.status).map(opt => (
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
                                            if (await confirm({
                                                title: 'Xóa Task?',
                                                message: `Bạn có chắc chắn muốn xóa task "${task.title}" không? Hành động này không thể hoàn tác.`,
                                                type: 'danger',
                                                confirmText: 'Xóa luôn',
                                                cancelText: 'Thôi'
                                            })) {
                                                await deleteTask(task.id, workspaceId)
                                                toast.success('Đã xóa task thành công')
                                            }
                                        }}
                                        className="text-gray-500 hover:text-red-500 p-2 text-xl"
                                    >
                                        ×
                                    </button>
                                )}
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

                            {/* PRODUCT DELIVERY SECTION (Refined for Inline Editing) */}
                            <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/50">
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#3b82f6', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                                    🎯 THÀNH PHẨM (Delivery)
                                </label>

                                {(!selectedTask.productLink && !isAdmin) || isEditingLink ? (
                                    /* EDIT MODE (No link OR editing) */
                                    <div className="flex bg-white rounded-md border border-blue-200 overflow-hidden">
                                        <input
                                            value={editForm.productLink}
                                            onChange={(e) => setEditForm({ ...editForm, productLink: e.target.value })}
                                            placeholder="Dán link sản phẩm (Drive/Youtube)..."
                                            className="flex-1 p-2 text-sm outline-none text-blue-900"
                                        />
                                        <div className="flex border-l border-blue-100">
                                            <button
                                                onClick={async () => {
                                                    await handleSaveDetails(); // Saves everything, effectively saving the link
                                                    if (!isAdmin) await handleStatusChange(selectedTask.id, 'Review'); // Only set Review if user submits
                                                    setIsEditingLink(false);
                                                }}
                                                className="px-3 bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs flex items-center gap-1 transition-colors"
                                                title="Lưu & Xác nhận"
                                            >
                                                <span>✓ Xác nhận</span>
                                            </button>
                                            {selectedTask.productLink && (
                                                <button
                                                    onClick={() => {
                                                        setEditForm({ ...editForm, productLink: selectedTask.productLink || '' });
                                                        setIsEditingLink(false);
                                                    }}
                                                    className="px-3 bg-gray-100 hover:bg-gray-200 text-gray-500 font-bold text-xs transition-colors"
                                                    title="Hủy bỏ"
                                                >
                                                    ✕ Cancel
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    /* VIEW MODE (Has Link) */
                                    selectedTask.productLink ? (
                                        <div className="flex flex-col gap-2">
                                            <a href={formatLink(selectedTask.productLink)} target="_blank" className="block p-3 bg-white rounded-lg border border-blue-200 text-blue-600 font-bold hover:shadow-md transition-shadow text-center">
                                                🔗 Mở link sản phẩm
                                            </a>
                                            <div className="flex justify-end gap-2 text-xs">
                                                <button
                                                    onClick={() => setIsEditingLink(true)}
                                                    className="text-gray-400 hover:text-blue-500 underline"
                                                >
                                                    Sửa link (Edit)
                                                </button>
                                            </div>
                                        </div>
                                    ) : <span className="text-gray-400 italic text-sm">Chưa có link thành phẩm.</span>
                                )}
                            </div>

                            {/* RESOURCES SECTION */}
                            <div className="p-3 rounded-xl border border-gray-100">
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#9ca3af', marginBottom: '0.5rem' }}>
                                    RESOURCES (RAW / B-ROLL / COLLECT FILES)
                                </label>
                                {isEditing && isAdmin ? (
                                    <div className="flex flex-col gap-2">
                                        <input
                                            value={editForm.linkRaw}
                                            onChange={(e) => setEditForm({ ...editForm, linkRaw: e.target.value })}
                                            placeholder="Link RAW (Source)..."
                                            className="w-full p-2 border border-gray-200 rounded text-sm text-black"
                                        />
                                        <input
                                            value={editForm.linkBroll}
                                            onChange={(e) => setEditForm({ ...editForm, linkBroll: e.target.value })}
                                            placeholder="Link B-Roll (Tài nguyên)..."
                                            className="w-full p-2 border border-blue-200 rounded text-sm text-black"
                                        />
                                        <input
                                            value={editForm.collectFilesLink || ''}
                                            onChange={(e) => setEditForm({ ...editForm, collectFilesLink: e.target.value })}
                                            placeholder="Link Collect Files (Project mẫu)..."
                                            className="w-full p-2 border border-yellow-200 rounded text-sm text-black bg-yellow-50"
                                        />
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        {(() => {
                                            const resString = selectedTask.resources || selectedTask.fileLink

                                            // RAW & BROLL
                                            if (resString && resString.includes('RAW:') && resString.includes('| BROLL:')) {
                                                const parts = resString.split('| BROLL:')
                                                const raw = parts[0].replace('RAW:', '').trim()
                                                const broll = parts[1].trim()
                                                return (
                                                    <>
                                                        {raw && (
                                                            <a href={formatLink(raw)} target="_blank" className="text-blue-600 font-semibold hover:underline flex items-center gap-1">
                                                                📁 RAW Link ↗
                                                            </a>
                                                        )}
                                                        {broll && (
                                                            <a href={formatLink(broll)} target="_blank" className="text-purple-600 font-semibold hover:underline flex items-center gap-1">
                                                                🎨 B-Roll Link ↗
                                                            </a>
                                                        )}
                                                    </>
                                                )
                                            } else if (resString) {
                                                return (
                                                    <a href={formatLink(resString)} target="_blank" className="text-blue-600 font-semibold hover:underline">
                                                        📂 Open Resource Folder ↗
                                                    </a>
                                                )
                                            }
                                            return null
                                        })()}

                                        {/* COLLECT FILES LINK (Project Mẫu) */}
                                        {selectedTask.collectFilesLink ? (
                                            <a href={formatLink(selectedTask.collectFilesLink)} target="_blank" className="text-yellow-600 font-bold hover:underline flex items-center gap-2 mt-1">
                                                🌼 Collect Files (Project Mẫu) ↗
                                            </a>
                                        ) : null}

                                        {!selectedTask.resources && !selectedTask.fileLink && !selectedTask.collectFilesLink && (
                                            <span className="text-gray-400 italic">No resources linked.</span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* PRICE EDITING (Admin Only) */}
                            {isAdmin && (
                                <div className="p-3 rounded-xl border border-gray-200 bg-gray-50 mt-2">
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#374151', marginBottom: '0.5rem' }}>
                                        💵 FINANCIALS (Edit)
                                    </label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs text-gray-500 block mb-1">Giá Job ($)</label>
                                            <div className="relative">
                                                <span className="absolute left-2 top-1.5 text-green-600 font-bold">$</span>
                                                {isEditing ? (
                                                    <input
                                                        type="number"
                                                        value={editForm.jobPriceUSD}
                                                        onChange={(e) => setEditForm(prev => ({ ...prev, jobPriceUSD: parseFloat(e.target.value) || 0 }))}
                                                        className="w-full pl-6 p-1 border border-gray-300 rounded text-sm bg-white text-black font-mono"
                                                    />
                                                ) : (
                                                    <span className="font-mono font-bold text-green-600 pl-6 block py-1">{selectedTask.jobPriceUSD || 0}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500 block mb-1">Lương Staff (VND)</label>
                                            <div className="relative">
                                                <span className="absolute left-2 top-1.5 text-yellow-600 font-bold">₫</span>
                                                {isEditing ? (
                                                    <input
                                                        type="number"
                                                        step={1000}
                                                        value={editForm.value}
                                                        onChange={(e) => setEditForm(prev => ({ ...prev, value: parseFloat(e.target.value) || 0 }))}
                                                        className="w-full pl-6 p-1 border border-gray-300 rounded text-sm bg-white text-black font-mono"
                                                    />
                                                ) : (
                                                    <span className="font-mono font-bold text-yellow-600 pl-6 block py-1">{(selectedTask.value || 0).toLocaleString()}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

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
                                        value={editForm.notes_vi}
                                        onChange={(e) => setEditForm({ ...editForm, notes_vi: e.target.value })}
                                        placeholder="Enter notes..."
                                        rows={4}
                                        disabled={!isAdmin} // Users can edit notes if needed? Maybe better restricted to Admin for instructions.
                                        style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '6px', fontFamily: 'inherit' }}
                                    />
                                ) : (
                                    <div style={{ background: '#fffbeb', padding: '1rem', borderRadius: '12px', color: '#92400e', fontSize: '0.95rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                                        {selectedTask.notes_vi || "No specific instructions."}
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

            {/* FEEDBACK MODAL (MANAGER CHECKLIST) */}
            {feedbackModal.isOpen && feedbackModal.taskId && (
                <ManagerReviewChecklist
                    taskId={feedbackModal.taskId}
                    workspaceId={workspaceId}
                    onClose={() => setFeedbackModal({ isOpen: false, taskId: null })}
                    onSuccess={() => {
                        setFeedbackModal({ isOpen: false, taskId: null })
                        handleStatusChange(feedbackModal.taskId!, 'Revision')
                    }}
                />
            )}
        </>
    )
}
