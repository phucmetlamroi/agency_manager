"use client"

import { useState, useEffect, useRef } from "react"
import { TaskWithUser } from "@/types/admin"
import { updateTaskDetails } from "@/actions/update-task-details"
import { updateTaskStatus } from "@/actions/task-actions"
import { getFrameAccount, updateFrameAccount } from "@/actions/global-settings"
import { toast } from "sonner"
import { Dialog } from "@/components/ui/dialog"
import dynamic from 'next/dynamic'
import DOMPurify from 'isomorphic-dompurify'
import { ensureExternalLinks, cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import {
    Copy, ExternalLink, FolderOpen, Film, FolderInput,
    ChevronUp, ChevronDown, Clock, DollarSign, ClipboardList,
    FileText, AlertTriangle, Pencil, CheckCircle, BookOpen,
    Link2, Layers, Tag, X, PackageCheck, Bookmark, CalendarClock,
    MessageSquare, Languages, Timer, ChevronRight, MonitorPlay
} from "lucide-react"
import ManagerReviewChecklist from "./ManagerReviewChecklist"
import { TagLibraryPopup } from "@/components/tags/TagLibraryPopup"
import { TagRadialMenu } from "@/components/tags/TagRadialMenu"
import { TagPills } from "@/components/tags/TagPills"
import { DurationInput } from "@/components/ui/DurationInput"
import { getTagsForUser, setTaskTags, getTaskTags } from "@/actions/tag-actions"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { TaskChatSection } from "@/components/chat/TaskChatSection"

const TiptapEditor = dynamic(() => import('@/components/tiptap/TiptapEditor'), { ssr: false })

// ── Status map matching HustlyTasker spec ────────────────────
const TASK_STATUSES = [
    { id: "waiting", label: "Đang đợi giao", color: "#A855F7" },
    { id: "Đang đợi giao", label: "Đang đợi giao", color: "#A855F7" },
    { id: "assigned", label: "Nhận task", color: "#3B82F6" },
    { id: "Nhận task", label: "Nhận task", color: "#3B82F6" },
    { id: "in_progress", label: "Đang thực hiện", color: "#EAB308" },
    { id: "Đang thực hiện", label: "Đang thực hiện", color: "#EAB308" },
    { id: "review", label: "Review", color: "#F97316" },
    { id: "Review", label: "Review", color: "#F97316" },
    { id: "revision", label: "Revision", color: "#EF4444" },
    { id: "Revision", label: "Revision", color: "#EF4444" },
    { id: "fix_frame", label: "Sửa frame", color: "#EC4899" },
    { id: "Sửa frame", label: "Sửa frame", color: "#EC4899" },
    { id: "paused", label: "Tạm ngưng", color: "#71717A" },
    { id: "Tạm ngưng", label: "Tạm ngưng", color: "#71717A" },
    { id: "completed", label: "Hoàn tất", color: "#10B981" },
    { id: "Hoàn tất", label: "Hoàn tất", color: "#10B981" },
] as const

function getStatusObj(status: string) {
    return TASK_STATUSES.find(s => s.id === status) || { id: status, label: status, color: "#71717A" }
}

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
    // Accordion state: track which sections are open (null = section 1 open by default)
    const [openSections, setOpenSections] = useState<Record<number, boolean>>({ 1: true })
    // Bulk Mode: which fields are enabled for overwrite
    const [enabledFields, setEnabledFields] = useState<Record<string, boolean>>({})
    const toggleField = (field: string) => setEnabledFields(prev => ({ ...prev, [field]: !prev[field] }))
    const [frameAccount, setFrameAccount] = useState({ account: '', password: '' })
    // Tag & Duration state
    const [tagLibraryOpen, setTagLibraryOpen] = useState(false)
    const [tagLibraryPos, setTagLibraryPos] = useState({ x: 0, y: 0 })
    const [radialMenuOpen, setRadialMenuOpen] = useState(false)
    const [radialOrigin, setRadialOrigin] = useState({ x: 0, y: 0 })
    const [allTags, setAllTags] = useState<{ id: string; name: string }[]>([])
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
    const ctrlDragRef = useRef<{ active: boolean; startX: number; startY: number }>({ active: false, startX: 0, startY: 0 })
    const dragRafRef = useRef<number>(0)
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
        scriptLink: '',
        duration: ''
    })

    // Toggle accordion section
    const toggleSection = (id: number) => {
        setOpenSections(prev => ({ ...prev, [id]: !prev[id] }))
    }

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
                scriptLink: scriptUrl,
                duration: task.duration || ''
            })
            setIsEditing(false)
            setOpenSections({ 1: true })

            // Reset and load tags for this task
            setSelectedTagIds([])
            getTaskTags(task.id).then(res => {
                if (res.tags) setSelectedTagIds(res.tags.map(t => t.id))
            })
        }
    }, [task])

    // Load all available tags when modal opens
    useEffect(() => {
        if (isOpen) {
            getTagsForUser(workspaceId).then(res => {
                if (res.tags) setAllTags(res.tags)
            })
        }
    }, [isOpen, workspaceId])

    useEffect(() => {
        if (isOpen) {
            getFrameAccount().then(data => { setFrameAccount(data) })
        }
    }, [isOpen])

    // ── Native DOM event listeners for tag zone gestures ──
    // Uses capture phase to intercept before Radix Dialog can swallow events
    const tagZoneRef = useRef<HTMLDivElement | null>(null)

    const isInteractiveTarget = (target: HTMLElement) => {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'TEXTAREA' || tag === 'A') return true
        if (target.closest('.tiptap') || target.closest('[contenteditable]') || target.closest('a')) return true
        return false
    }

    const isInsideTagZone = (target: HTMLElement) => {
        if (tagZoneRef.current && (tagZoneRef.current === target || tagZoneRef.current.contains(target))) return true
        return !!target.closest('[data-tag-zone="true"]')
    }

    useEffect(() => {
        if (!isOpen || !isAdmin) return

        // Find the tag zone element after render (Radix Dialog creates a Portal)
        const findTagZone = () => document.querySelector('[data-tag-zone="true"]') as HTMLDivElement | null
        const timer = setTimeout(() => { tagZoneRef.current = findTagZone() }, 100)

        // ── contextmenu (right-click) -> open Tag Library ──
        const handleContextMenu = (e: MouseEvent) => {
            const target = e.target as HTMLElement
            if (!isInsideTagZone(target)) return
            if (isInteractiveTarget(target)) return

            e.preventDefault()
            e.stopPropagation()
            e.stopImmediatePropagation()
            setTagLibraryPos({ x: e.clientX, y: e.clientY })
            setTagLibraryOpen(true)
        }

        // ── mousedown (Ctrl+left-click) -> start drag tracking ──
        const handleMouseDown = (e: MouseEvent) => {
            if (!e.ctrlKey || e.button !== 0) return
            const target = e.target as HTMLElement
            if (!isInsideTagZone(target)) return
            if (isInteractiveTarget(target)) return

            e.preventDefault()
            e.stopPropagation()
            e.stopImmediatePropagation()
            document.body.style.userSelect = 'none'
            document.body.style.pointerEvents = 'none'
            ctrlDragRef.current = { active: true, startX: e.clientX, startY: e.clientY }
        }

        // ── mousemove -> rAF-synced threshold check -> open radial menu ──
        const handleMouseMove = (e: MouseEvent) => {
            const drag = ctrlDragRef.current
            if (!drag.active) return

            const cx = e.clientX, cy = e.clientY
            cancelAnimationFrame(dragRafRef.current)
            dragRafRef.current = requestAnimationFrame(() => {
                if (!drag.active) return
                const dx = cx - drag.startX
                const dy = cy - drag.startY
                if (dx * dx + dy * dy > 16) {
                    document.body.style.pointerEvents = ''
                    document.body.style.userSelect = ''
                    setRadialOrigin({ x: drag.startX, y: drag.startY })
                    setRadialMenuOpen(true)
                    drag.active = false
                }
            })
        }

        // ── mouseup -> reset drag state + restore body styles ──
        const handleMouseUp = () => {
            if (ctrlDragRef.current.active) {
                document.body.style.userSelect = ''
                document.body.style.pointerEvents = ''
            }
            ctrlDragRef.current.active = false
        }

        document.addEventListener('contextmenu', handleContextMenu, true)
        document.addEventListener('mousedown', handleMouseDown, true)
        document.addEventListener('mousemove', handleMouseMove, { passive: true } as EventListenerOptions)
        document.addEventListener('mouseup', handleMouseUp, true)

        return () => {
            clearTimeout(timer)
            cancelAnimationFrame(dragRafRef.current)
            document.removeEventListener('contextmenu', handleContextMenu, true)
            document.removeEventListener('mousedown', handleMouseDown, true)
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp, true)
            document.body.style.userSelect = ''
            document.body.style.pointerEvents = ''
        }
    }, [isOpen, isAdmin])

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
            collectFilesLink: form.collectFilesLink,
            duration: isAdmin ? form.duration || undefined : undefined
        }, workspaceId)

        // Save tags (admin only)
        if (isAdmin && localTask) {
            await setTaskTags(localTask.id, selectedTagIds, workspaceId)
        }

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

    // ── Bulk Toggle ─────────────────────────────
    const BulkToggle = ({ field, label }: { field: string; label: string }) => {
        if (!isBulkMode || !isEditing) return null
        return (
            <label className="inline-flex items-center gap-1.5 cursor-pointer ml-2">
                <button
                    type="button"
                    role="checkbox"
                    aria-checked={!!enabledFields[field]}
                    onClick={() => toggleField(field)}
                    className="w-[16px] h-[16px] shrink-0 rounded-full border-2 transition-all duration-200 flex items-center justify-center cursor-pointer"
                    style={{
                        borderColor: enabledFields[field] ? '#F59E0B' : '#52525B',
                        background: enabledFields[field] ? '#F59E0B' : 'transparent',
                        boxShadow: enabledFields[field] ? '0 0 8px rgba(245,158,11,0.4)' : 'none',
                    }}
                >
                    {enabledFields[field] && (
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    )}
                </button>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${enabledFields[field] ? 'text-amber-400' : 'text-zinc-600'}`}>
                    {enabledFields[field] ? 'GHI ĐÈ' : 'GIỮ'}
                </span>
            </label>
        )
    }

    // ── Deadline status ───────────────────────────────────────
    const isOverdue = form.deadline && new Date() > new Date(form.deadline) && localTask?.status !== 'Hoàn tất'

    // ── Status object for ambient coloring ────────────────────
    const statusObj = getStatusObj(localTask.status)

    // ── Accordion Section wrapper ─────────────────────────────
    const AccordionSection = ({
        id, icon, iconColor, title, rightSlot, children
    }: {
        id: number
        icon: React.ReactNode
        iconColor: string
        title: string
        rightSlot?: React.ReactNode
        children: React.ReactNode
    }) => {
        const isOpen = !!openSections[id]
        return (
            <div
                style={{
                    borderRadius: 16,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    overflow: 'hidden',
                }}
            >
                {/* Section header */}
                <div
                    onClick={() => toggleSection(id)}
                    className="flex items-center justify-between cursor-pointer select-none transition-colors hover:bg-white/[0.02]"
                    style={{
                        padding: '12px 16px',
                        borderBottom: isOpen ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    }}
                >
                    <div className="flex items-center gap-2">
                        <span style={{ color: iconColor }} className="flex-shrink-0">
                            {icon}
                        </span>
                        <span className="text-xs font-bold text-zinc-100">{title}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {rightSlot}
                        {isOpen
                            ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" strokeWidth={1.5} />
                            : <ChevronDown className="w-3.5 h-3.5 text-zinc-600" strokeWidth={1.5} />
                        }
                    </div>
                </div>
                {/* Section body */}
                <AnimatePresence initial={false}>
                    {isOpen && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                        >
                            <div className="flex flex-col gap-3" style={{ padding: '14px 16px' }}>
                                {children}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        )
    }

    // ── Link button (view mode) ───────────────────────────────
    const LinkButton = ({ href, label, icon, accent }: { href: string | null; label: string; icon: React.ReactNode; accent?: string }) => (
        <a
            href={href ? formatLink(href) : '#'}
            target="_blank"
            rel="noopener"
            className={cn(
                "flex items-center gap-2 rounded-[10px] text-xs font-semibold transition-all",
                href
                    ? "text-indigo-300 hover:bg-white/[0.04]"
                    : "text-zinc-700 pointer-events-none"
            )}
            style={{
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                textDecoration: 'none',
            }}
        >
            <span className="flex-shrink-0" style={{ color: accent }}>
                {icon}
            </span>
            <span className="flex-1">{label}</span>
            {href ? (
                <ExternalLink className="w-3 h-3 text-zinc-600" strokeWidth={1.5} />
            ) : (
                <span className="text-[10px] text-zinc-700">Chua co</span>
            )}
        </a>
    )

    // ── Input style helper ────────────────────────────────────
    const inputCls = "w-full h-10 rounded-[10px] bg-white/[0.04] border border-white/[0.08] px-3.5 text-zinc-300 text-xs outline-none focus:border-indigo-500/50 transition-all placeholder:text-zinc-600"

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogPrimitive.Portal>
                {/* ── OVERLAY matching spec: bg black/65%, blur 8px ── */}
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

                {/* ── MODAL CONTAINER ── */}
                <DialogPrimitive.Content asChild>
                    <motion.div
                        className="fixed left-1/2 top-1/2 flex flex-col outline-none"
                        style={{
                            zIndex: 9999,
                            width: 640,
                            maxWidth: 'calc(100vw - 32px)',
                            maxHeight: '90vh',
                            borderRadius: 24,
                            background: '#111113',
                            border: '1px solid rgba(255,255,255,0.08)',
                            boxShadow: '0 32px 80px rgba(0,0,0,0.70)',
                            x: '-50%',
                            y: '-50%',
                        }}
                        initial={{ opacity: 0, scale: 0.96, y: '-48%', x: '-50%' }}
                        animate={{ opacity: 1, scale: 1, y: '-50%', x: '-50%' }}
                        exit={{ opacity: 0, scale: 0.96, y: '-48%', x: '-50%' }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    >
                        {/* ── Ambient orb (colored by status) ── */}
                        <div
                            className="absolute pointer-events-none"
                            style={{
                                top: -50, right: -50, width: 160, height: 160,
                                borderRadius: '50%',
                                background: statusObj.color,
                                opacity: 0.06,
                                filter: 'blur(50px)',
                            }}
                        />

                        {/* ═══ HEADER (sticky) ═══════════════════════════ */}
                        <div
                            className="flex items-start gap-3.5 flex-shrink-0"
                            style={{
                                padding: '18px 22px',
                                borderBottom: '1px solid rgba(255,255,255,0.06)',
                                position: 'sticky', top: 0,
                                background: '#111113',
                                zIndex: 2,
                                borderRadius: '24px 24px 0 0',
                            }}
                        >
                            {/* Left side */}
                            <div className="flex-1 min-w-0">
                                {/* Icon row */}
                                <div className="flex items-center gap-2 mb-1.5">
                                    <Layers className="w-3.5 h-3.5 text-indigo-500" strokeWidth={2} />
                                    <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-[0.08em]">
                                        Task Details & Actions
                                    </span>
                                </div>

                                {/* Client name */}
                                {localTask.client?.name && (
                                    <div className="text-[10px] font-bold text-blue-500 uppercase tracking-[0.04em] mb-1">
                                        {localTask.client.name}
                                    </div>
                                )}

                                {/* Task name */}
                                <div className="text-lg font-extrabold text-zinc-100 leading-tight line-clamp-2 tracking-tight">
                                    {localTask.title}
                                </div>

                                {/* Status badges */}
                                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                    {/* Status pill */}
                                    <span
                                        className="inline-flex items-center gap-1 rounded-full text-[10px] font-bold"
                                        style={{
                                            padding: '3px 10px',
                                            background: `${statusObj.color}18`,
                                            color: statusObj.color,
                                            border: `1px solid ${statusObj.color}30`,
                                        }}
                                    >
                                        <span
                                            className="rounded-full"
                                            style={{ width: 5, height: 5, background: statusObj.color }}
                                        />
                                        {statusObj.label}
                                    </span>

                                    {/* Type pill */}
                                    {localTask.type && (
                                        <span
                                            className="rounded-full text-[10px] font-bold"
                                            style={{
                                                padding: '3px 10px',
                                                background: 'rgba(99,102,241,0.12)',
                                                color: '#A5B4FC',
                                                border: '1px solid rgba(99,102,241,0.20)',
                                            }}
                                        >
                                            {localTask.type}
                                        </span>
                                    )}

                                    {/* Overdue */}
                                    {isOverdue && (
                                        <span className="text-[10px] font-bold text-red-500 animate-pulse">
                                            OVERDUE
                                        </span>
                                    )}
                                </div>

                                {/* Bulk mode indicator */}
                                {isBulkMode && (
                                    <div className="mt-2 flex flex-col gap-1.5">
                                        <div className="px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/25 rounded-lg text-[10px] text-amber-400 flex items-center gap-1.5 w-fit">
                                            <AlertTriangle className="w-3 h-3" strokeWidth={2} />
                                            <span className="font-bold">BULK MODE:</span>
                                            <span>Chinh sua {bulkSelectedIds.length} tasks</span>
                                        </div>
                                        {isEditing && (
                                            <div className="px-2.5 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-[10px] text-indigo-300 w-fit max-w-xs">
                                                Bat checkbox canh moi field de dua vao cap nhat hang loat.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Right side: Edit + Close */}
                            <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                                {(isAdmin || !isEditing) && (
                                    <button
                                        onClick={() => setIsEditing(!isEditing)}
                                        className="rounded-full text-[11px] font-bold cursor-pointer whitespace-nowrap transition-all"
                                        style={{
                                            padding: '8px 14px',
                                            background: isEditing ? 'rgba(245,158,11,0.12)' : 'rgba(99,102,241,0.12)',
                                            border: isEditing ? '1px solid rgba(245,158,11,0.25)' : '1px solid rgba(99,102,241,0.25)',
                                            color: isEditing ? '#FBBF24' : '#A5B4FC',
                                        }}
                                    >
                                        {isEditing ? 'Huy' : (isAdmin ? 'Edit All' : 'Submit / Note')}
                                    </button>
                                )}
                                <DialogPrimitive.Close asChild>
                                    <button
                                        className="flex items-center justify-center rounded-full cursor-pointer transition-colors hover:bg-white/[0.06]"
                                        style={{
                                            width: 34, height: 34,
                                            background: 'rgba(255,255,255,0.04)',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            color: '#52525B',
                                        }}
                                    >
                                        <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                                    </button>
                                </DialogPrimitive.Close>
                            </div>
                        </div>

                        {/* ═══ BODY (scrollable, 7 accordion sections) ═══ */}
                        <div
                            className="flex-1 overflow-y-auto flex flex-col gap-3 custom-scrollbar"
                            style={{ padding: '16px 22px' }}
                        >
                            {/* Tag zone wrapper for sections 2-7 gesture events */}
                            <div
                                ref={tagZoneRef}
                                data-tag-zone="true"
                                className="flex flex-col gap-3"
                            >

                            {/* ═══ SECTION 1: Thanh Pham (Delivery) ═══════ */}
                            <AccordionSection
                                id={1}
                                icon={<PackageCheck className="w-[15px] h-[15px]" strokeWidth={1.5} />}
                                iconColor="#10B981"
                                title="Thanh Pham (Delivery)"
                            >
                                {(!localTask.productLink && !isAdmin) || isEditingLink ? (
                                    /* Input mode */
                                    <div className="flex flex-col gap-2">
                                        <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wide">Product Link</span>
                                        <div className="flex gap-2">
                                            <div className="relative flex-1">
                                                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" strokeWidth={1.5} />
                                                <input
                                                    value={form.productLink}
                                                    onChange={(e) => setForm({ ...form, productLink: e.target.value })}
                                                    placeholder="Dan link san pham (Google Drive, ...)"
                                                    className={cn(inputCls, "pl-9")}
                                                />
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    await handleSave();
                                                    if (!isAdmin) {
                                                        const res = await updateTaskStatus(localTask.id, 'Review', workspaceId, undefined, undefined, localTask.version)
                                                        if (res?.error) toast.error(res.error)
                                                        else toast.success('Da nop bai (Sent to Review)')
                                                    }
                                                    setIsEditingLink(false);
                                                }}
                                                className="px-4 rounded-[10px] text-[11px] font-bold text-white cursor-pointer whitespace-nowrap transition-all hover:brightness-110 active:scale-[0.97]"
                                                style={{ background: '#10B981', border: 'none' }}
                                            >
                                                Xac nhan Nop Bai
                                            </button>
                                        </div>
                                    </div>
                                ) : localTask.productLink ? (
                                    <div className="group relative">
                                        <a
                                            href={formatLink(localTask.productLink)}
                                            target="_blank"
                                            className="flex items-center gap-2 rounded-[10px] text-xs font-semibold text-indigo-300 transition-all hover:bg-white/[0.04]"
                                            style={{
                                                padding: '10px 14px',
                                                background: 'rgba(255,255,255,0.03)',
                                                border: '1px solid rgba(255,255,255,0.06)',
                                                textDecoration: 'none',
                                            }}
                                        >
                                            <ExternalLink className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" strokeWidth={1.5} />
                                            <span className="flex-1 text-zinc-100 font-bold text-sm">Mo Link San Pham</span>
                                            <ExternalLink className="w-3 h-3 text-zinc-600" strokeWidth={1.5} />
                                        </a>
                                        <button
                                            onClick={() => setIsEditingLink(true)}
                                            className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-zinc-800 border border-white/10 rounded-full shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-zinc-700"
                                            title="Edit link"
                                        >
                                            <Pencil className="w-2.5 h-2.5 text-zinc-400" strokeWidth={1.5} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-xs text-zinc-700 italic">Chua co link thanh pham.</div>
                                )}
                                <BulkToggle field="productLink" label="Product Link" />
                            </AccordionSection>

                            {/* ═══ SECTION 2: Resources ═══════════════════ */}
                            <AccordionSection
                                id={2}
                                icon={<FolderOpen className="w-[15px] h-[15px]" strokeWidth={1.5} />}
                                iconColor="#6366F1"
                                title="Resources"
                            >
                                <BulkToggle field="resources" label="Resources" />
                                {isEditing && isAdmin ? (
                                    <div className={cn("flex flex-col gap-2", isBulkMode && !enabledFields['resources'] ? 'opacity-40 pointer-events-none' : '')}>
                                        {/* RAW */}
                                        <div>
                                            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wide">RAW Source</span>
                                            <div className="relative mt-1">
                                                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" strokeWidth={1.5} />
                                                <input
                                                    value={form.linkRaw}
                                                    onChange={(e) => setForm({ ...form, linkRaw: e.target.value })}
                                                    placeholder="Link RAW Source..."
                                                    className={cn(inputCls, "pl-9")}
                                                />
                                            </div>
                                        </div>
                                        {/* B-Roll */}
                                        <div>
                                            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wide">B-Roll</span>
                                            <div className="relative mt-1">
                                                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" strokeWidth={1.5} />
                                                <input
                                                    value={form.linkBroll}
                                                    onChange={(e) => setForm({ ...form, linkBroll: e.target.value })}
                                                    placeholder="Link B-Roll..."
                                                    className={cn(inputCls, "pl-9")}
                                                />
                                            </div>
                                        </div>
                                        {/* Project Mau */}
                                        <div>
                                            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wide">Project Mau</span>
                                            <div className="relative mt-1">
                                                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-600" strokeWidth={1.5} />
                                                <input
                                                    value={form.collectFilesLink || ''}
                                                    onChange={(e) => setForm({ ...form, collectFilesLink: e.target.value })}
                                                    placeholder="Link Project Mau..."
                                                    className={cn(inputCls, "pl-9")}
                                                    style={{ borderColor: 'rgba(245,158,11,0.20)' }}
                                                />
                                            </div>
                                        </div>
                                        {/* Folder Nop File */}
                                        <div>
                                            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wide">Folder Nop File</span>
                                            <div className="relative mt-1">
                                                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-500" strokeWidth={1.5} />
                                                <input
                                                    value={form.submissionFolder || ''}
                                                    onChange={(e) => setForm({ ...form, submissionFolder: e.target.value })}
                                                    placeholder="Link Folder Nop File..."
                                                    className={cn(inputCls, "pl-9")}
                                                    style={{ borderColor: 'rgba(59,130,246,0.20)' }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-1.5">
                                        <LinkButton href={form.linkRaw || null} label="RAW Assets" icon={<FolderOpen className="w-3.5 h-3.5" strokeWidth={1.5} />} accent="#3B82F6" />
                                        <LinkButton href={form.linkBroll || null} label="B-Roll Assets" icon={<Film className="w-3.5 h-3.5" strokeWidth={1.5} />} accent="#A855F7" />
                                        <LinkButton href={localTask.collectFilesLink || null} label="Project Mau" icon={<Layers className="w-3.5 h-3.5" strokeWidth={1.5} />} accent="#F59E0B" />

                                        {/* Submission folder + Frame.io + Checklist */}
                                        <div className="flex rounded-[10px] overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                                            {form.submissionFolder ? (
                                                <a href={formatLink(form.submissionFolder)} target="_blank" className="flex-1 flex items-center gap-2 p-2.5 text-xs font-bold text-indigo-300 hover:bg-white/[0.03] transition-all" style={{ background: 'rgba(99,102,241,0.06)', textDecoration: 'none' }}>
                                                    <FolderInput className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
                                                    Folder Nop File
                                                </a>
                                            ) : (
                                                <div className="flex-1 flex items-center gap-2 p-2.5 text-xs font-bold text-zinc-700" style={{ background: 'rgba(255,255,255,0.02)' }}>
                                                    <FolderInput className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
                                                    Chua co Folder Nop
                                                </div>
                                            )}
                                            <button
                                                onClick={() => setIsFrameExpanded(!isFrameExpanded)}
                                                className="px-2.5 flex items-center gap-1 text-zinc-500 text-[10px] font-bold cursor-pointer transition-colors hover:bg-white/[0.04] whitespace-nowrap"
                                                style={{ background: 'rgba(255,255,255,0.02)', borderLeft: '1px solid rgba(255,255,255,0.06)' }}
                                                title="Frame.io (Global)"
                                            >
                                                Frame.io
                                                {isFrameExpanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                                            </button>
                                            {isAdmin && (
                                                <button
                                                    onClick={() => setShowChecklist(true)}
                                                    className="px-2.5 flex items-center gap-1 text-red-400 text-[10px] font-bold cursor-pointer transition-colors hover:bg-red-500/10 whitespace-nowrap"
                                                    style={{ background: 'rgba(239,68,68,0.06)', borderLeft: '1px solid rgba(255,255,255,0.06)' }}
                                                    title="Manager Review Checklist"
                                                >
                                                    <ClipboardList className="w-3 h-3" strokeWidth={1.5} />
                                                    Checklist
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* FRAME.IO PANEL */}
                                {isFrameExpanded && (
                                    <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-1" style={{ padding: 14, background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 12, marginTop: 4 }}>
                                        <p className="text-[11px] text-indigo-400/80 italic flex items-center gap-1.5">
                                            <AlertTriangle className="w-3 h-3 flex-shrink-0" strokeWidth={2} />
                                            Tai khoan danh cho truong hop bi out khoi Frame team
                                        </p>
                                        {[
                                            { label: 'Tai khoan', key: 'account', val: frameAccount.account, onCopy: () => { navigator.clipboard.writeText(frameAccount.account); toast.success('Da copy tai khoan') } },
                                            { label: 'Mat khau', key: 'password', val: frameAccount.password, onCopy: () => { navigator.clipboard.writeText(frameAccount.password); toast.success('Da copy mat khau') } },
                                        ].map(({ label, key, val, onCopy }) => (
                                            <div key={key} className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-zinc-500 w-20 flex-shrink-0">{label}:</span>
                                                {isEditing && isAdmin ? (
                                                    <input
                                                        value={key === 'account' ? frameAccount.account : frameAccount.password}
                                                        onChange={e => setFrameAccount({ ...frameAccount, [key]: e.target.value })}
                                                        placeholder={label}
                                                        className="flex-1 p-2 text-sm bg-zinc-900/60 border border-white/[0.08] rounded-lg outline-none focus:border-indigo-500/40 font-mono text-zinc-300"
                                                    />
                                                ) : (
                                                    <div className="flex-1 p-2 text-sm bg-zinc-900/40 border border-white/5 rounded-lg text-zinc-400 font-mono">
                                                        {val || '---'}
                                                    </div>
                                                )}
                                                <button
                                                    onClick={onCopy}
                                                    className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs font-bold rounded-lg border border-white/[0.08] transition-colors shadow-sm whitespace-nowrap active:scale-95 cursor-pointer"
                                                >
                                                    Copy
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </AccordionSection>

                            {/* ═══ SECTION 3: References ══════════════════ */}
                            <AccordionSection
                                id={3}
                                icon={<Bookmark className="w-[15px] h-[15px]" strokeWidth={1.5} />}
                                iconColor="#06B6D4"
                                title="References"
                            >
                                <BulkToggle field="references" label="References" />
                                {isEditing && isAdmin ? (
                                    <div className={cn("flex flex-col gap-2", isBulkMode && !enabledFields['references'] ? 'opacity-40 pointer-events-none' : '')}>
                                        <div>
                                            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wide">Reference Link</span>
                                            <div className="relative mt-1">
                                                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" strokeWidth={1.5} />
                                                <input
                                                    value={form.references}
                                                    onChange={(e) => setForm({ ...form, references: e.target.value })}
                                                    placeholder="Reference link..."
                                                    className={cn(inputCls, "pl-9")}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wide">Script / Kich Ban</span>
                                            <div className="relative mt-1">
                                                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-teal-500" strokeWidth={1.5} />
                                                <input
                                                    value={form.scriptLink}
                                                    onChange={(e) => setForm({ ...form, scriptLink: e.target.value })}
                                                    placeholder="Script / Transcript link..."
                                                    className={cn(inputCls, "pl-9")}
                                                    style={{ borderColor: 'rgba(20,184,166,0.20)' }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-1.5">
                                        <LinkButton href={form.references || null} label="View Reference" icon={<MonitorPlay className="w-3.5 h-3.5" strokeWidth={1.5} />} accent="#06B6D4" />
                                        {form.scriptLink && (
                                            <LinkButton href={form.scriptLink} label="Xem Script / Kich Ban" icon={<FileText className="w-3.5 h-3.5" strokeWidth={1.5} />} accent="#14B8A6" />
                                        )}
                                    </div>
                                )}
                            </AccordionSection>

                            {/* ═══ SECTION 4: Deadline & Finance ══════════ */}
                            <AccordionSection
                                id={4}
                                icon={<CalendarClock className="w-[15px] h-[15px]" strokeWidth={1.5} />}
                                iconColor="#F59E0B"
                                title="Deadline & Finance"
                            >
                                <div className="grid grid-cols-2 gap-3">
                                    {/* Deadline */}
                                    <div>
                                        <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wide flex items-center gap-1">
                                            <Clock className="w-3 h-3" strokeWidth={2} />
                                            Deadline
                                            {isOverdue && <span className="ml-1 text-red-400 animate-pulse">— QUA HAN</span>}
                                        </span>
                                        <BulkToggle field="deadline" label="Deadline" />
                                        {isEditing && isAdmin ? (
                                            <input
                                                type="datetime-local"
                                                value={form.deadline}
                                                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                                                disabled={!!(isBulkMode && !enabledFields['deadline'])}
                                                className={cn(
                                                    inputCls, "mt-1",
                                                    isBulkMode && !enabledFields['deadline'] ? 'opacity-40 cursor-not-allowed' : ''
                                                )}
                                                style={{ colorScheme: 'dark' }}
                                            />
                                        ) : (
                                            <div className={cn("mt-1.5 text-[13px] font-bold", isOverdue ? "text-red-400" : form.deadline ? "text-zinc-100" : "text-zinc-700")}>
                                                {form.deadline
                                                    ? `${new Date(form.deadline).toLocaleDateString('vi-VN')} @ ${new Date(form.deadline).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
                                                    : 'No Limit'}
                                            </div>
                                        )}
                                    </div>

                                    {/* Finance */}
                                    {isAdmin && (
                                        <div
                                            className="relative overflow-hidden"
                                            style={{
                                                borderRadius: 12,
                                                background: 'rgba(255,255,255,0.02)',
                                                border: '1px solid rgba(255,255,255,0.04)',
                                                padding: 12,
                                            }}
                                        >
                                            <div className="flex items-center gap-1.5 mb-2">
                                                <DollarSign className="w-3.5 h-3.5 text-zinc-500" strokeWidth={2} />
                                                <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wide">Finance Info</span>
                                            </div>
                                            {isEditing ? (
                                                <div className="flex flex-col gap-2">
                                                    <div>
                                                        <span className="text-[10px] text-zinc-600">Client ($)</span>
                                                        <input
                                                            type="number"
                                                            value={form.jobPriceUSD}
                                                            onChange={(e) => setForm({ ...form, jobPriceUSD: parseFloat(e.target.value) || 0 })}
                                                            className={cn(inputCls, "h-[34px] mt-0.5")}
                                                        />
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] text-zinc-600">Staff (VND)</span>
                                                        <input
                                                            type="number"
                                                            value={form.value}
                                                            onChange={(e) => setForm({ ...form, value: parseFloat(e.target.value) || 0 })}
                                                            className={cn(inputCls, "h-[34px] mt-0.5")}
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex justify-between">
                                                        <span className="text-[11px] text-zinc-500">Client ($)</span>
                                                        <span className="text-[13px] font-bold font-mono text-emerald-400">
                                                            {form.jobPriceUSD ? `$${Number(form.jobPriceUSD).toLocaleString()}` : '—'}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-[11px] text-zinc-500">Staff (VND)</span>
                                                        <span className="text-[13px] font-bold font-mono text-amber-400">
                                                            {form.value ? `${Number(form.value).toLocaleString('vi-VN')}d` : '—'}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </AccordionSection>

                            {/* ═══ SECTION 5: Ghi chu (Tieng Viet) ════════ */}
                            <AccordionSection
                                id={5}
                                icon={<MessageSquare className="w-[15px] h-[15px]" strokeWidth={1.5} />}
                                iconColor="#A855F7"
                                title="Ghi chu (Tieng Viet)"
                                rightSlot={
                                    form.notes_vi ? (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                const cleanText = form.notes_vi.replace(/<[^>]*>/g, '').trim();
                                                navigator.clipboard.writeText(cleanText);
                                                toast.success('Da copy noi dung tieng Viet');
                                            }}
                                            className="flex items-center justify-center rounded-md cursor-pointer transition-colors hover:bg-white/[0.06]"
                                            style={{
                                                width: 26, height: 26,
                                                background: 'rgba(255,255,255,0.04)',
                                                border: '1px solid rgba(255,255,255,0.06)',
                                                color: '#52525B',
                                            }}
                                            title="Copy noi dung Tieng Viet"
                                        >
                                            <Copy className="w-3 h-3" strokeWidth={1.5} />
                                        </button>
                                    ) : undefined
                                }
                            >
                                <BulkToggle field="notes" label="Notes VI" />
                                {isEditing && isAdmin ? (
                                    <div className="h-[250px] border border-white/[0.08] rounded-2xl overflow-hidden shadow-inner">
                                        <TiptapEditor
                                            content={form.notes_vi}
                                            onChange={(html) => setForm({ ...form, notes_vi: html })}
                                        />
                                    </div>
                                ) : (
                                    <div
                                        className="bg-zinc-900/50 p-4 rounded-xl text-zinc-300 text-[13px] leading-[1.7] prose prose-invert prose-sm max-w-none border border-white/5"
                                        dangerouslySetInnerHTML={{ __html: ensureExternalLinks(DOMPurify.sanitize(localTask.notes_vi || form.notes_vi || "Chua co huong dan cu the.")) }}
                                    />
                                )}
                            </AccordionSection>

                            {/* ═══ SECTION 6: Notes (English) ═════════════ */}
                            <AccordionSection
                                id={6}
                                icon={<Languages className="w-[15px] h-[15px]" strokeWidth={1.5} />}
                                iconColor="#6366F1"
                                title="Notes (English)"
                            >
                                <BulkToggle field="notes_en" label="Notes EN" />
                                {isEditing ? (
                                    <div className="h-[250px] border border-indigo-500/15 rounded-2xl overflow-hidden shadow-inner" style={{ background: 'rgba(99,102,241,0.03)' }}>
                                        <TiptapEditor
                                            content={form.notes_en}
                                            onChange={(html) => setForm({ ...form, notes_en: html })}
                                        />
                                    </div>
                                ) : (
                                    <div className="bg-zinc-900/40 p-4 rounded-xl border border-white/5">
                                        {(!localTask.notes_en || localTask.notes_en.trim() === '' || localTask.notes_en === '<p></p>') ? (
                                            <div className="flex items-center gap-2 text-zinc-600 text-sm italic py-2">
                                                <AlertTriangle className="w-4 h-4 text-zinc-700 flex-shrink-0" strokeWidth={1.5} />
                                                Chua co ban dich Tieng Anh. Bam Edit de nhap thu cong.
                                            </div>
                                        ) : (
                                            <div
                                                className="text-zinc-300 text-[13px] leading-[1.7] prose prose-invert prose-sm max-w-none"
                                                dangerouslySetInnerHTML={{ __html: ensureExternalLinks(DOMPurify.sanitize(localTask.notes_en)) }}
                                            />
                                        )}
                                    </div>
                                )}
                            </AccordionSection>

                            {/* ═══ SECTION 7: Tags & Duration ═════════════ */}
                            <AccordionSection
                                id={7}
                                icon={<Tag className="w-[15px] h-[15px]" strokeWidth={1.5} />}
                                iconColor="#F59E0B"
                                title="Tags & Duration"
                            >
                                {/* Duration */}
                                {(isAdmin || form.duration) && (
                                    <div>
                                        <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wide">Duration</span>
                                        <div className="mt-1">
                                            {isEditing && isAdmin ? (
                                                <DurationInput
                                                    value={form.duration || null}
                                                    onChange={(val) => setForm({ ...form, duration: val })}
                                                    disabled={!isAdmin || !isEditing}
                                                />
                                            ) : (
                                                <span
                                                    className="inline-flex items-center gap-1 rounded-full text-[11px] font-bold"
                                                    style={{
                                                        padding: '4px 10px',
                                                        background: 'rgba(245,158,11,0.10)',
                                                        border: '1px solid rgba(245,158,11,0.20)',
                                                        color: '#FBBF24',
                                                    }}
                                                >
                                                    <Timer className="w-3 h-3" strokeWidth={1.5} />
                                                    {form.duration || '—'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Tags */}
                                <div data-tag-zone="true">
                                    <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wide">Tags</span>
                                    <div className="mt-1.5">
                                        <TagPills
                                            tags={allTags.filter(t => selectedTagIds.includes(t.id))}
                                            onRemove={isAdmin && isEditing ? (tagId) => setSelectedTagIds(prev => prev.filter(id => id !== tagId)) : undefined}
                                            readonly={!isAdmin || !isEditing}
                                        />
                                    </div>

                                    {/* Empty state hint */}
                                    {selectedTagIds.length === 0 && allTags.length === 0 && isAdmin && (
                                        <p className="text-xs text-zinc-600 italic text-center py-2">
                                            Chuot phai de tao Tag moi
                                        </p>
                                    )}

                                    {isAdmin && (
                                        <span className="text-zinc-600 text-[9px] normal-case font-medium mt-1 block">
                                            (Chuot phai = Tag Library / Ctrl+Keo = Chon Tag)
                                        </span>
                                    )}
                                </div>
                            </AccordionSection>

                            {/* ═══ SECTION 8: Task Discussion ═════════════ */}
                            <AccordionSection
                                id={8}
                                icon={<MessageSquare className="w-[15px] h-[15px]" strokeWidth={1.5} />}
                                iconColor="#8B5CF6"
                                title="Discussion"
                            >
                                {localTask && (
                                    <TaskChatSection
                                        taskId={localTask.id}
                                        workspaceId={workspaceId}
                                    />
                                )}
                            </AccordionSection>

                            </div>{/* close tag zone wrapper */}
                        </div>

                        {/* ═══ FOOTER (edit mode only) ════════════════════ */}
                        {isEditing && (
                            <div
                                className="flex-shrink-0"
                                style={{
                                    padding: '14px 22px',
                                    borderTop: '1px solid rgba(255,255,255,0.06)',
                                }}
                            >
                                <button
                                    onClick={handleSave}
                                    className="w-full rounded-xl text-[13px] font-bold text-white cursor-pointer transition-all hover:brightness-110 active:scale-[0.98]"
                                    style={{
                                        padding: '12px 0',
                                        background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                                        border: 'none',
                                        boxShadow: '0 8px 24px rgba(79,70,229,0.30)',
                                    }}
                                >
                                    Luu thay doi
                                </button>
                            </div>
                        )}

                        {/* ── CHECKLIST OVERLAY ──────────────────────── */}
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
                    </motion.div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>

            {/* ── TAG LIBRARY POPUP (Right-click) ──────────── */}
            <TagLibraryPopup
                isOpen={tagLibraryOpen}
                onClose={() => setTagLibraryOpen(false)}
                position={tagLibraryPos}
                workspaceId={workspaceId}
                onTagsChanged={(tags) => setAllTags(tags)}
            />

            {/* ── TAG RADIAL MENU (Ctrl+Drag) ─────────────── */}
            <TagRadialMenu
                isOpen={radialMenuOpen}
                origin={radialOrigin}
                tags={allTags}
                selectedTagIds={selectedTagIds}
                onToggle={(tagId) => {
                    setSelectedTagIds(prev =>
                        prev.includes(tagId)
                            ? prev.filter(id => id !== tagId)
                            : [...prev, tagId]
                    )
                }}
                onClose={() => setRadialMenuOpen(false)}
            />
        </Dialog>
    )
}
