"use client"

import { useState, useEffect } from "react"
import { TaskWithUser } from "@/types/admin"
import { updateTaskDetails } from "@/actions/update-task-details"
import { updateTaskStatus } from "@/actions/task-actions"
import { getFrameAccount, updateFrameAccount } from "@/actions/global-settings"
import { toast } from "sonner"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import dynamic from 'next/dynamic'
import DOMPurify from 'isomorphic-dompurify'
import { ensureExternalLinks, cn } from "@/lib/utils"
import {
    Copy, ExternalLink, FolderOpen, Film, MonitorPlay, FolderInput,
    ChevronRight, ChevronDown, Clock, DollarSign, ClipboardList, 
    FileText, AlertTriangle, Pencil, CheckCircle, Target, BookOpen,
    Link2, Layers
} from "lucide-react"
import ManagerReviewChecklist from "./ManagerReviewChecklist"

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
    const [isEditing, setIsEditing] = useState(false)
    const [isEditingLink, setIsEditingLink] = useState(false)
    const [localTask, setLocalTask] = useState<TaskWithUser | null>(null)
    const [isFrameExpanded, setIsFrameExpanded] = useState(false)
    const [showChecklist, setShowChecklist] = useState(false)
    // Bulk Mode: which fields are enabled for overwrite
    const [enabledFields, setEnabledFields] = useState<Record<string, boolean>>({})
    const toggleField = (field: string) => setEnabledFields(prev => ({ ...prev, [field]: !prev[field] }))
    const [frameAccount, setFrameAccount] = useState({ account: '', password: '' })
    const [form, setForm] = useState({
        resources: '',
        linkRaw: '',
        linkBroll: '',
        references: '',
        notes_vi: '',
        notes_en: '',
        productLink: '',
        deadline: '',
        jobPriceUSD: 0,
        value: 0,
        collectFilesLink: '',
        submissionFolder: '',
        scriptLink: ''
    })

    // Helper: Parse content for Tiptap (logic unchanged)
    const parseContent = (content: string | null) => {
        if (!content) return ''
        if (/&lt;[a-z][\s\S]*>/i.test(content)) return content
        return content.split('\n').filter(line => line.trim() !== '').map(line => `<p>${line}</p>`).join('')
    }

    useEffect(() => {
        if (task) {
            setLocalTask(task)
            const resString = task.resources || task.fileLink || ''
            let raw = ''
            let broll = ''
            let submission = ''

            if (resString.startsWith('RAW:')) {
                const parts = resString.split('|')
                parts.forEach(p => {
                    const cleanIdx = p.trim()
                    if (cleanIdx.startsWith('RAW:')) raw = cleanIdx.replace('RAW:', '').trim()
                    if (cleanIdx.startsWith('BROLL:')) broll = cleanIdx.replace('BROLL:', '').trim()
                    if (cleanIdx.startsWith('SUBMISSION:')) submission = cleanIdx.replace('SUBMISSION:', '').trim()
                })
            } else {
                raw = resString
            }

            let deadlineStr = ''
            if (task.deadline) {
                const d = new Date(task.deadline)
                const pad = (n: number) => n < 10 ? '0' + n : n
                deadlineStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
            }

            // Parse references: supports plain URL or "REF:url|SCRIPT:url" format
            let refUrl = task.references || ''
            let scriptUrl = ''
            if (refUrl.startsWith('REF:')) {
                const refParts = refUrl.split('|')
                refParts.forEach(p => {
                    const t = p.trim()
                    if (t.startsWith('REF:')) refUrl = t.replace('REF:', '').trim()
                    if (t.startsWith('SCRIPT:')) scriptUrl = t.replace('SCRIPT:', '').trim()
                })
            }

            setForm({
                resources: resString,
                linkRaw: raw,
                linkBroll: broll,
                references: refUrl,
                notes_vi: parseContent(task.notes_vi),
                notes_en: parseContent(task.notes_en),
                productLink: task.productLink || '',
                deadline: deadlineStr,
                jobPriceUSD: task.jobPriceUSD || 0,
                value: task.value || 0,
                collectFilesLink: task.collectFilesLink || '',
                submissionFolder: submission,
                scriptLink: scriptUrl
            })
            setIsEditing(false)
        }
    }, [task])

    useEffect(() => {
        if (isOpen) {
            getFrameAccount().then(data => { setFrameAccount(data) })
        }
    }, [isOpen])

    if (!isOpen || !localTask) return null

    // ── handleSave (logic 100% unchanged) ────────────────────
    const handleSave = async () => {
        const combinedResources = (form.linkRaw || form.linkBroll || form.submissionFolder)
            ? `RAW: ${form.linkRaw.trim()} | BROLL: ${form.linkBroll.trim()} | SUBMISSION: ${form.submissionFolder.trim()}`
            : form.resources

        const cleanNotesVi = DOMPurify.sanitize(form.notes_vi)
        const cleanNotesEn = DOMPurify.sanitize(form.notes_en)

        // Encode references + scriptLink into one field
        const combinedReferences = form.scriptLink
            ? `REF:${form.references.trim()} | SCRIPT:${form.scriptLink.trim()}`
            : form.references

        if (isAdmin) {
            await updateFrameAccount(frameAccount.account, frameAccount.password)
        }

        const isBulk = bulkSelectedIds.length > 1 && localTask && bulkSelectedIds.includes(localTask.id)

        if (isBulk) {
            const { bulkUpdateTaskDetails } = await import('@/actions/bulk-task-actions')
            const bulkData: any = {}
            if (enabledFields['resources']) bulkData.resources = combinedResources
            if (enabledFields['references']) bulkData.references = combinedReferences
            if (enabledFields['notes']) bulkData.notes = cleanNotesVi
            if (enabledFields['notes_en']) bulkData.notes_en = cleanNotesEn
            if (enabledFields['productLink']) bulkData.productLink = form.productLink
            if (enabledFields['deadline']) bulkData.deadline = form.deadline || undefined
            if (enabledFields['jobPriceUSD'] && isAdmin) bulkData.jobPriceUSD = Number(form.jobPriceUSD)
            if (enabledFields['value'] && isAdmin) bulkData.value = Number(form.value)
            if (enabledFields['collectFilesLink']) bulkData.collectFilesLink = form.collectFilesLink

            if (Object.keys(bulkData).length === 0) {
                toast.warning('Vui lòng bật ít nhất 1 trường để cập nhật hàng loạt!')
                return
            }

            const res = await bulkUpdateTaskDetails(bulkSelectedIds, bulkData, workspaceId)
            if (res.error) { toast.error(res.error) } 
            else {
                toast.success(`Đã cập nhật ${Object.keys(bulkData).length} trường cho ${res.count} tasks`)
                setIsEditing(false); setEnabledFields({}); onClose(); window.location.reload()
            }
            return
        }

        const res = await updateTaskDetails(localTask.id, {
            resources: combinedResources,
            references: combinedReferences,
            notes: cleanNotesVi,
            notes_en: cleanNotesEn,
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
                references: combinedReferences,
                notes_vi: cleanNotesVi,
                notes_en: cleanNotesEn,
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

    const isBulkMode = bulkSelectedIds.length > 1 && localTask && bulkSelectedIds.includes(localTask.id)

    // ── Bulk Toggle — dark themed ─────────────────────────────
    const BulkToggle = ({ field, label }: { field: string; label: string }) => {
        if (!isBulkMode || !isEditing) return null
        return (
            <label className="inline-flex items-center gap-1.5 cursor-pointer ml-2">
                <input
                    type="checkbox"
                    className="w-3.5 h-3.5 accent-amber-500"
                    checked={!!enabledFields[field]}
                    onChange={() => toggleField(field)}
                />
                <span className={`text-[10px] font-bold uppercase tracking-wider ${enabledFields[field] ? 'text-amber-400' : 'text-zinc-600'}`}>
                    {enabledFields[field] ? 'GHI ĐÈ' : 'GIỮ'}
                </span>
            </label>
        )
    }

    // ── Deadline status ───────────────────────────────────────
    const isOverdue = form.deadline && new Date() > new Date(form.deadline) && localTask?.status !== 'Hoàn tất'

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            {/* ══ DARK GLASS MODAL SHELL ══════════════════════ */}
            <DialogContent className="p-0 border border-white/10 bg-zinc-950/95 backdrop-blur-2xl text-zinc-100 sm:rounded-[24px] max-w-2xl overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.8)] transition-all">

                {/* ── STICKY HEADER ─────────────────────────── */}
                <div className="sticky top-0 z-[60] bg-zinc-950/90 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1 pr-12">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400 flex items-center gap-1.5">
                            <Layers className="w-3 h-3" strokeWidth={2} />
                            Task Details & Actions
                        </span>
                        <h2 className="text-lg font-black text-zinc-100 leading-tight line-clamp-2">
                            {localTask.title}
                        </h2>

                        {/* Bulk mode indicator */}
                        {bulkSelectedIds.length > 1 && localTask && bulkSelectedIds.includes(localTask.id) && (
                            <div className="mt-1.5 flex flex-col gap-1.5">
                                <div className="px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/25 rounded-lg text-[10px] text-amber-400 flex items-center gap-1.5 w-fit">
                                    <AlertTriangle className="w-3 h-3" strokeWidth={2} />
                                    <span className="font-bold">BULK MODE:</span>
                                    <span>Chỉnh sửa {bulkSelectedIds.length} tasks</span>
                                </div>
                                {isEditing && (
                                    <div className="px-2.5 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-[10px] text-indigo-300 w-fit max-w-xs">
                                        Bật checkbox cạnh mỗi field để đưa vào cập nhật hàng loạt.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 mt-1 flex-shrink-0">
                        {(isAdmin || !isEditing) && (
                            <button
                                onClick={() => setIsEditing(!isEditing)}
                                className={cn(
                                    "whitespace-nowrap px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all",
                                    isEditing
                                        ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-white/5"
                                        : "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20 hover:brightness-110"
                                )}
                            >
                                {isEditing ? 'Huỷ' : (isAdmin ? 'Edit All' : 'Submit / Note')}
                            </button>
                        )}
                    </div>
                </div>

                {/* ── SCROLLABLE BODY ───────────────────────── */}
                <div className="max-h-[75vh] overflow-y-auto px-6 py-5 space-y-6 custom-scrollbar">

                    {/* ════════════════════════════════════════
                        1. THÀNH PHẨM (DELIVERY)
                    ════════════════════════════════════════ */}
                    <div className="space-y-3">
                        <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                            <Target className="w-3.5 h-3.5" strokeWidth={2} />
                            Thành Phẩm (Delivery)
                        </label>

                        {(!localTask.productLink && !isAdmin) || isEditingLink ? (
                            /* ── Input mode ── */
                            <div className="flex flex-col gap-3 p-4 bg-zinc-900/60 rounded-2xl border border-white/5 shadow-inner">
                                <input
                                    value={form.productLink}
                                    onChange={(e) => setForm({ ...form, productLink: e.target.value })}
                                    placeholder="Dán link sản phẩm (Google Drive, Youtube, ...)"
                                    className="w-full bg-zinc-800/60 p-3 rounded-xl text-sm border border-white/10 focus:border-indigo-500/50 outline-none text-zinc-200 placeholder:text-zinc-600 shadow-sm transition-all"
                                />
                                <button
                                    onClick={async () => {
                                        await handleSave();
                                        if (!isAdmin) {
                                            const res = await updateTaskStatus(localTask.id, 'Revision', workspaceId, undefined, undefined, localTask.version)
                                            if (res?.error) {
                                                toast.error(res.error)
                                            } else {
                                                setLocalTask(prev => prev ? ({
                                                    ...prev,
                                                    status: 'Revision',
                                                    deadline: null,
                                                    version: typeof prev.version === 'number' ? prev.version + 1 : prev.version
                                                }) : null)
                                                setForm(prev => ({ ...prev, deadline: '' }))
                                                toast.success('Đã nộp bài, task chuyển sang Revision và đã xóa deadline')
                                            }
                                        }
                                        setIsEditingLink(false);
                                    }}
                                    className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-emerald-900/30"
                                >
                                    <CheckCircle className="w-4 h-4" strokeWidth={2} />
                                    Xác nhận Nộp Bài
                                </button>
                            </div>
                        ) : (
                            localTask.productLink ? (
                                <div className="group relative">
                                    <a
                                        href={formatLink(localTask.productLink)}
                                        target="_blank"
                                        className="flex items-center justify-between p-4 bg-gradient-to-r from-indigo-600/20 to-purple-600/15 border border-indigo-500/25 text-indigo-200 rounded-2xl font-bold hover:border-indigo-400/40 hover:from-indigo-600/25 hover:to-purple-600/20 group transition-all shadow-lg shadow-black/20"
                                    >
                                        <span className="flex items-center gap-2.5">
                                            <Link2 className="w-5 h-5 text-indigo-400" strokeWidth={1.5} />
                                            <span className="text-sm font-bold text-zinc-100">Mở Link Sản Phẩm</span>
                                        </span>
                                        <ExternalLink className="w-4 h-4 text-indigo-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" strokeWidth={1.5} />
                                    </a>
                                    <button
                                        onClick={() => setIsEditingLink(true)}
                                        className="absolute -top-2 -right-2 w-7 h-7 bg-zinc-800 border border-white/10 rounded-full shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-zinc-700"
                                        title="Edit link"
                                    >
                                        <Pencil className="w-3 h-3 text-zinc-400" strokeWidth={1.5} />
                                    </button>
                                </div>
                            ) : (
                                <div className="p-4 bg-zinc-900/40 rounded-2xl border border-dashed border-white/10 text-zinc-600 italic text-sm text-center">
                                    Chưa có link thành phẩm.
                                </div>
                            )
                        )}
                    </div>

                    {/* ════════════════════════════════════════
                        2. RESOURCES + REFERENCES
                    ════════════════════════════════════════ */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                        {/* RESOURCES */}
                        <div className="space-y-2.5">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                                <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
                                Resources
                                <BulkToggle field="resources" label="Resources" />
                            </label>

                            {isEditing && isAdmin ? (
                                /* ── Edit inputs ── */
                                <div className={cn("space-y-2", isBulkMode && !enabledFields['resources'] ? 'opacity-40 pointer-events-none' : '')}>
                                    {[
                                        { value: form.linkRaw, key: 'linkRaw', placeholder: 'Link RAW Source...' },
                                        { value: form.linkBroll, key: 'linkBroll', placeholder: 'Link B-Roll...' },
                                    ].map(({ value, key, placeholder }) => (
                                        <input
                                            key={key}
                                            value={value}
                                            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                                            placeholder={placeholder}
                                            className="w-full p-2.5 bg-zinc-900/60 border border-white/8 rounded-xl text-sm outline-none focus:border-indigo-500/50 text-zinc-300 placeholder:text-zinc-600 transition-all"
                                        />
                                    ))}
                                    <input
                                        value={form.collectFilesLink || ''}
                                        onChange={(e) => setForm({ ...form, collectFilesLink: e.target.value })}
                                        placeholder="Link Project Mẫu..."
                                        className="w-full p-2.5 bg-amber-500/5 border border-amber-500/15 rounded-xl text-sm outline-none font-bold text-amber-300 placeholder:text-zinc-600 transition-all focus:border-amber-500/30"
                                    />
                                    <div className="flex rounded-xl overflow-hidden">
                                        <input
                                            value={form.submissionFolder || ''}
                                            onChange={(e) => setForm({ ...form, submissionFolder: e.target.value })}
                                            placeholder="Link Folder Nộp File..."
                                            className="flex-1 p-2.5 bg-indigo-500/5 border border-indigo-500/15 border-r-0 text-sm outline-none font-bold text-indigo-300 placeholder:text-zinc-600 transition-all"
                                        />
                                        <button
                                            onClick={() => setIsFrameExpanded(!isFrameExpanded)}
                                            className="px-3 bg-zinc-800/80 hover:bg-zinc-700/80 border border-indigo-500/15 flex items-center text-zinc-400 text-xs font-bold transition-colors gap-1.5"
                                            title="Frame.io (Global)"
                                        >
                                            Frame.io
                                            {isFrameExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* ── View mode ── */
                                <div className="flex flex-col gap-2">
                                    {form.linkRaw && (
                                        <a href={formatLink(form.linkRaw)} target="_blank" className="group flex items-center gap-2.5 p-3 bg-zinc-900/60 rounded-xl text-sm font-bold text-zinc-300 hover:text-white hover:bg-zinc-800/60 border border-white/5 hover:border-white/10 transition-all">
                                            <FolderOpen className="w-4 h-4 text-blue-400 flex-shrink-0" strokeWidth={1.5} />
                                            RAW Assets
                                            <ExternalLink className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 ml-auto" strokeWidth={1.5} />
                                        </a>
                                    )}
                                    {form.linkBroll && (
                                        <a href={formatLink(form.linkBroll)} target="_blank" className="group flex items-center gap-2.5 p-3 bg-zinc-900/60 rounded-xl text-sm font-bold text-zinc-300 hover:text-white hover:bg-zinc-800/60 border border-white/5 hover:border-white/10 transition-all">
                                            <Film className="w-4 h-4 text-purple-400 flex-shrink-0" strokeWidth={1.5} />
                                            B-Roll Assets
                                            <ExternalLink className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 ml-auto" strokeWidth={1.5} />
                                        </a>
                                    )}
                                    {localTask.collectFilesLink && (
                                        <a href={formatLink(localTask.collectFilesLink)} target="_blank" className="group flex items-center gap-2.5 p-3 bg-amber-500/8 rounded-xl text-sm font-black text-amber-300 border border-amber-500/15 hover:bg-amber-500/12 hover:border-amber-500/25 transition-all">
                                            <Layers className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
                                            Project Mẫu
                                            <ExternalLink className="w-3 h-3 text-amber-600 group-hover:text-amber-400 ml-auto" strokeWidth={1.5} />
                                        </a>
                                    )}

                                    {/* Submission Folder + Frame.io + Checklist row */}
                                    <div className="flex rounded-xl overflow-hidden border border-white/8 shadow-sm">
                                        {form.submissionFolder ? (
                                            <a href={formatLink(form.submissionFolder)} target="_blank" className="flex-1 flex items-center gap-2.5 p-3 bg-indigo-500/8 text-sm font-black text-indigo-300 hover:bg-indigo-500/12 transition-all">
                                                <FolderInput className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
                                                Folder Nộp File
                                            </a>
                                        ) : (
                                            <div className="flex-1 flex items-center gap-2.5 p-3 bg-zinc-900/40 text-sm font-bold text-zinc-600">
                                                <FolderInput className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
                                                Chưa có Folder Nộp
                                            </div>
                                        )}
                                        <button
                                            onClick={() => setIsFrameExpanded(!isFrameExpanded)}
                                            className="px-3 bg-zinc-800/60 hover:bg-zinc-700/60 border-l border-white/5 flex items-center text-zinc-400 text-xs font-bold transition-colors gap-1.5 whitespace-nowrap"
                                            title="Frame.io (Global)"
                                        >
                                            Frame.io
                                            {isFrameExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                        </button>
                                        {isAdmin && (
                                            <button
                                                onClick={() => setShowChecklist(true)}
                                                className="px-3 bg-red-500/8 hover:bg-red-500/15 border-l border-white/5 flex items-center text-red-400 text-xs font-bold transition-colors gap-1.5 whitespace-nowrap"
                                                title="Manager Review Checklist"
                                            >
                                                <ClipboardList className="w-3.5 h-3.5" strokeWidth={1.5} />
                                                Checklist
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* FRAME.IO PANEL */}
                            {isFrameExpanded && (
                                <div className="p-4 bg-indigo-500/5 border border-indigo-500/15 rounded-xl mt-1 animate-in fade-in slide-in-from-top-1 flex flex-col gap-3">
                                    <p className="text-[11px] text-indigo-400/80 italic flex items-center gap-1.5">
                                        <AlertTriangle className="w-3 h-3 flex-shrink-0" strokeWidth={2} />
                                        Tài khoản dành cho trường hợp bị out khỏi Frame team
                                    </p>
                                    {[
                                        { label: 'Tài khoản', key: 'account', val: frameAccount.account, onCopy: () => { navigator.clipboard.writeText(frameAccount.account); toast.success('Đã copy tài khoản') } },
                                        { label: 'Mật khẩu', key: 'password', val: frameAccount.password, onCopy: () => { navigator.clipboard.writeText(frameAccount.password); toast.success('Đã copy mật khẩu') } },
                                    ].map(({ label, key, val, onCopy }) => (
                                        <div key={key} className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-zinc-500 w-20 flex-shrink-0">{label}:</span>
                                            {isEditing && isAdmin ? (
                                                <input
                                                    value={key === 'account' ? frameAccount.account : frameAccount.password}
                                                    onChange={e => setFrameAccount({ ...frameAccount, [key]: e.target.value })}
                                                    placeholder={label}
                                                    className="flex-1 p-2 text-sm bg-zinc-900/60 border border-white/8 rounded-lg outline-none focus:border-indigo-500/40 font-mono text-zinc-300"
                                                />
                                            ) : (
                                                <div className="flex-1 p-2 text-sm bg-zinc-900/40 border border-white/5 rounded-lg text-zinc-400 font-mono">
                                                    {val || '---'}
                                                </div>
                                            )}
                                            <button
                                                onClick={onCopy}
                                                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs font-bold rounded-lg border border-white/8 transition-colors shadow-sm whitespace-nowrap active:scale-95"
                                            >
                                                Copy
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* REFERENCES + SCRIPT */}
                        <div className="space-y-2.5">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                                <MonitorPlay className="w-3.5 h-3.5" strokeWidth={1.5} />
                                References
                                <BulkToggle field="references" label="References" />
                            </label>
                            {isEditing && isAdmin ? (
                                <div className={cn("space-y-2", isBulkMode && !enabledFields['references'] ? 'opacity-40 pointer-events-none' : '')}>
                                    <input
                                        value={form.references}
                                        onChange={(e) => setForm({ ...form, references: e.target.value })}
                                        placeholder="Reference link..."
                                        className="w-full p-2.5 bg-zinc-900/60 border border-white/8 rounded-xl text-sm outline-none focus:border-purple-500/50 text-zinc-300 placeholder:text-zinc-600 transition-all"
                                    />
                                    {/* Script input */}
                                    <input
                                        value={form.scriptLink}
                                        onChange={(e) => setForm({ ...form, scriptLink: e.target.value })}
                                        placeholder="Script / Transcript / Kịch bản link..."
                                        className="w-full p-2.5 bg-teal-500/5 border border-teal-500/20 rounded-xl text-sm outline-none focus:border-teal-500/40 text-teal-300 placeholder:text-zinc-600 transition-all"
                                    />
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {/* View Reference button */}
                                    {form.references ? (
                                        <a href={formatLink(form.references)} target="_blank"
                                            className="group flex items-center gap-2.5 p-4 bg-gradient-to-r from-purple-600/15 to-violet-600/10 border border-purple-500/20 text-purple-200 rounded-xl text-sm font-bold hover:border-purple-400/35 hover:from-purple-600/20 transition-all"
                                        >
                                            <MonitorPlay className="w-4 h-4 text-purple-400 flex-shrink-0" strokeWidth={1.5} />
                                            View Reference
                                            <ExternalLink className="w-3.5 h-3.5 text-purple-500 group-hover:text-purple-300 ml-auto group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" strokeWidth={1.5} />
                                        </a>
                                    ) : (
                                        <div className="text-zinc-600 italic text-xs p-3 bg-zinc-900/40 rounded-xl border border-white/5">Không có reference</div>
                                    )}

                                    {/* View Script button */}
                                    {form.scriptLink ? (
                                        <a href={formatLink(form.scriptLink)} target="_blank"
                                            className="group flex items-center gap-2.5 p-4 bg-gradient-to-r from-teal-600/15 to-cyan-600/10 border border-teal-500/20 text-teal-200 rounded-xl text-sm font-bold hover:border-teal-400/35 hover:from-teal-600/20 transition-all"
                                        >
                                            <FileText className="w-4 h-4 text-teal-400 flex-shrink-0" strokeWidth={1.5} />
                                            Xem Script / Kịch Bản
                                            <ExternalLink className="w-3.5 h-3.5 text-teal-500 group-hover:text-teal-300 ml-auto group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" strokeWidth={1.5} />
                                        </a>
                                    ) : null}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ════════════════════════════════════════
                        3. DEADLINE & FINANCE
                    ════════════════════════════════════════ */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                        {/* DEADLINE */}
                        <div className={cn(
                            "p-4 rounded-2xl border space-y-2 transition-all",
                            isOverdue
                                ? "bg-red-500/8 border-red-500/25 shadow-[0_0_20px_rgba(239,68,68,0.08)]"
                                : "bg-zinc-900/50 border-white/8"
                        )}>
                            <label className={cn(
                                "text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5",
                                isOverdue ? "text-red-400" : "text-zinc-500"
                            )}>
                                <Clock className="w-3.5 h-3.5" strokeWidth={2} />
                                Deadline
                                {isOverdue && <span className="ml-1 text-red-400 animate-pulse">— QUÁ HẠN</span>}
                                <BulkToggle field="deadline" label="Deadline" />
                            </label>
                            {isEditing && isAdmin ? (
                                <input
                                    type="datetime-local"
                                    value={form.deadline}
                                    onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                                    disabled={!!(isBulkMode && !enabledFields['deadline'])}
                                    className={cn(
                                        "w-full bg-zinc-800/60 p-2 border border-white/10 rounded-lg text-sm font-bold text-zinc-200 outline-none focus:border-indigo-500/40 transition-all",
                                        isBulkMode && !enabledFields['deadline'] ? 'opacity-40 cursor-not-allowed' : ''
                                    )}
                                />
                            ) : (
                                <p className={cn("text-base font-black", isOverdue ? "text-red-400" : "text-zinc-100")}>
                                    {form.deadline
                                        ? `${new Date(form.deadline).toLocaleDateString('vi-VN')} @ ${new Date(form.deadline).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
                                        : <span className="text-zinc-500 font-medium">No Limit</span>}
                                </p>
                            )}
                        </div>

                        {/* FINANCE (admin only) */}
                        {isAdmin && (
                            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/8 space-y-3 shadow-inner relative overflow-hidden">
                                {/* Ambient glow */}
                                <div className="absolute -top-6 -right-6 w-24 h-24 bg-emerald-500/6 blur-2xl rounded-full pointer-events-none" />
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                                    <DollarSign className="w-3.5 h-3.5" strokeWidth={2} />
                                    Finance Info
                                </label>
                                <div className="flex justify-between items-end gap-4">
                                    <div>
                                        <p className="text-[9px] text-zinc-600 uppercase font-bold mb-1">Client ($)</p>
                                        {isEditing ? (
                                            <input
                                                type="number"
                                                value={form.jobPriceUSD}
                                                onChange={(e) => setForm({ ...form, jobPriceUSD: parseFloat(e.target.value) || 0 })}
                                                className="bg-zinc-800/60 border border-white/8 rounded-lg p-1.5 text-sm w-20 font-mono text-emerald-400 outline-none focus:border-emerald-500/40 transition-all"
                                            />
                                        ) : (
                                            <p className="text-lg font-mono font-black text-emerald-400">${form.jobPriceUSD}</p>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[9px] text-zinc-600 uppercase font-bold mb-1">Staff (VND)</p>
                                        {isEditing ? (
                                            <input
                                                type="number"
                                                value={form.value}
                                                onChange={(e) => setForm({ ...form, value: parseFloat(e.target.value) || 0 })}
                                                className="bg-zinc-800/60 border border-white/8 rounded-lg p-1.5 text-sm w-28 font-mono text-amber-400 text-right outline-none focus:border-amber-500/40 transition-all"
                                            />
                                        ) : (
                                            <p className="text-lg font-mono font-black text-amber-400">{form.value.toLocaleString()}₫</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ════════════════════════════════════════
                        4. GHI CHÚ TIẾNG VIỆT
                    ════════════════════════════════════════ */}
                    <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5" strokeWidth={1.5} />
                                Ghi chú (Tiếng Việt)
                                <BulkToggle field="notes" label="Notes VI" />
                            </label>
                            <button
                                onClick={() => {
                                    const cleanText = form.notes_vi.replace(/<[^>]*>/g, '').trim();
                                    navigator.clipboard.writeText(cleanText);
                                    toast.success('Đã copy nội dung tiếng Việt');
                                }}
                                className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-600 hover:text-zinc-300"
                                title="Copy nội dung Tiếng Việt"
                            >
                                <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                            </button>
                        </div>
                        {isEditing && isAdmin ? (
                            <div className="h-[250px] border border-white/8 rounded-2xl overflow-hidden shadow-inner">
                                <TiptapEditor
                                    content={form.notes_vi}
                                    onChange={(html) => setForm({ ...form, notes_vi: html })}
                                />
                            </div>
                        ) : (
                            <div
                                className="bg-zinc-900/50 p-5 rounded-2xl text-zinc-300 text-[14px] leading-[1.7] prose prose-invert prose-sm max-w-none border border-white/5"
                                dangerouslySetInnerHTML={{ __html: ensureExternalLinks(DOMPurify.sanitize(localTask.notes_vi || form.notes_vi || "Chưa có hướng dẫn cụ thể.")) }}
                            />
                        )}
                    </div>

                    {/* ════════════════════════════════════════
                        5. NOTES (ENGLISH)
                    ════════════════════════════════════════ */}
                    <div className="space-y-2.5">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                            <BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
                            Notes (English Translation for Client)
                            <BulkToggle field="notes_en" label="Notes EN" />
                        </label>
                        {isEditing ? (
                            <div className="h-[250px] border border-indigo-500/15 rounded-2xl overflow-hidden shadow-inner bg-indigo-500/3">
                                <TiptapEditor
                                    content={form.notes_en}
                                    onChange={(html) => setForm({ ...form, notes_en: html })}
                                />
                            </div>
                        ) : (
                            <div className="bg-zinc-900/40 p-5 rounded-2xl border border-white/5">
                                {(!localTask.notes_en || localTask.notes_en.trim() === '' || localTask.notes_en === '<p></p>') ? (
                                    <div className="flex items-center gap-2 text-zinc-600 text-sm italic py-2">
                                        <AlertTriangle className="w-4 h-4 text-zinc-700 flex-shrink-0" strokeWidth={1.5} />
                                        Chưa có bản dịch Tiếng Anh. Bấm Edit để nhập thủ công.
                                    </div>
                                ) : (
                                    <div
                                        className="text-zinc-300 text-[14px] leading-[1.7] prose prose-invert prose-sm max-w-none"
                                        dangerouslySetInnerHTML={{ __html: ensureExternalLinks(DOMPurify.sanitize(localTask.notes_en)) }}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── SAVE FOOTER ───────────────────────────── */}
                {isEditing && (
                    <div className="p-5 bg-zinc-900/80 border-t border-white/5 backdrop-blur-sm">
                        <button
                            onClick={handleSave}
                            className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:brightness-110 text-white font-black text-sm uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-indigo-900/40 active:scale-[0.98]"
                        >
                            Lưu thay đổi
                        </button>
                    </div>
                )}

                {/* ── CHECKLIST OVERLAY ─────────────────────── */}
                {showChecklist && (
                    <ManagerReviewChecklist
                        taskId={localTask.id}
                        workspaceId={workspaceId}
                        onClose={() => setShowChecklist(false)}
                        onSuccess={() => {
                            setShowChecklist(false);
                            onClose();
                            window.location.reload();
                        }}
                    />
                )}
            </DialogContent>
        </Dialog>
    )
}
