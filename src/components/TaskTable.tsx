'use client'

import { useState } from 'react'
import { deleteTask, assignTask } from '@/actions/task-management-actions'
import { updateTaskStatus } from '@/actions/task-actions'
import { updateTaskDetails } from '@/actions/update-task-details'
import DeleteTaskButton from './DeleteTaskButton'

import { TaskWithUser } from '@/types/admin'

const statusColors: Record<string, string> = {
    "Đã nhận task": "#60a5fa",   // Blue
    "Đang đợi giao": "#a855f7",  // Purple (Waiting for Assignment)
    "Đang thực hiện": "#fbbf24", // Amber/Yellow
    "Revision": "#ef4444",       // Red
    "Hoàn tất": "#10b981",       // Green
    "Tạm ngưng": "#9ca3af",      // Gray
    "Sửa frame": "#f472b6",      // Pink

    // Requested mappings
    "OPEN": "#7c3aed",      // Mau tim
    "PENDING": "#f59e0b",   // Mau cam
    "COMPLETED": "#10b981", // Mau xanh la
    "UNASSIGNED": "#6b7280" // Mau xam
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

export default function TaskTable({ tasks, isAdmin = false, users = [] }: { tasks: TaskWithUser[], isAdmin?: boolean, users?: { id: string, username: string }[] }) {
    const [selectedTask, setSelectedTask] = useState<TaskWithUser | null>(null)

    // Edit State
    const [isEditing, setIsEditing] = useState(false)
    const [editForm, setEditForm] = useState({ resources: '', references: '', notes: '', productLink: '', deadline: '' })

    const openTask = (task: TaskWithUser) => {
        setSelectedTask(task)
        // Format date for datetime-local input (YYYY-MM-DDTHH:mm)
        // Need to convert to Vietnam Time (+7) representation or just use ISO string slice if already handling timezone?
        // We stored it as UTC but displayed as VN.
        // For input value, we need local string.
        let deadlineStr = ''
        if (task.deadline) {
            const d = new Date(task.deadline)
            // Manually format to YYYY-MM-DDTHH:mm in local time (which is system time)
            // or simply use the value if we assume browser is in VN.
            // Be safe: use offset if needed, but for now simple toISOString slice might be off.
            // Let's use 3rd party or manual formatting.
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

    const handleStatusChange = async (taskId: string, newStatus: string) => {
        await updateTaskStatus(taskId, newStatus)
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
            // Optimistic update difficult for deadline reset, relying on refresh/re-fetch mostly.
            // But we can update local state to reflect text changes.
            setSelectedTask({
                ...selectedTask,
                resources: editForm.resources,
                references: editForm.references,
                notes: editForm.notes,
                productLink: editForm.productLink,
                // We don't easily know parsed date here without server response, 
                // but page will refresh via revalidatePath anyway.
            })
            setIsEditing(false)
            // Close modal to see updates potentially? Or just keep open.
        } else {
            alert('Failed to update')
        }
    }

    // Filter options based on role
    const getStatusOptions = () => {
        if (!isAdmin) {
            // User can only switch between: "Đã nhận task" and "Đang thực hiện"
            // Exception: If current status is something else (e.g. "Revision"), they should see it but maybe not change away from it?
            // Req: "user chỉ có quyền tick 2 lựa chọn: đã nhận task và đang thực hiện"
            return ["Đã nhận task", "Đang thực hiện"]
        }
        // Admin sees all
        return ["Đã nhận task", "Đang thực hiện", "Revision", "Sửa frame", "Tạm ngưng", "Hoàn tất"]
    }

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                {tasks.map(task => (
                    <div key={task.id} className="glass-panel" style={{
                        padding: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'transform 0.2s',
                        borderLeft: `4px solid ${statusColors[task.status] || '#ccc'}`
                    }}>
                        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => openTask(task)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.2rem' }}>
                                <span style={{
                                    fontSize: '0.7rem',
                                    background: '#333',
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    textTransform: 'uppercase',
                                    color: '#ddd'
                                }}>
                                    {task.type || 'Review'}
                                </span>
                                <h4 style={{ fontWeight: '600', fontSize: '1.05rem', margin: 0 }}>{task.title}</h4>
                            </div>

                            <div style={{ fontSize: '0.85rem', color: '#888', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <span>
                                    <span style={{ opacity: 0.6 }}>Deadline:</span>
                                    {task.deadline ? (
                                        <div style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.2 }}>
                                            <span>
                                                {new Date(task.deadline).toLocaleDateString('vi-VN')} {' '}
                                                {new Date(task.deadline).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            {/* Smart Reminder Calculation */}
                                            {(() => {
                                                if (task.status === 'Hoàn tất' || !task.deadline) return null

                                                const start = task.createdAt ? new Date(task.createdAt).getTime() : new Date().getTime()
                                                const end = new Date(task.deadline).getTime()
                                                const now = new Date().getTime()

                                                const total = end - start
                                                const elapsed = now - start
                                                const percent = total > 0 ? (elapsed / total) * 100 : 100

                                                let msg = ''
                                                let color = '#888'
                                                let fontWeight = 'normal'

                                                if (percent > 100) { msg = 'GẤP: Đã quá hạn! 100%'; color = '#ef4444'; fontWeight = 'bold' }
                                                else if (percent >= 90) { msg = 'CẢNH BÁO: Sắp hết giờ (90%)'; color = '#f97316'; fontWeight = 'bold' }
                                                else if (percent >= 70) { msg = 'Nếu có khó khăn báo Admin ngay (70%)'; color = '#eab308' }
                                                else if (percent >= 50) { msg = 'Hơn một nửa rồi, khẩn trương!'; color = '#eab308' }
                                                else if (percent >= 30) { msg = 'Tranh thủ làm nhé (30%)'; color = '#3b82f6' }
                                                else if (percent >= 10) { msg = 'Bạn đã bắt đầu chưa? (10%)'; color = '#9ca3af' }
                                                else { msg = 'Mới giao - Lên kế hoạch ngay đi! (0%)'; color = '#10b981' }

                                                if (!msg) return null

                                                return (
                                                    <span style={{ fontSize: '0.75rem', color: color, fontWeight: fontWeight, fontStyle: 'italic', marginTop: '4px', display: 'block' }}>
                                                        {msg}
                                                    </span>
                                                )
                                            })()}
                                        </div>
                                    ) : 'No Deadline'}
                                    {isAdmin && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                openTask(task)
                                                // We can also set a flag to auto-focus deadline input if needed, 
                                                // but just opening the modal (which has the input now) is good enough.
                                                setIsEditing(true)
                                            }}
                                            style={{
                                                background: 'none', border: 'none', cursor: 'pointer',
                                                marginLeft: '0.4rem', color: '#60a5fa', fontSize: '0.9rem'
                                            }}
                                            title="Sửa Deadline"
                                        >
                                            ✏️
                                        </button>
                                    )}
                                </span>
                                {isAdmin && (
                                    <span style={{ color: '#00c853', fontWeight: '500' }}>
                                        {task.value.toLocaleString()} đ
                                    </span>
                                )}
                                {isAdmin ? (
                                    <select
                                        value={task.assignee?.id || ''}
                                        onChange={async (e) => {
                                            const val = e.target.value
                                            const res = await assignTask(task.id, val || null)
                                            if (res?.success) {
                                                // Force UI refresh to remove from queue/update list
                                                window.location.reload() // Or router.refresh(), but reload is safer for queue removal visual
                                            } else {
                                                alert('Lỗi: Không thể giao task. Vui lòng thử lại.')
                                            }
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        style={{
                                            background: 'transparent',
                                            color: task.assignee ? 'var(--secondary)' : '#666',
                                            border: '1px solid #333',
                                            borderRadius: '6px',
                                            padding: '2px 6px',
                                            fontSize: '0.8rem',
                                            outline: 'none',
                                            cursor: 'pointer',
                                            maxWidth: '120px'
                                        }}
                                    >
                                        <option value="" style={{ color: '#888' }}>-- Chưa giao --</option>
                                        {users.map(u => (
                                            <option key={u.id} value={u.id} style={{ color: 'black' }}>{u.username}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <span style={{ color: 'var(--secondary)' }}>
                                        @{task.assignee?.username || 'Chưa giao'}
                                        {task.assignee && (
                                            <span style={{
                                                fontSize: '0.75rem',
                                                marginLeft: '4px',
                                                color: (task.assignee.reputation || 100) >= 90 ? '#a855f7' : (task.assignee.reputation || 100) < 50 ? '#eab308' : '#fff'
                                            }}>
                                                ({task.assignee.reputation ?? 100}đ)
                                            </span>
                                        )}
                                    </span>
                                )}

                                {/* Product Indicator */}
                                {task.productLink && (
                                    <span style={{ marginLeft: 'auto', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                        ✔ Đã nộp
                                    </span>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <select
                                value={task.status}
                                onChange={(e) => handleStatusChange(task.id, e.target.value)}
                                disabled={!isAdmin && task.status === 'Hoàn tất'} // Lock if already done
                                style={{
                                    padding: '0.4rem 0.8rem',
                                    borderRadius: '20px',
                                    border: 'none',
                                    background: statusBg[task.status] || '#333',
                                    color: statusColors[task.status] || 'white',
                                    fontWeight: '600',
                                    fontSize: '0.8rem',
                                    cursor: isAdmin ? 'pointer' : (task.status === 'Hoàn tất' ? 'default' : 'pointer'),
                                    outline: 'none',
                                    textAlign: 'center'
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* Render allowed options */}
                                {getStatusOptions().map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                                {/* Ensure current status is always visible even if restricted */}
                                {!isAdmin && task.status === 'Hoàn tất' && <option value="Hoàn tất">Hoàn tất</option>}
                            </select>

                            {isAdmin && (
                                <button
                                    onClick={async (e) => {
                                        e.stopPropagation()
                                        if (confirm('Xóa task này?')) await deleteTask(task.id)
                                    }}
                                    className="btn"
                                    style={{ padding: '0.4rem', background: 'transparent', color: '#666', fontSize: '1.2rem', lineHeight: 1 }}
                                    title="Xóa"
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    </div >
                ))
                }
                {tasks.length === 0 && <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center' }}>Chưa có task nào.</p>}
            </div >

            {/* MODAL */}
            {
                selectedTask && (
                    <div style={{
                        position: 'fixed', inset: 0,
                        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 9999
                    }} onClick={() => setSelectedTask(null)}>

                        <div style={{
                            background: 'white', color: '#1a1a1a',
                            width: '90%', maxWidth: '600px',
                            borderRadius: '24px', padding: '2rem',
                            boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
                            position: 'relative',
                            display: 'flex', flexDirection: 'column', gap: '1.5rem',
                            animation: 'fadeIn 0.2s ease-out',
                            maxHeight: '90vh', overflowY: 'auto'
                        }} onClick={(e) => e.stopPropagation()}>

                            {/* HEADER Buttons */}
                            <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', display: 'flex', gap: '0.5rem' }}>
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
                                <h2 style={{ fontSize: '1.8rem', marginTop: '0.5rem', fontWeight: '800', lineHeight: 1.2 }}>
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
                                                <button onClick={handleSaveDetails} style={{ marginTop: '0.5rem', width: '100%', padding: '0.5rem', background: '#3b82f6', color: 'white', borderRadius: '6px', fontWeight: 'bold' }}>
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
                    </div>
                )
            }
        </>
    )
}
