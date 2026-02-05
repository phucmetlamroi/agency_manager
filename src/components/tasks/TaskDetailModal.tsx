"use client"

import { useState, useEffect } from "react"
import { TaskWithUser } from "@/types/admin"
import { updateTaskDetails } from "@/actions/update-task-details"
import { updateTaskStatus } from "@/actions/task-actions"
import { toast } from "sonner"
import { Dialog, DialogContent } from "@/components/ui/dialog" // We can try using Shadcn Dialog, or stick to the custom overlay style if it was prefered.
// The user said "giữ giao diện ux/ui theo phong cách này" (keep this UX/UI style).
// The previous modal was a custom div overlay.
// I will replicate the custom overlay to be safe, or port to Shadcn Sheet/Dialog if it fits better.
// Given strict "keep style", I will reuse the custom styling but cleaner code.

interface TaskDetailModalProps {
    task: TaskWithUser | null
    isOpen: boolean
    onClose: () => void
    isAdmin: boolean
}

export function TaskDetailModal({ task, isOpen, onClose, isAdmin }: TaskDetailModalProps) {
    // Edit State
    const [isEditing, setIsEditing] = useState(false)
    const [isEditingLink, setIsEditingLink] = useState(false)
    const [localTask, setLocalTask] = useState<TaskWithUser | null>(null)
    const [form, setForm] = useState({
        resources: '',
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

    useEffect(() => {
        if (task) {
            setLocalTask(task)
            // Parse Resources
            const resString = task.resources || task.fileLink || ''
            let raw = ''
            let broll = ''
            if (resString.includes('RAW:') && resString.includes('| BROLL:')) {
                const parts = resString.split('| BROLL:')
                raw = parts[0].replace('RAW:', '').trim()
                broll = parts[1].trim()
            } else {
                raw = resString
            }

            let deadlineStr = ''
            if (task.deadline) {
                const d = new Date(task.deadline)
                const pad = (n: number) => n < 10 ? '0' + n : n
                deadlineStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
            }

            setForm({
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
        }
    }, [task])

    if (!isOpen || !localTask) return null

    const handleSave = async () => {
        const combinedResources = (form.linkRaw || form.linkBroll)
            ? `RAW: ${form.linkRaw.trim()} | BROLL: ${form.linkBroll.trim()}`
            : form.resources

        const res = await updateTaskDetails(localTask.id, {
            resources: combinedResources,
            references: form.references,
            notes: form.notes,
            title: localTask.title,
            productLink: form.productLink,
            deadline: form.deadline || undefined,
            jobPriceUSD: isAdmin ? Number(form.jobPriceUSD) : undefined,
            value: isAdmin ? Number(form.value) : undefined,
            collectFilesLink: form.collectFilesLink
        })

        if (res?.success) {
            setLocalTask(prev => prev ? ({
                ...prev,
                resources: combinedResources,
                references: form.references,
                notes: form.notes,
                productLink: form.productLink,
                value: isAdmin ? Number(form.value) : prev.value,
                jobPriceUSD: isAdmin ? Number(form.jobPriceUSD) : prev.jobPriceUSD,
                collectFilesLink: form.collectFilesLink
            }) : null)

            setIsEditing(false)
            toast.success('Task updated')

            // If user submitted link, maybe auto-revision?
            // Keeping original logic: "if (!isAdmin) await handleStatusChange(selectedTask.id, 'Revision');"
        } else {
            toast.error('Failed to update')
        }
    }

    const formatLink = (link: string | null) => {
        if (!link) return '#'
        if (link.startsWith('http')) return link
        return `https://${link}`
    }

    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999
        }} onClick={onClose}>

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
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${isEditing ? 'bg-gray-100 text-black border border-gray-200' : 'bg-transparent text-gray-500 hover:bg-gray-50'}`}
                        >
                            {isEditing ? 'Cancel' : (isAdmin ? 'Edit All' : 'Nộp bài / Ghi chú')}
                        </button>
                    )}
                    <button onClick={onClose}
                        className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-lg"
                    >
                        ×
                    </button>
                </div>

                <div>
                    <span className="text-xs font-bold uppercase tracking-widest text-violet-500">
                        PROJECT DETAILS
                    </span>
                    <h2 className="text-2xl font-extrabold mt-1 leading-tight">
                        {localTask.title}
                    </h2>
                </div>

                <div className="flex flex-col gap-4">

                    {/* PRODUCT DELIVERY */}
                    <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/50">
                        <label className="block text-xs font-bold text-blue-500 mb-2 uppercase">
                            🎯 THÀNH PHẨM (Delivery)
                        </label>

                        {(!localTask.productLink && !isAdmin) || isEditingLink ? (
                            <div className="flex bg-white rounded-md border border-blue-200 overflow-hidden">
                                <input
                                    value={form.productLink}
                                    onChange={(e) => setForm({ ...form, productLink: e.target.value })}
                                    placeholder="Dán link sản phẩm (Drive/Youtube)..."
                                    className="flex-1 p-2 text-sm outline-none text-blue-900"
                                />
                                <div className="flex border-l border-blue-100">
                                    <button
                                        onClick={async () => {
                                            await handleSave();
                                            if (!isAdmin) {
                                                await updateTaskStatus(localTask.id, 'Revision')
                                                toast.success('Đã nộp bài (Sent to Revision)')
                                            }
                                            setIsEditingLink(false);
                                        }}
                                        className="px-3 bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs flex items-center gap-1 transition-colors"
                                    >
                                        ✓ Xác nhận
                                    </button>
                                </div>
                            </div>
                        ) : (
                            localTask.productLink ? (
                                <div className="flex flex-col gap-2">
                                    <a href={formatLink(localTask.productLink)} target="_blank" className="block p-3 bg-white rounded-lg border border-blue-200 text-blue-600 font-bold hover:shadow-md transition-shadow text-center">
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
                        <label className="block text-xs font-bold text-gray-400 mb-2">
                            RESOURCES
                        </label>
                        {isEditing && isAdmin ? (
                            <div className="flex flex-col gap-2">
                                <input
                                    value={form.linkRaw}
                                    onChange={(e) => setForm({ ...form, linkRaw: e.target.value })}
                                    placeholder="Link RAW (Source)..."
                                    className="w-full p-2 border border-gray-200 rounded text-sm text-black"
                                />
                                <input
                                    value={form.linkBroll}
                                    onChange={(e) => setForm({ ...form, linkBroll: e.target.value })}
                                    placeholder="Link B-Roll (Tài nguyên)..."
                                    className="w-full p-2 border border-blue-200 rounded text-sm text-black"
                                />
                                <input
                                    value={form.collectFilesLink || ''}
                                    onChange={(e) => setForm({ ...form, collectFilesLink: e.target.value })}
                                    placeholder="Link Collect Files (Project mẫu)..."
                                    className="w-full p-2 border border-yellow-200 rounded text-sm text-black bg-yellow-50"
                                />
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {form.linkRaw && (
                                    <a href={formatLink(form.linkRaw)} target="_blank" className="text-blue-600 font-semibold hover:underline flex items-center gap-1">
                                        📁 RAW Link ↗
                                    </a>
                                )}
                                {form.linkBroll && (
                                    <a href={formatLink(form.linkBroll)} target="_blank" className="text-purple-600 font-semibold hover:underline flex items-center gap-1">
                                        🎨 B-Roll Link ↗
                                    </a>
                                )}
                                {localTask.collectFilesLink && (
                                    <a href={formatLink(localTask.collectFilesLink)} target="_blank" className="text-yellow-600 font-bold hover:underline flex items-center gap-2 mt-1">
                                        🌼 Collect Files (Project Mẫu) ↗
                                    </a>
                                )}
                            </div>
                        )}
                    </div>

                    {/* NOTES */}
                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-2">
                            NOTES / INSTRUCTIONS
                        </label>
                        {isEditing ? (
                            <textarea
                                value={form.notes}
                                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                placeholder="Enter notes..."
                                rows={4}
                                className="w-full p-2 border border-gray-200 rounded text-sm text-black font-sans"
                            />
                        ) : (
                            <div className="bg-amber-50 p-4 rounded-xl text-amber-900 text-sm leading-relaxed whitespace-pre-wrap">
                                {localTask.notes || "No specific instructions."}
                            </div>
                        )}
                    </div>
                </div>

                {isEditing && (
                    <button
                        onClick={handleSave}
                        className="w-full py-3 bg-black text-white font-bold rounded-xl hover:bg-gray-800 transition-colors"
                    >
                        Save Changes
                    </button>
                )}
            </div>
        </div >
    )
}
