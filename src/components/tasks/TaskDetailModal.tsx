"use client"

// [P2-01] Desktop task-detail drawer. Refactored into a CONTAINER: all state,
// the parse-effect, and every server-action call (updateTaskDetails, bulk*,
// updateTaskStatus, get/saveHookGraph) live here; the presentational sections
// (TaskStatusBar / TaskMainSection / TaskResourcesSection / TaskCommentsSection)
// and the shared primitives (./detail-sections/_shared) receive props. Render
// output is byte-identical to the pre-split version (desktop DR-3 safe).
//
// NB overlay: the right-side drawer + zIndex:9999 + DialogPrimitive.Content asChild
// are intentionally KEPT here. z-index tokenisation was audited and deferred (the
// app's overlay stack legitimately runs to 99999 which the token scale can't
// express); the drawer→centered-dialog standardisation is the overlay phase
// (P2-PR5), device-tested there — not blind-changed in the split.

import React, { useState, useEffect } from "react"
import { TaskWithUser } from "@/types/admin"
import { updateTaskDetails } from "@/actions/update-task-details"
import { bulkUpdateTaskDetails, bulkUpdateTaskResourceSubfields } from "@/actions/bulk-task-actions"
import { updateTaskStatus } from "@/actions/task-actions"
import { failureMessage } from "@/lib/ui/action-feedback"
import { getHookGraph, saveHookGraph } from "@/actions/raw-footage-actions"
import type { HookGraph } from "@/lib/velox/hook-graph-types"
import { toast } from "sonner"
import { Dialog } from "@/components/ui/dialog"
import dynamic from 'next/dynamic'
// [Hotfix 2026-06-13] plain 'dompurify' (browser-only, zero deps) replaces
// isomorphic-dompurify: the latter eagerly required jsdom on the SERVER during
// SSR of this client component → ERR_REQUIRE_ESM 500 on Vercel. All .sanitize()
// calls here run client-side only (modal renders on interaction, post-hydration).
import DOMPurify from 'dompurify'
import { motion } from "framer-motion"
import { Lock, Play, Loader2 } from "lucide-react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import {
    getStatusInfo, parseContent, Card, EditButton, ConfirmCancelGroup, TabNav,
    type TaskDetailForm,
} from "./detail-sections/_shared"
import { TaskStatusBar } from "./detail-sections/TaskStatusBar"
import { TaskMainSection } from "./detail-sections/TaskMainSection"
import { TaskResourcesSection } from "./detail-sections/TaskResourcesSection"
import { TaskCommentsSection } from "./detail-sections/TaskCommentsSection"

const TiptapEditor = dynamic(() => import('@/components/tiptap/TiptapEditor'), { ssr: false })

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
    /**
     * Sprint M — viewer's user id. Required to gate non-admin task details
     * behind a "Bắt đầu" button (assignee must explicitly start before reading).
     * If omitted (admin views), gate is disabled — admin always sees full details.
     */
    currentUserId?: string
}

export function TaskDetailModal({
    task,
    isOpen,
    onClose,
    isAdmin,
    workspaceId,
    currentUserId,
    bulkSelectedIds,
}: TaskDetailModalProps) {
    // [Bulk fix] Determine if we're in bulk mode — user ticked multiple rows
    // AND the currently-open task is one of them. Single edit clicks (no
    // checkbox tick) fall through as normal single update.
    const isBulkMode = !!(
        bulkSelectedIds &&
        bulkSelectedIds.length > 1 &&
        task &&
        bulkSelectedIds.includes(task.id)
    )
    const bulkCount = bulkSelectedIds?.length ?? 0
    const [activeTab, setActiveTab] = useState<'main' | 'assets'>('main')
    const [localTask, setLocalTask] = useState<TaskWithUser | null>(null)

    // [Hook Graph] The saved Multi-Hook Map for this task (fetched on open).
    const [hookGraph, setHookGraph] = useState<HookGraph | null>(null)
    const [editingMap, setEditingMap] = useState(false)
    const [editGraph, setEditGraph] = useState<HookGraph | null>(null)
    const [savingMap, setSavingMap] = useState(false)
    // [Hook Graph] The Assets tab defaults to the Resources grid; clicking the
    // RAW Assets row (when a Multi-Hook Map exists) opens the map panel.
    const [showMapPanel, setShowMapPanel] = useState(false)

    useEffect(() => {
        if (!isOpen || !task?.id) {
            setHookGraph(null)
            setEditingMap(false)
            setEditGraph(null)
            setShowMapPanel(false)
            return
        }
        let cancelled = false
        setEditingMap(false)
        setEditGraph(null)
        setShowMapPanel(false)
        getHookGraph(task.id)
            .then((res) => {
                if (cancelled) return
                if ('ok' in res && res.ok && res.graph && res.graph.blocks.length > 0) {
                    setHookGraph(res.graph)
                } else {
                    setHookGraph(null)
                }
            })
            .catch(() => {
                if (!cancelled) setHookGraph(null)
            })
        return () => {
            cancelled = true
        }
    }, [isOpen, task?.id])

    const handleEditMap = () => {
        setEditGraph(hookGraph)
        setEditingMap(true)
    }
    const handleCancelMap = () => {
        setEditingMap(false)
        setEditGraph(null)
    }
    const handleSaveMap = async () => {
        if (!task?.id || !editGraph) return
        setSavingMap(true)
        try {
            const res = await saveHookGraph(task.id, editGraph)
            if ('error' in res) {
                toast.error(res.error || 'Không lưu được Multi-Hook Map.')
            } else {
                setHookGraph(editGraph)
                setEditingMap(false)
                toast.success('Đã lưu Multi-Hook Map.')
            }
        } catch (e) {
            toast.error(failureMessage(e, 'Lưu Multi-Hook Map thất bại.'))
        } finally {
            setSavingMap(false)
        }
    }

    // Per-card edit states (only one open at a time, but state per card)
    const [editingDelivery, setEditingDelivery] = useState(false)
    const [editingDeadline, setEditingDeadline] = useState(false)
    const [editingFinance, setEditingFinance] = useState(false)
    const [editingNotes, setEditingNotes] = useState(false)
    // [2026-06-30] Rename the task/video title (admin-only, single-task).
    const [editingTitle, setEditingTitle] = useState(false)
    const [draftTitle, setDraftTitle] = useState('')
    const [savingCard, setSavingCard] = useState(false)

    // [Sprint M] "Bắt đầu" gate — non-admin assignee must click before viewing details
    const [starting, setStarting] = useState(false)

    // Drafts for cards in edit mode
    const [draftDelivery, setDraftDelivery] = useState('')
    const [draftDeadline, setDraftDeadline] = useState('')
    const [draftFinance, setDraftFinance] = useState({ jobPriceUSD: 0, value: 0 })
    const [draftNotes, setDraftNotes] = useState('')

    // Live form (keeps current values for display + base for save merging)
    const [form, setForm] = useState<TaskDetailForm>({
        productLink: '',
        deadline: '',
        jobPriceUSD: 0,
        value: 0,
        linkRaw: '',
        linkBroll: '',
        submissionFolder: '',
        references: '',
        scriptLink: '',
        collectFilesLink: '',
        notes: '',
    })

    /* ── Sync from task prop ── */
    useEffect(() => {
        if (!task) return
        setLocalTask(task)

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
        setActiveTab('main')
        setEditingDelivery(false)
        setEditingDeadline(false)
        setEditingFinance(false)
        setEditingNotes(false)
        setEditingTitle(false)
    }, [task])

    if (!isOpen || !localTask) return null

    /* ── Generic per-field save ── */
    // [Bulk fix] Route to bulkUpdateTaskDetails when modal opens with multiple
    // rows ticked — previously bulkSelectedIds was declared in props but never
    // used, so save always hit only the current task. Now: if isBulkMode → save
    // to ALL selected; else → single task save (existing behavior).
    const saveSingle = async (
        patch: Parameters<typeof updateTaskDetails>[1],
        successMsg = 'Đã cập nhật',
    ) => {
        if (isBulkMode && bulkSelectedIds) {
            const res = await bulkUpdateTaskDetails(bulkSelectedIds, patch, workspaceId) as any
            if (res?.success) {
                toast.success(`Đã cập nhật ${res.count ?? bulkSelectedIds.length} task`)
                return true
            }
            toast.error(res?.error ?? 'Lưu hàng loạt thất bại')
            return false
        }

        const res = await updateTaskDetails(localTask.id, patch, workspaceId)
        if (res?.success) {
            toast.success(successMsg)
            return true
        }
        toast.error('Lưu thất bại')
        return false
    }

    /* ── Resources card: re-pack + save ── */
    // [Bulk fix] CRITICAL data-integrity rule: in bulk mode this function must
    // NEVER re-pack the current task's `resources`/`references` strings and
    // apply them to other tasks (that would overwrite their unique RAW/BROLL/
    // SCRIPT/SUBMISSION/REF subfields with the current task's values). Instead
    // we send a surgical subfield update via bulkUpdateTaskResourceSubfields,
    // and the server fetches each task's current packed string + merges only
    // the subfield the user actually changed.
    const saveResource = async (key: 'linkRaw' | 'linkBroll' | 'scriptLink' | 'submissionFolder', newValue: string) => {
        // ─── Bulk mode: per-task surgical subfield merge (server-side) ───
        if (isBulkMode && bulkSelectedIds) {
            const subfields: any = {}
            if (key === 'linkRaw') subfields.linkRaw = newValue
            else if (key === 'linkBroll') subfields.linkBroll = newValue
            else if (key === 'scriptLink') subfields.scriptLink = newValue
            else if (key === 'submissionFolder') subfields.submissionFolder = newValue

            const res = await bulkUpdateTaskResourceSubfields(bulkSelectedIds, subfields, workspaceId) as any
            if (res?.success) {
                toast.success(`Đã cập nhật ${key} cho ${res.count ?? bulkSelectedIds.length} task`)
                // Optimistic update for current task only (others refresh on revalidate)
                setForm((prev) => ({ ...prev, [key]: newValue }))
            } else {
                toast.error(res?.error ?? 'Lưu hàng loạt thất bại')
            }
            return
        }

        // ─── Single mode: existing pack-and-save flow ───
        const next = { ...form, [key]: newValue }
        const combinedResources =
            next.linkRaw || next.linkBroll || next.submissionFolder
                ? `RAW: ${next.linkRaw.trim()} | BROLL: ${next.linkBroll.trim()} | SUBMISSION: ${next.submissionFolder.trim()}`
                : ''
        // For scriptLink we save into references packed string
        const combinedReferences = next.scriptLink
            ? `REF:${next.references.trim()} | SCRIPT:${next.scriptLink.trim()}`
            : next.references

        // submissionFolder is packed inside `resources` string (legacy backend format)
        const ok = await saveSingle({
            resources: combinedResources,
            references: combinedReferences,
        })
        if (ok) {
            setForm(next)
            setLocalTask((prev) =>
                prev ? { ...prev, resources: combinedResources, references: combinedReferences, submissionFolder: next.submissionFolder } : null,
            )
        }
    }

    const saveReference = async (key: 'references' | 'collectFilesLink', newValue: string) => {
        // ─── Bulk mode: surgical subfield merge ───
        if (isBulkMode && bulkSelectedIds) {
            const subfields: any = {}
            if (key === 'references') subfields.referenceLink = newValue
            else if (key === 'collectFilesLink') subfields.collectFilesLink = newValue

            const res = await bulkUpdateTaskResourceSubfields(bulkSelectedIds, subfields, workspaceId) as any
            if (res?.success) {
                toast.success(`Đã cập nhật ${key} cho ${res.count ?? bulkSelectedIds.length} task`)
                setForm((prev) => ({ ...prev, [key]: newValue }))
            } else {
                toast.error(res?.error ?? 'Lưu hàng loạt thất bại')
            }
            return
        }

        // ─── Single mode: existing pack-and-save flow ───
        const next = { ...form, [key]: newValue }
        const combinedReferences = next.scriptLink
            ? `REF:${next.references.trim()} | SCRIPT:${next.scriptLink.trim()}`
            : next.references

        const ok = await saveSingle({
            references: key === 'references' || key === 'collectFilesLink' ? combinedReferences : undefined,
            collectFilesLink: key === 'collectFilesLink' ? newValue : undefined,
        })
        if (ok) {
            setForm(next)
            setLocalTask((prev) =>
                prev ? { ...prev, references: combinedReferences, collectFilesLink: next.collectFilesLink } : null,
            )
        }
    }

    /* ── Card-level save handlers ── */
    /**
     * [One-Click Delivery Submit]
     * Editor flow: paste link → click ✓ → link saved + (if non-admin assignee in
     * 'Đang thực hiện', single-task mode) auto-transition to Revision.
     *
     * Server-side `updateTaskStatus` detects isUserDelivery from runtime state
     * (newStatus=Revision, oldStatus=Đang thực hiện, isAssignee, productLink) and
     * fires email taskDelivered + audit task.delivered automatically.
     *
     * Bulk mode: skip auto-transition (multi-task status change via marker check
     * is out of scope — admin can bulk-update status separately).
     */
    const handleSaveDelivery = async () => {
        const trimmed = draftDelivery.trim()
        if (!trimmed) {
            toast.error('Cần nhập link Delivery trước khi xác nhận.')
            return
        }

        setSavingCard(true)
        const ok = await saveSingle({ productLink: trimmed })
        if (!ok) {
            setSavingCard(false)
            return
        }

        // Update local state with saved productLink
        setForm((p) => ({ ...p, productLink: trimmed }))
        setLocalTask((p) => (p ? { ...p, productLink: trimmed } : null))
        setEditingDelivery(false)

        // Auto-submit gate: only fires in single-task mode for non-admin assignee
        // whose task is currently 'Đang thực hiện'. Admin save / bulk save /
        // status mismatch → just save link, no transition.
        const shouldAutoSubmit =
            !isAdmin &&
            !!currentUserId &&
            localTask.assigneeId === currentUserId &&
            localTask.status === 'Đang thực hiện' &&
            !isBulkMode

        if (shouldAutoSubmit) {
            try {
                const res = await updateTaskStatus(localTask.id, 'Revision', workspaceId)
                if (res?.success) {
                    toast.success('Đã nộp bài — admin sẽ review sớm. Deadline đã được tạm dừng.')
                    setLocalTask((prev) => (prev ? { ...prev, status: 'Revision', deadline: null } : prev))
                } else {
                    // Save succeeded in DB but transition failed — user can retry by
                    // re-saving the same link (idempotent on productLink, FSM still
                    // allows Đang thực hiện → Revision).
                    toast.error(res?.error || 'Link đã lưu, nhưng chưa chuyển status. Vui lòng thử lại.')
                }
            } catch (e) {
                toast.error(failureMessage(e, 'Link đã lưu, nhưng chưa chuyển status. Vui lòng thử lại.'))
            }
        }

        setSavingCard(false)
    }

    const handleSaveDeadline = async () => {
        setSavingCard(true)
        const ok = await saveSingle({ deadline: draftDeadline || undefined })
        if (ok) {
            setForm((p) => ({ ...p, deadline: draftDeadline }))
            setLocalTask((p) => (p ? { ...p, deadline: draftDeadline ? new Date(draftDeadline) : null } : null))
            setEditingDeadline(false)
        }
        setSavingCard(false)
    }

    const handleSaveFinance = async () => {
        if (!isAdmin) return
        setSavingCard(true)
        const ok = await saveSingle({
            jobPriceUSD: Number(draftFinance.jobPriceUSD),
            value: Number(draftFinance.value),
        })
        if (ok) {
            setForm((p) => ({ ...p, jobPriceUSD: Number(draftFinance.jobPriceUSD), value: Number(draftFinance.value) }))
            setLocalTask((p) => (p ? { ...p, jobPriceUSD: Number(draftFinance.jobPriceUSD), value: Number(draftFinance.value) } : null))
            setEditingFinance(false)
        }
        setSavingCard(false)
    }

    const handleSaveNotes = async () => {
        setSavingCard(true)
        const cleanNotes = DOMPurify.sanitize(draftNotes)
        const ok = await saveSingle({ notes: cleanNotes, notes_en: '' })
        if (ok) {
            setForm((p) => ({ ...p, notes: cleanNotes }))
            setLocalTask((p) => (p ? { ...p, notes_vi: cleanNotes, notes_en: null } : null))
            setEditingNotes(false)
        }
        setSavingCard(false)
    }

    const handleSaveTitle = async () => {
        const trimmed = draftTitle.trim()
        if (!trimmed) { toast.error('Tên không được để trống'); return }
        setSavingCard(true)
        const ok = await saveSingle({ title: trimmed }, 'Đã đổi tên video')
        if (ok) {
            setLocalTask((p) => (p ? { ...p, title: trimmed } : null))
            setEditingTitle(false)
        }
        setSavingCard(false)
    }

    /* ── Edit mode entry helpers (set drafts from current form) ── */
    const enterEditTitle = () => {
        setDraftTitle(localTask?.title ?? '')
        setEditingTitle(true)
    }
    const enterEditDelivery = () => {
        setDraftDelivery(form.productLink)
        setEditingDelivery(true)
    }
    const enterEditDeadline = () => {
        setDraftDeadline(form.deadline)
        setEditingDeadline(true)
    }
    const enterEditFinance = () => {
        setDraftFinance({ jobPriceUSD: form.jobPriceUSD, value: form.value })
        setEditingFinance(true)
    }
    const enterEditNotes = () => {
        setDraftNotes(form.notes)
        setEditingNotes(true)
    }

    /* ── [Sprint M] Start-task gate (non-admin assignee + status='Nhận task') ── */
    const isLocked =
        !isAdmin &&
        !!currentUserId &&
        localTask.assigneeId === currentUserId &&
        (localTask.status === 'Nhận task' || localTask.status === 'Đã nhận task')

    const handleStartTask = async () => {
        if (starting) return
        setStarting(true)
        try {
            const res = await updateTaskStatus(localTask.id, 'Đang thực hiện', workspaceId)
            if (res?.success) {
                toast.success('Đã bắt đầu task — chúc bạn làm việc hiệu quả!')
                setLocalTask((prev) => (prev ? { ...prev, status: 'Đang thực hiện' } : prev))
            } else {
                toast.error(res?.error || 'Không thể bắt đầu task. Vui lòng thử lại.')
            }
        } catch (e) {
            toast.error(failureMessage(e, 'Không thể bắt đầu task. Vui lòng thử lại.'))
        } finally {
            setStarting(false)
        }
    }

    /* ── Status info ── */
    const statusInfo = getStatusInfo(localTask.status)

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogPrimitive.Portal>
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

                <DialogPrimitive.Content asChild>
                    <motion.div
                        className="fixed right-0 top-0 bottom-0 flex outline-none"
                        style={{
                            zIndex: 9999,
                            width: 1120,
                            maxWidth: '96vw',
                            background: 'rgba(10,10,10,0.97)',
                            borderLeft: '1px solid rgba(139,92,246,0.15)',
                            backdropFilter: 'blur(24px)',
                            boxShadow: '-32px 0 80px rgba(0,0,0,0.55)',
                        }}
                        initial={{ opacity: 0, x: 40 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 40 }}
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    >
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

                        {/* [Trial P1] LEFT column — task info (was the centered modal body) */}
                        <div className="flex flex-col min-w-0" style={{ flex: 1, height: '100%', position: 'relative', zIndex: 1 }}>

                            {/* HEADER */}
                            <TaskStatusBar
                                localTask={localTask}
                                isAdmin={isAdmin}
                                isBulkMode={isBulkMode}
                                bulkCount={bulkCount}
                                onClose={onClose}
                                editingTitle={editingTitle}
                                draftTitle={draftTitle}
                                setDraftTitle={setDraftTitle}
                                setEditingTitle={setEditingTitle}
                                savingCard={savingCard}
                                onSaveTitle={handleSaveTitle}
                                onEnterEditTitle={enterEditTitle}
                            />

                            {/* [Sprint M] Locked state — non-admin assignee must click "Bắt đầu" first */}
                            {isLocked ? (
                                <div className="flex-1 flex items-center justify-center px-6 pb-6 pt-4 relative z-[1]">
                                    <div
                                        className="w-full max-w-md mx-auto rounded-3xl p-8 flex flex-col items-center text-center"
                                        style={{
                                            background: 'rgba(139,92,246,0.04)',
                                            border: '1px solid rgba(139,92,246,0.18)',
                                            boxShadow: '0 24px 64px rgba(0,0,0,0.40)',
                                        }}
                                    >
                                        {/* Lock icon — pulse animation */}
                                        <div className="relative mb-5">
                                            <div
                                                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                                                style={{
                                                    background: 'rgba(139,92,246,0.12)',
                                                    border: '1px solid rgba(139,92,246,0.25)',
                                                }}
                                            >
                                                <Lock className="w-7 h-7 text-violet-300" strokeWidth={1.8} />
                                            </div>
                                        </div>

                                        <h3
                                            className="text-[18px] font-extrabold text-white mb-2 tracking-tight"
                                            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                                        >
                                            Bạn chưa bắt đầu task này
                                        </h3>
                                        <p className="text-[13px] text-zinc-400 mb-7 leading-relaxed max-w-xs">
                                            Bấm <span className="text-violet-300 font-semibold">Bắt đầu</span> để xem chi tiết
                                            và chính thức nhận task. Trạng thái sẽ chuyển sang{' '}
                                            <span className="text-yellow-300 font-semibold">Đang thực hiện</span>.
                                        </p>

                                        {/* Start button — big violet gradient with pulse ring */}
                                        <button
                                            type="button"
                                            onClick={handleStartTask}
                                            disabled={starting}
                                            className="group relative inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full text-white font-bold transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
                                            style={{
                                                background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
                                                boxShadow: '0 12px 32px rgba(139,92,246,0.45)',
                                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                fontSize: 14,
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!starting) {
                                                    e.currentTarget.style.background = 'linear-gradient(135deg, #9D6FFF 0%, #8B5CF6 100%)'
                                                    e.currentTarget.style.boxShadow = '0 16px 40px rgba(139,92,246,0.60)'
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)'
                                                e.currentTarget.style.boxShadow = '0 12px 32px rgba(139,92,246,0.45)'
                                            }}
                                        >
                                            {starting ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Đang bắt đầu…
                                                </>
                                            ) : (
                                                <>
                                                    <Play className="w-4 h-4" strokeWidth={2.5} />
                                                    Bắt đầu
                                                </>
                                            )}
                                            {/* Pulse ring */}
                                            {!starting && (
                                                <span className="absolute inset-0 rounded-full border-2 border-violet-400/40 animate-ping pointer-events-none" />
                                            )}
                                        </button>

                                        <p className="text-[11px] text-muted-foreground mt-5">
                                            Một khi bắt đầu, deadline sẽ được tính từ thời điểm này.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* TAB NAV */}
                                    <TabNav activeTab={activeTab} onChange={setActiveTab} />

                                    {/* TAB CONTENT */}
                                    <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar relative z-[1]">
                                        {/* TAB MAIN */}
                                        {activeTab === 'main' && (
                                            <TaskMainSection
                                                localTask={localTask}
                                                form={form}
                                                isAdmin={isAdmin}
                                                savingCard={savingCard}
                                                editingDelivery={editingDelivery}
                                                draftDelivery={draftDelivery}
                                                setDraftDelivery={setDraftDelivery}
                                                onEnterEditDelivery={enterEditDelivery}
                                                onSaveDelivery={handleSaveDelivery}
                                                setEditingDelivery={setEditingDelivery}
                                                editingDeadline={editingDeadline}
                                                draftDeadline={draftDeadline}
                                                setDraftDeadline={setDraftDeadline}
                                                onEnterEditDeadline={enterEditDeadline}
                                                onSaveDeadline={handleSaveDeadline}
                                                setEditingDeadline={setEditingDeadline}
                                                editingFinance={editingFinance}
                                                draftFinance={draftFinance}
                                                setDraftFinance={setDraftFinance}
                                                onEnterEditFinance={enterEditFinance}
                                                onSaveFinance={handleSaveFinance}
                                                setEditingFinance={setEditingFinance}
                                                onTaskCompleted={() =>
                                                    setLocalTask((prev) => (prev ? { ...prev, status: 'Hoàn tất' } : prev))
                                                }
                                                onTaskStatusChanged={(s) =>
                                                    setLocalTask((prev) => (prev ? { ...prev, status: s } : prev))
                                                }
                                            />
                                        )}

                                        {/* TAB ASSETS */}
                                        {activeTab === 'assets' && (
                                            <TaskResourcesSection
                                                form={form}
                                                isAdmin={isAdmin}
                                                hookGraph={hookGraph}
                                                editingMap={editingMap}
                                                editGraph={editGraph}
                                                setEditGraph={setEditGraph}
                                                savingMap={savingMap}
                                                showMapPanel={showMapPanel}
                                                setShowMapPanel={setShowMapPanel}
                                                onEditMap={handleEditMap}
                                                onCancelMap={handleCancelMap}
                                                onSaveMap={handleSaveMap}
                                                onSaveResource={saveResource}
                                                onSaveReference={saveReference}
                                            />
                                        )}

                                        {/* GHI CHÚ — không còn là tab; luôn hiển thị dưới nội dung tab. */}
                                        <div className="mt-5 pt-5 border-t border-white/5">
                                            <Card
                                                title="Ghi chú"
                                                rightSlot={
                                                    isAdmin && !editingNotes ? (
                                                        <EditButton onClick={enterEditNotes} />
                                                    ) : editingNotes ? (
                                                        <ConfirmCancelGroup
                                                            onConfirm={handleSaveNotes}
                                                            onCancel={() => setEditingNotes(false)}
                                                            saving={savingCard}
                                                        />
                                                    ) : null
                                                }
                                            >
                                                {editingNotes ? (
                                                    <div className="rounded-xl overflow-hidden border border-white/5 bg-white/[0.02] min-h-[260px]">
                                                        <TiptapEditor
                                                            content={draftNotes}
                                                            onChange={(html) => setDraftNotes(html)}
                                                        />
                                                    </div>
                                                ) : form.notes?.trim() ? (
                                                    <div
                                                        className="prose prose-invert prose-sm max-w-none text-zinc-300 leading-relaxed min-h-[200px]"
                                                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(form.notes) }}
                                                    />
                                                ) : (
                                                    <p className="text-[13px] text-muted-foreground min-h-[200px]">Chưa có ghi chú nào.</p>
                                                )}
                                            </Card>
                                        </div>

                                    </div>
                                </>
                            )}

                        </div>{/* end LEFT column */}

                        {/* [Trial P1] RIGHT column — ClickUp-style comment + activity feed */}
                        {task && <TaskCommentsSection taskId={task.id} workspaceId={workspaceId} />}
                    </motion.div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </Dialog>
    )
}
