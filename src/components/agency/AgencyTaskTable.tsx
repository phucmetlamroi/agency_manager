'use client'

import { useState } from 'react'
import { assignTask } from '@/actions/task-management-actions'
import { TaskWithUser } from '@/types/admin'
import { toast } from 'sonner'
import Stopwatch from '@/components/Stopwatch'

export default function AgencyTaskTable({ tasks, members }: { tasks: TaskWithUser[], members: any[] }) {
    const [selectedTask, setSelectedTask] = useState<TaskWithUser | null>(null)

    // Helper to format link
    const formatLink = (link: string | null) => {
        if (!link) return '#'
        if (link.startsWith('http://') || link.startsWith('https://')) return link
        return `https://${link}`
    }

    const openTask = (task: TaskWithUser) => {
        setSelectedTask(task)
    }

    return (
        <div className="flex flex-col gap-4">
            {tasks.map(task => (
                <div
                    key={task.id}
                    onClick={() => openTask(task)}
                    className="bg-[#1a1a1a] border border-white/5 p-4 rounded-xl flex flex-col md:flex-row gap-4 items-start md:items-center justify-between group hover:border-blue-500/30 transition-all cursor-pointer relative"
                >

                    {/* Task Info */}
                    <div className="flex-1">
                        <div className="flex flex-col gap-2 mb-1">
                            {/* Client Hierarchy */}
                            {task.client && (
                                <div className="flex items-center gap-1 text-[11px] uppercase font-bold tracking-wider text-blue-400">
                                    <span>🏢 {task.client.parent ? task.client.parent.name : task.client.name}</span>
                                    {task.client.parent && (
                                        <>
                                            <span className="text-gray-600">➤</span>
                                            <span className="text-purple-400">{task.client.name}</span>
                                        </>
                                    )}
                                    {task.project && (
                                        <>
                                            <span className="text-gray-600">|</span>
                                            <span className="text-gray-400">Project: {task.project.name}</span>
                                        </>
                                    )}
                                </div>
                            )}

                            <div className="flex items-center gap-2">
                                <span className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded uppercase">
                                    {task.type}
                                </span>
                                {task.status === 'Đang đợi giao' && (
                                    <span className="text-[10px] bg-purple-500 text-white font-bold px-2 py-0.5 rounded animate-pulse">
                                        NEW ASSIGNMENT
                                    </span>
                                )}
                            </div>
                        </div>
                        <h3 className="text-xl font-bold text-white leading-tight">{task.title}</h3>

                        {/* Info Grid */}
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-3 text-sm text-gray-400">
                            <span className="font-mono text-green-400 font-bold">💰 {task.value.toLocaleString()} đ</span>
                            <span className="flex items-center gap-1">
                                📅 {task.deadline ? new Date(task.deadline).toLocaleDateString('vi-VN') : 'No Deadline'}
                            </span>

                            {/* Resources Link */}
                            {(task.resources || task.fileLink) && (
                                <a
                                    href={task.resources || task.fileLink || '#'}
                                    target="_blank"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-blue-400 hover:text-blue-300 underline text-xs flex items-center gap-1"
                                >
                                    🔗 Tài nguyên / File
                                </a>
                            )}
                        </div>

                        {/* Notes Preview */}
                        {task.notes && (
                            <div className="mt-2 text-xs text-gray-500 bg-white/5 p-2 rounded max-w-2xl line-clamp-2">
                                📝 {task.notes}
                            </div>
                        )}
                    </div>

                    {/* Assignment Control */}
                    <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>

                        {/* Staff Selector */}
                        <div className="flex flex-col items-end gap-1">
                            <label className="text-[10px] text-gray-500 uppercase font-bold">Assignee</label>
                            <select
                                value={task.assigneeId || ''}
                                onChange={async (e) => {
                                    const val = e.target.value
                                    await assignTask(task.id, val || null)
                                    toast.success('Đã cập nhật phân công')
                                }}
                                className="bg-[#111] border border-gray-700 text-white text-sm rounded px-3 py-1.5 outline-none focus:border-blue-500"
                            >
                                <option value="">-- Chưa giao --</option>
                                {members.map(m => (
                                    <option key={m.id} value={m.id}>{m.nickname || m.username}</option>
                                ))}
                            </select>
                        </div>

                        {/* Status Badge (Read Only for Assignment context mostly) */}
                        <div className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${task.status === 'Hoàn tất' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                            {task.status}
                        </div>
                    </div>
                </div>
            ))}

            {tasks.length === 0 && (
                <div className="text-center py-20 text-gray-500 border border-dashed border-white/10 rounded-2xl">
                    Chưa có task nào được giao cho Đại lý.
                </div>
            )}

            {/* TASK DETAIL MODAL */}
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
                        maxHeight: '90vh', overflowY: 'auto',
                        border: '1px solid #333'
                    }} onClick={(e) => e.stopPropagation()}>

                        {/* HEADER Buttons */}
                        <div style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', gap: '0.5rem' }}>
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

                            {/* RESOURCES SECTION */}
                            <div className="p-3 rounded-xl border border-gray-800 bg-gray-900/50">
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#9ca3af', marginBottom: '0.5rem' }}>
                                    RESOURCES (RAW / B-ROLL / SCOPE)
                                </label>
                                <div className="flex flex-col gap-2">
                                    {(() => {
                                        const resString = selectedTask.resources || selectedTask.fileLink

                                        if (resString) {
                                            return (
                                                <a href={formatLink(resString)} target="_blank" className="text-blue-400 font-semibold hover:underline flex items-center gap-2 bg-blue-500/10 p-2 rounded">
                                                    📂 Open Resources / Brief ↗
                                                </a>
                                            )
                                        }
                                        return <span className="text-gray-500 italic">No resource link provided.</span>
                                    })()}

                                    {/* COLLECT FILES LINK (Project Mẫu) */}
                                    {selectedTask.collectFilesLink ? (
                                        <a href={formatLink(selectedTask.collectFilesLink)} target="_blank" className="text-yellow-500 font-bold hover:underline flex items-center gap-2 mt-1 bg-yellow-500/10 p-2 rounded">
                                            🌼 Collect Files (Project Mẫu) ↗
                                        </a>
                                    ) : null}
                                </div>
                            </div>

                            {/* REFERENCES */}
                            <div className="p-3 rounded-xl border border-gray-800 bg-gray-900/50">
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#9ca3af', marginBottom: '0.5rem' }}>
                                    REFERENCES
                                </label>
                                {selectedTask.references ? (
                                    <a href={formatLink(selectedTask.references)} target="_blank" className="text-purple-400 font-semibold hover:underline">
                                        📺 Watch Reference Video ↗
                                    </a>
                                ) : <span className="text-gray-500 italic">No references provided.</span>}
                            </div>

                            {/* NOTES */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#9ca3af', marginBottom: '0.5rem' }}>
                                    NOTES / INSTRUCTIONS
                                </label>
                                <div style={{ background: '#222', padding: '1rem', borderRadius: '12px', color: '#ddd', fontSize: '0.95rem', lineHeight: '1.5', whiteSpace: 'pre-wrap', border: '1px solid #333' }}>
                                    {selectedTask.notes || "No specific instructions."}
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
