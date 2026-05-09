"use client"

import React, { useState, useEffect } from "react"
import { TaskWithUser } from "@/types/admin"
import { updateTaskDetails } from "@/actions/update-task-details"
import { toast } from "sonner"
import { Dialog } from "@/components/ui/dialog"
import dynamic from 'next/dynamic'
import DOMPurify from 'isomorphic-dompurify'
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import {
    X, Pencil, LayoutGrid, FolderOpen, StickyNote, ExternalLink,
} from "lucide-react"
import * as DialogPrimitive from "@radix-ui/react-dialog"

const TiptapEditor = dynamic(() => import('@/components/tiptap/TiptapEditor'), { ssr: false })

/* ────────────────────────────────────────────────────────────────────── */
/*  Status / Type maps                                                     */
/* ────────────────────────────────────────────────────────────────────── */

const STATUS_COLORS: Record<string, { label: string; color: string; bg: string }> = {
    'Nhận task': { label: 'Nhận task', color: '#3B82F6', bg: 'rgba(59,130,246,0.10)' },
    'Đã nhận task': { label: 'Đã nhận task', color: '#3B82F6', bg: 'rgba(59,130,246,0.10)' },
    'Đang đợi giao': { label: 'Đang đợi giao', color: '#A855F7', bg: 'rgba(168,85,247,0.10)' },
    'Đang thực hiện': { label: 'Progress', color: '#EAB308', bg: 'rgba(234,179,8,0.10)' },
    'Revision': { label: 'Revision', color: '#EF4444', bg: 'rgba(239,68,68,0.10)' },
    'Sửa frame': { label: 'Sửa frame', color: '#EC4899', bg: 'rgba(236,72,153,0.10)' },
    'Gửi lại': { label: 'Gửi lại', color: '#F97316', bg: 'rgba(249,115,22,0.10)' },
    'Tạm ngưng': { label: 'Tạm ngưng', color: '#71717A', bg: 'rgba(113,113,122,0.10)' },
    'Hoàn tất': { label: 'Complete', color: '#10B981', bg: 'rgba(16,185,129,0.10)' },
    'Quá hạn': { label: 'Overdue', color: '#DC2626', bg: 'rgba(220,38,38,0.10)' },
    'Đã hủy': { label: 'Đã hủy', color: '#52525B', bg: 'rgba(82,82,91,0.10)' },
}
const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
    'Short form': { color: '#38BDF8', bg: 'rgba(56,189,248,0.10)' },
    'Long form': { color: '#A78BFA', bg: 'rgba(139,92,246,0.10)' },
    'Trial': { color: '#FBBF24', bg: 'rgba(245,158,11,0.10)' },
    'Short': { color: '#38BDF8', bg: 'rgba(56,189,248,0.10)' },
    'Long': { color: '#A78BFA', bg: 'rgba(139,92,246,0.10)' },
}

function getStatusInfo(status: string) {
    return STATUS_COLORS[status] || { label: status, color: '#71717A', bg: 'rgba(113,113,122,0.10)' }
}
function getTypeInfo(type: string) {
    return TYPE_COLORS[type] || { color: '#A1A1AA', bg: 'rgba(161,161,170,0.10)' }
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                */
/* ────────────────────────────────────────────────────────────────────── */

function formatDate(d: Date | string | null): string {
    if (!d) return '—'
    const dt = new Date(d)
    if (isNaN(dt.getTime())) return '—'
    const pad = (n: number) => (n < 10 ? '0' + n : String(n))
    return `${dt.getFullYear()} - ${pad(dt.getMonth() + 1)} - ${pad(dt.getDate())}`
}

function parseContent(content: string | null): string {
    if (!content) return ''
    if (/<[a-z][\s\S]*>/i.test(content)) return content
    return content.split('\n').filter((l) => l.trim()).map((l) => `<p>${l}</p>`).join('')
}

function formatLink(link: string | null) {
    if (!link) return '#'
    if (link.startsWith('http')) return link
    return `https://${link}`
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Sub-components                                                         */
/* ────────────────────────────────────────────────────────────────────── */

function Card({
    title,
    children,
    className = '',
}: {
    title?: string
    children: React.ReactNode
    className?: string
}) {
    return (
        <div
            className={cn(
                "rounded-2xl bg-white/[0.04] border border-[rgba(139,92,246,0.12)] p-4 flex flex-col",
                className,
            )}
        >
            {title && (
                <h4 className="text-[12px] font-bold uppercase tracking-wide text-zinc-400 mb-3">
                    {title}
                </h4>
            )}
            {children}
        </div>
    )
}

function StatusPill({ status }: { status: string }) {
    const s = getStatusInfo(status)
    return (
        <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold"
            style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}30` }}
        >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
            {s.label}
        </span>
    )
}
function TypePill({ type }: { type: string }) {
    if (!type) return null
    const t = getTypeInfo(type)
    return (
        <span
            className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold"
            style={{ background: t.bg, color: t.color, border: `1px solid ${t.color}30` }}
        >
            {type}
        </span>
    )
}

/** Tab navigation pill (3 tabs) */
function TabNav({
    activeTab,
    onChange,
}: {
    activeTab: 'main' | 'assets' | 'notes'
    onChange: (tab: 'main' | 'assets' | 'notes') => void
}) {
    const tabs = [
        { id: 'main' as const, label: 'Main', icon: LayoutGrid },
        { id: 'assets' as const, label: 'Assets', icon: FolderOpen },
        { id: 'notes' as const, label: 'Notes', icon: StickyNote },
    ]
    return (
        <div className="mx-6 my-4 flex items-center bg-white/[0.04] border border-white/5 rounded-full p-1">
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id
                const Icon = tab.icon
                return (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => onChange(tab.id)}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2 rounded-full text-[13px] font-semibold transition-colors",
                            isActive
                                ? "bg-white/[0.08] text-white shadow-[0_2px_8px_rgba(139,92,246,0.15)]"
                                : "text-zinc-400 hover:text-zinc-200",
                        )}
                    >
                        <Icon size={14} strokeWidth={1.8} />
                        {tab.label}
                    </button>
                )
            })}
        </div>
    )
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Field row (for resources/references read mode)                         */
/* ────────────────────────────────────────────────────────────────────── */

function ResourceRow({
    label,
    value,
    isEditing,
    onChange,
    placeholder,
}: {
    label: string
    value: string
    isEditing: boolean
    onChange: (v: string) => void
    placeholder?: string
}) {
    if (isEditing) {
        return (
            <div className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-zinc-400">{label}</span>
                <input
                    type="url"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder ?? `Paste ${label.toLowerCase()} link`}
                    className="h-9 w-full rounded-full bg-white/[0.04] border border-[rgba(139,92,246,0.12)] px-3.5 text-[12px] text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-violet-500/50"
                />
            </div>
        )
    }
    return (
        <div className="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0">
            <span className="text-[12px] font-medium text-zinc-300 flex-shrink-0">{label}</span>
            {value?.trim() ? (
                <a
                    href={formatLink(value)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 max-w-[60%] text-[12px] text-violet-400 hover:text-violet-300 truncate"
                >
                    <span className="truncate">{value}</span>
                    <ExternalLink size={11} className="flex-shrink-0" />
                </a>
            ) : (
                <span className="text-[12px] text-zinc-600">None</span>
            )}
        </div>
    )
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Main Component                                                         */
/* ────────────────────────────────────────────────────────────────────── */

interface TaskDetailModalProps {
    task: TaskWithUser | null
    isOpen: boolean
    onClose: () => void
    isAdmin: boolean
    bulkSelectedIds?: string[]
    workspaceId: string
}

export function TaskDetailModal({
    task,
    isOpen,
    onClose,
    isAdmin,
    workspaceId,
}: TaskDetailModalProps) {
    const [activeTab, setActiveTab] = useState<'main' | 'assets' | 'notes'>('main')
    const [isEditing, setIsEditing] = useState(false)
    const [saving, setSaving] = useState(false)
    const [localTask, setLocalTask] = useState<TaskWithUser | null>(null)

    // Flat form state — same shape as before for backward-compat with action signature
    const [form, setForm] = useState({
        productLink: '',
        deadline: '',
        jobPriceUSD: 0,
        value: 0,
        // Resources tab fields (parsed from `resources` packed string)
        linkRaw: '',
        linkBroll: '',
        submissionFolder: '',
        // References tab fields (parsed from `references` packed string)
        references: '',
        scriptLink: '',
        collectFilesLink: '',
        // Notes tab — single TipTap rich text (notes_vi field, notes_en deprecated)
        notes: '',
    })

    /* ── Sync from task prop ── */
    useEffect(() => {
        if (!task) return
        setLocalTask(task)

        // Parse packed resources string ("RAW:...|BROLL:...|SUBMISSION:...")
        const resString = task.resources || task.fileLink || ''
        let raw = ''
        let broll = ''
        let submission = ''
        if (resString.startsWith('RAW:')) {
            const parts = resString.split('|')
            parts.forEach((p) => {
                const t = p.trim()
                if (t.startsWith('RAW:')) raw = t.replace('RAW:', '').trim()
                if (t.startsWith('BROLL:')) broll = t.replace('BROLL:', '').trim()
                if (t.startsWith('SUBMISSION:')) submission = t.replace('SUBMISSION:', '').trim()
            })
        } else {
            raw = resString
        }

        // Parse packed references string ("REF:...|SCRIPT:...")
        let refUrl = task.references || ''
        let scriptUrl = ''
        if (refUrl.startsWith('REF:')) {
            const refParts = refUrl.split('|')
            refParts.forEach((p) => {
                const t = p.trim()
                if (t.startsWith('REF:')) refUrl = t.replace('REF:', '').trim()
                if (t.startsWith('SCRIPT:')) scriptUrl = t.replace('SCRIPT:', '').trim()
            })
        }

        let deadlineStr = ''
        if (task.deadline) {
            const d = new Date(task.deadline)
            const pad = (n: number) => (n < 10 ? '0' + n : String(n))
            deadlineStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
        }

        setForm({
            productLink: task.productLink || '',
            deadline: deadlineStr,
            jobPriceUSD: task.jobPriceUSD || 0,
            value: task.value || 0,
            linkRaw: raw,
            linkBroll: broll,
            submissionFolder: task.submissionFolder || submission,
            references: refUrl,
            scriptLink: scriptUrl,
            collectFilesLink: task.collectFilesLink || '',
            notes: parseContent(task.notes_vi),
        })
        setIsEditing(false)
        setActiveTab('main')
    }, [task])

    if (!isOpen || !localTask) return null

    const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }))

    /* ── Save ── */
    const handleSave = async () => {
        setSaving(true)
        try {
            // Re-pack resources + references as before (preserve backward compat)
            const combinedResources =
                form.linkRaw || form.linkBroll || form.submissionFolder
                    ? `RAW: ${form.linkRaw.trim()} | BROLL: ${form.linkBroll.trim()} | SUBMISSION: ${form.submissionFolder.trim()}`
                    : ''
            const combinedReferences = form.scriptLink
                ? `REF:${form.references.trim()} | SCRIPT:${form.scriptLink.trim()}`
                : form.references
            const cleanNotes = DOMPurify.sanitize(form.notes)

            const res = await updateTaskDetails(
                localTask.id,
                {
                    resources: combinedResources,
                    references: combinedReferences,
                    notes: cleanNotes,
                    // Sprint H: notes_en consolidated into single `notes` field per Figma redesign
                    notes_en: '',
                    productLink: form.productLink,
                    deadline: form.deadline || undefined,
                    jobPriceUSD: isAdmin ? Number(form.jobPriceUSD) : undefined,
                    value: isAdmin ? Number(form.value) : undefined,
                    collectFilesLink: form.collectFilesLink,
                },
                workspaceId,
            )

            if (res?.success) {
                setLocalTask((prev) =>
                    prev
                        ? {
                            ...prev,
                            resources: combinedResources,
                            references: combinedReferences,
                            notes_vi: cleanNotes,
                            notes_en: null,
                            productLink: form.productLink,
                            value: isAdmin ? Number(form.value) : prev.value,
                            jobPriceUSD: isAdmin ? Number(form.jobPriceUSD) : prev.jobPriceUSD,
                            collectFilesLink: form.collectFilesLink,
                            submissionFolder: form.submissionFolder,
                        }
                        : null,
                )
                setIsEditing(false)
                toast.success('Task updated')
            } else {
                toast.error('Failed to update')
            }
        } catch (err: any) {
            toast.error(err?.message || 'Save failed')
        } finally {
            setSaving(false)
        }
    }

    const handleCancel = () => {
        // Reset form from task (re-trigger sync via setLocalTask)
        if (task) setLocalTask(task)
        setIsEditing(false)
    }

    /* ── Status info for header pill ── */
    const statusInfo = getStatusInfo(localTask.status)

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogPrimitive.Portal>
                {/* Overlay */}
                <DialogPrimitive.Overlay asChild>
                    <motion.div
                        className="fixed inset-0"
                        style={{ zIndex: 9999, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    />
                </DialogPrimitive.Overlay>

                {/* Modal */}
                <DialogPrimitive.Content asChild>
                    <motion.div
                        className="fixed left-1/2 top-1/2 flex flex-col outline-none"
                        style={{
                            zIndex: 9999,
                            width: 720,
                            maxWidth: 'calc(100vw - 32px)',
                            maxHeight: '90vh',
                            borderRadius: 24,
                            background: 'rgba(10,10,10,0.95)',
                            border: '1px solid rgba(139,92,246,0.15)',
                            backdropFilter: 'blur(24px)',
                            boxShadow: '0 32px 80px rgba(0,0,0,0.70)',
                            x: '-50%',
                            y: '-50%',
                        }}
                        initial={{ opacity: 0, scale: 0.96, y: '-48%', x: '-50%' }}
                        animate={{ opacity: 1, scale: 1, y: '-50%', x: '-50%' }}
                        exit={{ opacity: 0, scale: 0.96, y: '-48%', x: '-50%' }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    >
                        {/* Ambient orb (status-tinted) */}
                        <div
                            className="absolute pointer-events-none"
                            style={{
                                top: -50, right: -50, width: 160, height: 160,
                                borderRadius: '50%',
                                background: statusInfo.color,
                                opacity: 0.08,
                                filter: 'blur(50px)',
                            }}
                        />

                        {/* ── HEADER ── */}
                        <div className="flex flex-col gap-3 px-6 pt-6 pb-3 border-b border-white/5 relative z-[1]">
                            <div className="flex items-center justify-between">
                                <h2 className="text-[16px] font-extrabold text-white">Task Details</h2>
                                <div className="flex items-center gap-2">
                                    {isAdmin && !isEditing && (
                                        <button
                                            type="button"
                                            onClick={() => setIsEditing(true)}
                                            className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/[0.04] border border-[rgba(139,92,246,0.20)] text-[12px] font-semibold text-zinc-200 hover:bg-white/[0.08] transition-colors"
                                        >
                                            <Pencil size={12} />
                                            Edit All
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="flex items-center justify-center w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.10] text-zinc-400 hover:text-white transition-colors"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>

                            {/* Title + follow-up + pills */}
                            <div className="flex flex-col gap-2">
                                <h3 className="text-[18px] font-extrabold text-white tracking-tight truncate">
                                    {localTask.title}
                                </h3>
                                <p className="text-[12px] text-zinc-400">
                                    Follow-up: <span className="text-zinc-300">{formatDate(localTask.deadline)}</span>
                                </p>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <StatusPill status={localTask.status} />
                                    {localTask.type && <TypePill type={localTask.type} />}
                                </div>
                            </div>
                        </div>

                        {/* ── TAB NAV ── */}
                        <TabNav activeTab={activeTab} onChange={setActiveTab} />

                        {/* ── TAB CONTENT ── */}
                        <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar relative z-[1]">
                            {/* TAB MAIN */}
                            {activeTab === 'main' && (
                                <div className="grid grid-cols-2 gap-4">
                                    {/* LEFT — Delivery */}
                                    <Card title="Delivery" className="min-h-[220px]">
                                        {isEditing ? (
                                            <textarea
                                                value={form.productLink}
                                                onChange={(e) => set('productLink', e.target.value)}
                                                placeholder="Final products / delivery link / status note..."
                                                className="flex-1 w-full rounded-xl bg-white/[0.04] border border-[rgba(139,92,246,0.12)] p-3 text-[13px] text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-violet-500/50 resize-none min-h-[150px]"
                                            />
                                        ) : form.productLink?.trim() ? (
                                            form.productLink.startsWith('http') ? (
                                                <a
                                                    href={formatLink(form.productLink)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-[13px] text-violet-400 hover:text-violet-300 break-all inline-flex items-start gap-1"
                                                >
                                                    <span>{form.productLink}</span>
                                                    <ExternalLink size={12} className="flex-shrink-0 mt-0.5" />
                                                </a>
                                            ) : (
                                                <p className="text-[13px] text-zinc-300 leading-relaxed whitespace-pre-wrap">
                                                    {form.productLink}
                                                </p>
                                            )
                                        ) : (
                                            <p className="text-[13px] text-zinc-600">Final products are pending.</p>
                                        )}
                                    </Card>

                                    {/* RIGHT — Deadline + Finance stacked */}
                                    <div className="flex flex-col gap-4">
                                        <Card title="Deadline">
                                            {isEditing ? (
                                                <input
                                                    type="datetime-local"
                                                    value={form.deadline}
                                                    onChange={(e) => set('deadline', e.target.value)}
                                                    className="h-10 w-full rounded-full bg-white/[0.04] border border-[rgba(139,92,246,0.12)] px-3.5 text-[13px] text-zinc-300 outline-none focus:border-violet-500/50"
                                                />
                                            ) : (
                                                <span className="text-[14px] font-semibold text-zinc-200">
                                                    {formatDate(localTask.deadline)}
                                                </span>
                                            )}
                                        </Card>

                                        <Card title="Finance">
                                            {isEditing && isAdmin ? (
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-[12px] text-zinc-400">Client ($)</span>
                                                        <input
                                                            type="number"
                                                            value={form.jobPriceUSD}
                                                            onChange={(e) => set('jobPriceUSD', Number(e.target.value))}
                                                            className="w-28 h-8 rounded-full bg-white/[0.04] border border-[rgba(139,92,246,0.12)] px-3 text-[13px] text-zinc-300 text-right outline-none focus:border-violet-500/50"
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-[12px] text-zinc-400">Staff (VND)</span>
                                                        <input
                                                            type="number"
                                                            value={form.value}
                                                            onChange={(e) => set('value', Number(e.target.value))}
                                                            className="w-32 h-8 rounded-full bg-white/[0.04] border border-[rgba(139,92,246,0.12)] px-3 text-[13px] text-zinc-300 text-right outline-none focus:border-violet-500/50"
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[12px] text-zinc-400">Client ($)</span>
                                                        <span className="text-[14px] font-bold text-emerald-400">
                                                            $ {Number(form.jobPriceUSD || 0).toLocaleString('en-US')}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[12px] text-zinc-400">Staff (VND)</span>
                                                        <span className="text-[14px] font-bold text-zinc-200">
                                                            VND {Number(form.value || 0).toLocaleString('vi-VN')}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </Card>
                                    </div>
                                </div>
                            )}

                            {/* TAB ASSETS */}
                            {activeTab === 'assets' && (
                                <div className="grid grid-cols-2 gap-4">
                                    {/* Resources */}
                                    <Card title="Resources">
                                        <div className="flex flex-col">
                                            <ResourceRow
                                                label="RAW Assets"
                                                value={form.linkRaw}
                                                isEditing={isEditing}
                                                onChange={(v) => set('linkRaw', v)}
                                            />
                                            <ResourceRow
                                                label="B-Roll Assets"
                                                value={form.linkBroll}
                                                isEditing={isEditing}
                                                onChange={(v) => set('linkBroll', v)}
                                            />
                                            <ResourceRow
                                                label="View Script"
                                                value={form.scriptLink}
                                                isEditing={isEditing}
                                                onChange={(v) => set('scriptLink', v)}
                                            />
                                            <ResourceRow
                                                label="Submission Folder"
                                                value={form.submissionFolder}
                                                isEditing={isEditing}
                                                onChange={(v) => set('submissionFolder', v)}
                                            />
                                        </div>
                                    </Card>

                                    {/* References */}
                                    <Card title="References">
                                        <div className="flex flex-col">
                                            <ResourceRow
                                                label="View Reference"
                                                value={form.references}
                                                isEditing={isEditing}
                                                onChange={(v) => set('references', v)}
                                            />
                                            <ResourceRow
                                                label="Sample Project"
                                                value={form.collectFilesLink}
                                                isEditing={isEditing}
                                                onChange={(v) => set('collectFilesLink', v)}
                                            />
                                        </div>
                                    </Card>
                                </div>
                            )}

                            {/* TAB NOTES */}
                            {activeTab === 'notes' && (
                                <Card>
                                    {isEditing ? (
                                        <div className="rounded-xl overflow-hidden border border-white/5 bg-white/[0.02] min-h-[260px]">
                                            <TiptapEditor
                                                content={form.notes}
                                                onChange={(html) => set('notes', html)}
                                            />
                                        </div>
                                    ) : form.notes?.trim() ? (
                                        <div
                                            className="prose prose-invert prose-sm max-w-none text-zinc-300 leading-relaxed min-h-[200px]"
                                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(form.notes) }}
                                        />
                                    ) : (
                                        <p className="text-[13px] text-zinc-600 min-h-[200px]">No notes added.</p>
                                    )}
                                </Card>
                            )}
                        </div>

                        {/* ── FOOTER (edit mode only) ── */}
                        {isEditing && (
                            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-white/5 relative z-[1]">
                                <button
                                    type="button"
                                    onClick={handleCancel}
                                    disabled={saving}
                                    className="h-10 px-5 rounded-full bg-transparent border border-white/10 text-[13px] font-semibold text-zinc-400 hover:text-white hover:border-white/20 transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="h-10 px-6 rounded-full bg-[#8B5CF6] hover:bg-[#A855F7] text-[13px] font-bold text-white shadow-[0_8px_20px_rgba(139,92,246,0.35)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {saving ? 'Saving…' : 'Save'}
                                </button>
                            </div>
                        )}
                    </motion.div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </Dialog>
    )
}
