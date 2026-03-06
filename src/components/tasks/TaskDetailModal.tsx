"use client"

import { useState, useEffect } from "react"
import { TaskWithUser } from "@/types/admin"
import { updateTaskDetails } from "@/actions/update-task-details"
import { updateTaskStatus } from "@/actions/task-actions"
import { toast } from "sonner"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import dynamic from 'next/dynamic'
import DOMPurify from 'isomorphic-dompurify'

const TiptapEditor = dynamic(() => import('@/components/tiptap/TiptapEditor'), { ssr: false })

interface TaskDetailModalProps {
    task: TaskWithUser | null
    isOpen: boolean
    onClose: () => void
    isAdmin: boolean
    bulkSelectedIds?: string[]
    workspaceId: string
}

export function TaskDetailModal({ task, isOpen, onClose, isAdmin, bulkSelectedIds = [], workspaceId }: TaskDetailModalProps) {
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

    // Helper: Parse content for Tiptap
    const parseContent = (content: string | null) => {
        if (!content) return ''
        // Check if content looks like HTML
        if (/<[a-z][\s\S]*>/i.test(content)) return content
        // Legacy: Convert newlines to paragraphs for initial migration
        return content.split('\n').filter(line => line.trim() !== '').map(line => `<p>${line}</p>`).join('')
    }

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
                notes: parseContent(task.notes), // Parse legacy content here
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

        // Sanitize notes before saving
        const cleanNotes = DOMPurify.sanitize(form.notes)

        // Check for Bulk Mode
        const isBulk = bulkSelectedIds.length > 1 && localTask && bulkSelectedIds.includes(localTask.id)

        if (isBulk) {
            const { bulkUpdateTaskDetails } = await import('@/actions/bulk-task-actions')

            // Prepare data (exclude title)
            const bulkData = {
                resources: combinedResources,
                references: form.references,
                notes: cleanNotes,
                productLink: form.productLink,
                deadline: form.deadline || undefined,
                jobPriceUSD: isAdmin ? Number(form.jobPriceUSD) : undefined,
                value: isAdmin ? Number(form.value) : undefined,
                collectFilesLink: form.collectFilesLink
            }

            const res = await bulkUpdateTaskDetails(bulkSelectedIds, bulkData, workspaceId)

            if (res.error) {
                toast.error(res.error)
            } else {
                toast.success(`Bulk updated ${res.count} tasks successfully`)
                setIsEditing(false)
                onClose()
                window.location.reload()
            }
            return
        }

        const res = await updateTaskDetails(localTask.id, {
            resources: combinedResources,
            references: form.references,
            notes: cleanNotes,
            title: localTask.title,
            productLink: form.productLink,
            deadline: form.deadline || undefined,
            jobPriceUSD: isAdmin ? Number(form.jobPriceUSD) : undefined,
            value: isAdmin ? Number(form.value) : undefined,
            collectFilesLink: form.collectFilesLink
        }, workspaceId)

        if (res?.success) {
            setLocalTask(prev => prev ? ({
                ...prev,
                resources: combinedResources,
                references: form.references,
                notes: cleanNotes,
                productLink: form.productLink,
                value: isAdmin ? Number(form.value) : prev.value,
                jobPriceUSD: isAdmin ? Number(form.jobPriceUSD) : prev.jobPriceUSD,
                collectFilesLink: form.collectFilesLink
            }) : null)

            setIsEditing(false)
            toast.success('Task updated')
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
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="p-0 border-none bg-white text-zinc-950 sm:rounded-[28px] max-w-2xl overflow-hidden shadow-2xl transition-all">
                {/* STICKY HEADER */}
                <div className="sticky top-0 z-[60] bg-white/80 backdrop-blur-xl border-b border-zinc-100 px-8 py-6 flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1 pr-12">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-600">
                            Task Details & Actions
                        </span>
                        <h2 className="text-xl font-black text-zinc-900 leading-tight">
                            {localTask.title}
                        </h2>
                        {bulkSelectedIds.length > 1 && localTask && bulkSelectedIds.includes(localTask.id) && (
                            <div className="mt-2 px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-700 flex items-center gap-1.5 w-fit">
                                <span className="animate-pulse">⚠️</span>
                                <span className="font-bold">BULK MODE:</span>
                                <span>Modify {bulkSelectedIds.length} tasks</span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                        {(isAdmin || !isEditing) && (
                            <button
                                onClick={() => setIsEditing(!isEditing)}
                                className={`whitespace-nowrap px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all shadow-sm ${isEditing ? 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200' : 'bg-zinc-900 text-white hover:bg-zinc-800'}`}
                            >
                                {isEditing ? 'Cancel' : (isAdmin ? 'Edit All' : 'Submit / Note')}
                            </button>
                        )}
                    </div>
                </div>

                {/* SCROLLABLE BODY */}
                <div className="max-h-[75vh] overflow-y-auto px-8 py-6 space-y-8 custom-scrollbar">
                    <div className="flex flex-col gap-8">

                        {/* PRODUCT DELIVERY */}
                        <div className="space-y-3">
                            <label className="text-[11px] font-bold text-blue-500 uppercase tracking-widest flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px]">🎯</span>
                                THÀNH PHẨM (Delivery)
                            </label>

                            {(!localTask.productLink && !isAdmin) || isEditingLink ? (
                                <div className="flex flex-col gap-3 p-4 bg-blue-50/30 rounded-2xl border border-blue-100 shadow-inner">
                                    <input
                                        value={form.productLink}
                                        onChange={(e) => setForm({ ...form, productLink: e.target.value })}
                                        placeholder="Dán link sản phẩm (Google Drive, Youtube, ...)"
                                        className="w-full bg-white p-3 rounded-xl text-sm border border-blue-200 focus:ring-2 focus:ring-blue-400 outline-none shadow-sm transition-all"
                                    />
                                    <button
                                        onClick={async () => {
                                            await handleSave();
                                            if (!isAdmin) {
                                                const res = await updateTaskStatus(localTask.id, 'Review', workspaceId, undefined, undefined, localTask.version)
                                                if (res?.error) {
                                                    toast.error(res.error)
                                                } else {
                                                    toast.success('Đã nộp bài (Sent to Review)')
                                                }
                                            }
                                            setIsEditingLink(false);
                                        }}
                                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                                    >
                                        ✓ Xác nhận Nộp Bài
                                    </button>
                                </div>
                            ) : (
                                localTask.productLink ? (
                                    <div className="group relative">
                                        <a
                                            href={formatLink(localTask.productLink)}
                                            target="_blank"
                                            className="flex items-center justify-between p-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 group"
                                        >
                                            <span className="flex items-center gap-2">
                                                <span className="text-xl">🔗</span>
                                                Mở Link Sản Phẩm
                                            </span>
                                            <span className="text-blue-200 group-hover:translate-x-1 transition-transform">→</span>
                                        </a>
                                        <button
                                            onClick={() => setIsEditingLink(true)}
                                            className="absolute -top-2 -right-2 w-8 h-8 bg-white border border-blue-100 rounded-full shadow-md flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="Edit link"
                                        >
                                            ✏️
                                        </button>
                                    </div>
                                ) : <div className="p-4 bg-zinc-50 rounded-2xl border border-dashed border-zinc-200 text-zinc-400 italic text-sm text-center">Chưa có link thành phẩm.</div>
                            )}
                        </div>

                        {/* RESOURCES SECTION */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-3">
                                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest px-1">Resources</label>
                                {isEditing && isAdmin ? (
                                    <div className="space-y-2">
                                        <input
                                            value={form.linkRaw}
                                            onChange={(e) => setForm({ ...form, linkRaw: e.target.value })}
                                            placeholder="Link RAW Source..."
                                            className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:border-zinc-400"
                                        />
                                        <input
                                            value={form.linkBroll}
                                            onChange={(e) => setForm({ ...form, linkBroll: e.target.value })}
                                            placeholder="Link B-Roll..."
                                            className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:border-zinc-400"
                                        />
                                        <input
                                            value={form.collectFilesLink || ''}
                                            onChange={(e) => setForm({ ...form, collectFilesLink: e.target.value })}
                                            placeholder="Link Project Mẫu..."
                                            className="w-full p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm outline-none font-bold text-amber-900"
                                        />
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        {form.linkRaw && (
                                            <a href={formatLink(form.linkRaw)} target="_blank" className="flex items-center gap-2 p-3 bg-zinc-50 rounded-xl text-sm font-bold text-zinc-900 hover:bg-zinc-100 border border-transparent hover:border-zinc-200 transition-all">
                                                <span className="text-blue-500">📁</span> RAW Assets ↗
                                            </a>
                                        )}
                                        {form.linkBroll && (
                                            <a href={formatLink(form.linkBroll)} target="_blank" className="flex items-center gap-2 p-3 bg-zinc-50 rounded-xl text-sm font-bold text-zinc-900 hover:bg-zinc-100 border border-transparent hover:border-zinc-200 transition-all">
                                                <span className="text-purple-500">🎨</span> B-Roll Assets ↗
                                            </a>
                                        )}
                                        {localTask.collectFilesLink && (
                                            <a href={formatLink(localTask.collectFilesLink)} target="_blank" className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl text-sm font-black text-amber-700 border border-amber-200 hover:bg-amber-100 transition-all">
                                                <span>✨</span> PROJECT MẪU ↗
                                            </a>
                                        )}
                                        {!form.linkRaw && !form.linkBroll && !localTask.collectFilesLink && (
                                            <div className="text-zinc-400 italic text-xs p-3">No assets linked</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3">
                                <label className="text-[11px] font-bold text-purple-500 uppercase tracking-widest px-1">References</label>
                                {isEditing ? (
                                    <input
                                        value={form.references}
                                        onChange={(e) => setForm({ ...form, references: e.target.value })}
                                        placeholder="Reference Links..."
                                        className="w-full p-2.5 bg-purple-50/30 border border-purple-100 rounded-xl text-sm outline-none focus:border-purple-300"
                                    />
                                ) : (
                                    localTask.references ? (
                                        <a href={formatLink(localTask.references)} target="_blank" className="flex items-center gap-2 p-3 bg-purple-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-100 hover:bg-purple-700 transition-all">
                                            <span>📺</span> View Reference ↗
                                        </a>
                                    ) : <div className="text-zinc-400 italic text-xs p-3 bg-zinc-50 rounded-xl border border-zinc-100">None provided</div>
                                )}
                            </div>
                        </div>

                        {/* DEADLINE & FINANCE */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                            <div className="p-4 rounded-2xl bg-rose-50/30 border border-rose-100 space-y-2">
                                <label className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Deadline</label>
                                {isEditing && isAdmin ? (
                                    <input
                                        type="datetime-local"
                                        value={form.deadline}
                                        onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                                        className="w-full bg-white p-2 border border-rose-200 rounded-lg text-sm font-bold text-rose-600"
                                    />
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <span className={`text-lg font-black ${form.deadline && new Date() > new Date(form.deadline) && localTask?.status !== 'Hoàn tất' ? "text-rose-600" : "text-zinc-800"}`}>
                                            {form.deadline ? `${new Date(form.deadline).toLocaleDateString('vi-VN')} @ ${new Date(form.deadline).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : 'No Limit'}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {isAdmin && (
                                <div className="p-4 rounded-2xl bg-zinc-900 text-white space-y-3 shadow-xl">
                                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Finance info</label>
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <p className="text-[9px] text-zinc-500 uppercase font-bold">Client ($)</p>
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    value={form.jobPriceUSD}
                                                    onChange={(e) => setForm({ ...form, jobPriceUSD: parseFloat(e.target.value) || 0 })}
                                                    className="bg-zinc-800 border-none rounded p-1 text-sm w-16 font-mono text-emerald-400"
                                                />
                                            ) : (
                                                <p className="text-lg font-mono font-black text-emerald-400">${form.jobPriceUSD}</p>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[9px] text-zinc-500 uppercase font-bold">Staff (VND)</p>
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    value={form.value}
                                                    onChange={(e) => setForm({ ...form, value: parseFloat(e.target.value) || 0 })}
                                                    className="bg-zinc-800 border-none rounded p-1 text-sm w-24 font-mono text-amber-400 text-right"
                                                />
                                            ) : (
                                                <p className="text-lg font-mono font-black text-amber-400">{form.value.toLocaleString()}₫</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* NOTES */}
                        <div className="space-y-3">
                            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest px-1">Notes & Instructions</label>
                            {isEditing ? (
                                <div className="h-[400px] border border-zinc-200 rounded-2xl overflow-hidden shadow-inner">
                                    <TiptapEditor
                                        content={form.notes}
                                        onChange={(html) => setForm({ ...form, notes: html })}
                                    />
                                </div>
                            ) : (
                                <div
                                    className="bg-zinc-50 p-6 rounded-2xl text-zinc-800 text-[14px] leading-[1.6] prose prose-zinc max-w-none border border-zinc-100"
                                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(localTask.notes || "No specific instructions.") }}
                                />
                            )}
                        </div>
                    </div>
                </div>

                {isEditing && (
                    <div className="p-6 bg-zinc-50 border-t border-zinc-100">
                        <button
                            onClick={handleSave}
                            className="w-full py-4 bg-zinc-900 text-white font-black text-sm uppercase tracking-widest rounded-2xl hover:bg-zinc-800 transition-all shadow-xl shadow-zinc-200 active:scale-[0.98]"
                        >
                            Save Changes
                        </button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
