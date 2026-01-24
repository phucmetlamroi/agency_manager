'use client'

import { useState } from 'react'
import { deleteTask } from '@/actions/admin-actions'
import { updateTaskStatus } from '@/actions/task-actions'
import { updateTaskDetails } from '@/actions/update-task-details'
import { useRouter } from 'next/navigation'

export type TaskWithUser = {
    id: string
    title: string
    value: number
    status: string
    type: string
    deadline: Date | null
    references: string | null
    resources: string | null
    fileLink: string | null
    notes: string | null
    assignee: { username: string } | null
}

const statusColors: Record<string, string> = {
    "Đang thực hiện": "#fbbf24", // Amber/Yellow
    "Revision": "#ef4444",       // Red
    "Hoàn tất": "#10b981",       // Green
    "Tạm ngưng": "#9ca3af",      // Gray
    "Sửa frame": "#f472b6"       // Pink
}

const statusBg: Record<string, string> = {
    "Đang thực hiện": "rgba(251, 191, 36, 0.2)",
    "Revision": "rgba(239, 68, 68, 0.2)",
    "Hoàn tất": "rgba(16, 185, 129, 0.2)",
    "Tạm ngưng": "rgba(156, 163, 175, 0.2)",
    "Sửa frame": "rgba(244, 114, 182, 0.2)"
}

export default function TaskTable({ tasks, isAdmin = false }: { tasks: TaskWithUser[], isAdmin?: boolean }) {
    const [selectedTask, setSelectedTask] = useState<TaskWithUser | null>(null)

    // Edit State
    const [isEditing, setIsEditing] = useState(false)
    const [editForm, setEditForm] = useState({ resources: '', references: '', notes: '' })

    const openTask = (task: TaskWithUser) => {
        setSelectedTask(task)
        setEditForm({
            resources: task.resources || task.fileLink || '',
            references: task.references || '',
            notes: task.notes || ''
        })
        setIsEditing(false)
    }

    const handleStatusChange = async (taskId: string, newStatus: string) => {
        await updateTaskStatus(taskId, newStatus)
    }

    const handleSaveDetails = async () => {
        if (!selectedTask) return

        const res = await updateTaskDetails(selectedTask.id, {
            resources: editForm.resources,
            references: editForm.references,
            notes: editForm.notes
        })

        if (res?.success) {
            // Update local state to reflect changes immediately
            setSelectedTask({
                ...selectedTask,
                resources: editForm.resources,
                references: editForm.references,
                notes: editForm.notes
            })
            setIsEditing(false)
            // router.refresh() happens via server action revalidatePath
        } else {
            alert('Failed to update')
        }
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
                                    <span style={{ opacity: 0.6 }}>Deadline:</span> {task.deadline ? new Date(task.deadline).toLocaleDateString() : 'N/A'}
                                </span>
                                {isAdmin && (
                                    <span style={{ color: '#00c853', fontWeight: '500' }}>
                                        {task.value.toLocaleString()} đ
                                    </span>
                                )}
                                <span style={{ color: 'var(--secondary)' }}>
                                    @{task.assignee?.username || '?'}
                                </span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            {/* Quick Status Dropdown */}
                            <select
                                value={task.status}
                                onChange={(e) => handleStatusChange(task.id, e.target.value)}
                                style={{
                                    padding: '0.4rem 0.8rem',
                                    borderRadius: '20px',
                                    border: 'none',
                                    background: statusBg[task.status] || '#333',
                                    color: statusColors[task.status] || 'white',
                                    fontWeight: '600',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    outline: 'none',
                                    textAlign: 'center'
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <option value="Đang thực hiện">Đang thực hiện</option>
                                <option value="Revision">Revision</option>
                                <option value="Sửa frame">Sửa frame</option>
                                <option value="Tạm ngưng">Tạm ngưng</option>
                                <option value="Hoàn tất">Hoàn tất</option>
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
                    </div>
                ))}
                {tasks.length === 0 && <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center' }}>Chưa có task nào.</p>}
            </div>

            {/* MODAL */}
            {selectedTask && (
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
                        animation: 'fadeIn 0.2s ease-out'
                    }} onClick={(e) => e.stopPropagation()}>

                        {/* HEADER Buttons */}
                        <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', display: 'flex', gap: '0.5rem' }}>
                            {isAdmin && (
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
                                    {isEditing ? 'Cancel' : 'Edit'}
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

                            {/* RESOURCES */}
                            <div className="p-3 rounded-xl border border-gray-100">
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#9ca3af', marginBottom: '0.5rem' }}>
                                    RESOURCES (RAW/B-ROLL)
                                </label>
                                {isEditing ? (
                                    <input
                                        value={editForm.resources}
                                        onChange={(e) => setEditForm({ ...editForm, resources: e.target.value })}
                                        placeholder="https://..."
                                        style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '6px' }}
                                    />
                                ) : (
                                    (selectedTask.resources || selectedTask.fileLink) ? (
                                        <a href={selectedTask.resources || selectedTask.fileLink || '#'} target="_blank" className="text-blue-600 font-semibold hover:underline">
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
                                {isEditing ? (
                                    <input
                                        value={editForm.references}
                                        onChange={(e) => setEditForm({ ...editForm, references: e.target.value })}
                                        placeholder="https://..."
                                        style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '6px' }}
                                    />
                                ) : (
                                    selectedTask.references ? (
                                        <a href={selectedTask.references} target="_blank" className="text-purple-600 font-semibold hover:underline">
                                            📺 Watch Reference Video ↗
                                        </a>
                                    ) : <span className="text-gray-400 italic">No references provided.</span>
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
            )}
        </>
    )
}
