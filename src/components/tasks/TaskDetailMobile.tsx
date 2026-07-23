"use client"

// [P2-D4 · M5] Mobile full-screen task detail. Layout riêng cho mobile: header
// sticky + 3 tab (Chính / Tài nguyên / Bình luận) + composer bám trên bàn phím.
// TÁI DÙNG các section presentational của P2-phase-1 (TaskStatusBar / TaskMainSection /
// TaskResourcesSection) + TaskCommentColumn. Controller ở đây là SINGLE-TASK (mobile
// detail không có bulk) — gọi ĐÚNG các server-action như desktop; desktop
// TaskDetailModal KHÔNG bị đụng (0 rủi ro desktop). Nội dung/logic giữ nguyên với modal.

import React, { useEffect, useState } from "react"
import { TaskWithUser } from "@/types/admin"
import { updateTaskDetails } from "@/actions/update-task-details"
import { updateTaskStatus } from "@/actions/task-actions"
import { getHookGraph, saveHookGraph } from "@/actions/raw-footage-actions"
import type { HookGraph } from "@/lib/velox/hook-graph-types"
import { toast } from "sonner"
import DOMPurify from "dompurify"
import dynamic from "next/dynamic"
import { LayoutGrid, FolderOpen, MessageSquare, Lock, Play, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useKeyboardInset } from "@/hooks/useKeyboardInset"
import {
    getStatusInfo, parseContent, Card, EditButton, ConfirmCancelGroup, type TaskDetailForm,
} from "./detail-sections/_shared"
import { TaskStatusBar } from "./detail-sections/TaskStatusBar"
import { TaskMainSection } from "./detail-sections/TaskMainSection"
import { TaskResourcesSection } from "./detail-sections/TaskResourcesSection"
import TaskCommentColumn from "./TaskCommentColumn"

const TiptapEditor = dynamic(() => import('@/components/tiptap/TiptapEditor'), { ssr: false })

type MobileTab = 'main' | 'assets' | 'comments'

const TABS: { id: MobileTab; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
    { id: 'main', label: 'Chính', icon: LayoutGrid },
    { id: 'assets', label: 'Tài nguyên', icon: FolderOpen },
    { id: 'comments', label: 'Bình luận', icon: MessageSquare },
]

export function TaskDetailMobile({
    task,
    isAdmin,
    currentUserId,
    workspaceId,
    onClose,
}: {
    task: TaskWithUser
    isAdmin: boolean
    currentUserId: string
    workspaceId: string
    onClose: () => void
}) {
    const { inset, open: kbOpen } = useKeyboardInset()

    const [activeTab, setActiveTab] = useState<MobileTab>('main')
    const [localTask, setLocalTask] = useState<TaskWithUser>(task)

    // Hook-graph (Multi-Hook Map) state — same as modal.
    const [hookGraph, setHookGraph] = useState<HookGraph | null>(null)
    const [editingMap, setEditingMap] = useState(false)
    const [editGraph, setEditGraph] = useState<HookGraph | null>(null)
    const [savingMap, setSavingMap] = useState(false)
    const [showMapPanel, setShowMapPanel] = useState(false)

    // Per-card edit state.
    const [editingDelivery, setEditingDelivery] = useState(false)
    const [editingDeadline, setEditingDeadline] = useState(false)
    const [editingFinance, setEditingFinance] = useState(false)
    const [editingNotes, setEditingNotes] = useState(false)
    const [editingTitle, setEditingTitle] = useState(false)
    const [draftTitle, setDraftTitle] = useState('')
    const [savingCard, setSavingCard] = useState(false)
    const [starting, setStarting] = useState(false)

    const [draftDelivery, setDraftDelivery] = useState('')
    const [draftDeadline, setDraftDeadline] = useState('')
    const [draftFinance, setDraftFinance] = useState({ jobPriceUSD: 0, value: 0 })
    const [draftNotes, setDraftNotes] = useState('')

    const [form, setForm] = useState<TaskDetailForm>({
        productLink: '', deadline: '', jobPriceUSD: 0, value: 0, linkRaw: '', linkBroll: '',
        submissionFolder: '', references: '', scriptLink: '', collectFilesLink: '', notes: '',
    })

    /* ── Parse task prop into form (unpack RAW:/BROLL:/SUBMISSION: + REF:/SCRIPT:) ── */
    useEffect(() => {
        setLocalTask(task)
        const resString = task.resources || task.fileLink || ''
        let raw = '', broll = '', submission = ''
        if (resString.startsWith('RAW:')) {
            resString.split('|').forEach((p) => {
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
            refUrl.split('|').forEach((p) => {
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
        setEditingDelivery(false); setEditingDeadline(false); setEditingFinance(false)
        setEditingNotes(false); setEditingTitle(false)
    }, [task])

    /* ── Hook-graph fetch ── */
    useEffect(() => {
        if (!task?.id) return
        let cancelled = false
        setEditingMap(false); setEditGraph(null); setShowMapPanel(false)
        getHookGraph(task.id)
            .then((res) => {
                if (cancelled) return
                if ('ok' in res && res.ok && res.graph && res.graph.blocks.length > 0) setHookGraph(res.graph)
                else setHookGraph(null)
            })
            .catch(() => { if (!cancelled) setHookGraph(null) })
        return () => { cancelled = true }
    }, [task?.id])

    const handleEditMap = () => { setEditGraph(hookGraph); setEditingMap(true) }
    const handleCancelMap = () => { setEditingMap(false); setEditGraph(null) }
    const handleSaveMap = async () => {
        if (!task?.id || !editGraph) return
        setSavingMap(true)
        try {
            const res = await saveHookGraph(task.id, editGraph)
            if ('error' in res) toast.error(res.error || 'Không lưu được Multi-Hook Map.')
            else { setHookGraph(editGraph); setEditingMap(false); toast.success('Đã lưu Multi-Hook Map.') }
        } catch { toast.error('Lưu Multi-Hook Map thất bại.') } finally { setSavingMap(false) }
    }

    /* ── Single-task save (mobile detail has no bulk mode) ── */
    const saveSingle = async (patch: Parameters<typeof updateTaskDetails>[1], successMsg = 'Đã cập nhật') => {
        const res = await updateTaskDetails(localTask.id, patch, workspaceId)
        if (res?.success) { toast.success(successMsg); return true }
        toast.error('Lưu thất bại'); return false
    }

    const saveResource = async (key: 'linkRaw' | 'linkBroll' | 'scriptLink' | 'submissionFolder', newValue: string) => {
        const next = { ...form, [key]: newValue }
        const combinedResources =
            next.linkRaw || next.linkBroll || next.submissionFolder
                ? `RAW: ${next.linkRaw.trim()} | BROLL: ${next.linkBroll.trim()} | SUBMISSION: ${next.submissionFolder.trim()}`
                : ''
        const combinedReferences = next.scriptLink
            ? `REF:${next.references.trim()} | SCRIPT:${next.scriptLink.trim()}`
            : next.references
        const ok = await saveSingle({ resources: combinedResources, references: combinedReferences })
        if (ok) {
            setForm(next)
            setLocalTask((prev) => ({ ...prev, resources: combinedResources, references: combinedReferences, submissionFolder: next.submissionFolder }))
        }
    }

    const saveReference = async (key: 'references' | 'collectFilesLink', newValue: string) => {
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
            setLocalTask((prev) => ({ ...prev, references: combinedReferences, collectFilesLink: next.collectFilesLink }))
        }
    }

    const handleSaveDelivery = async () => {
        const trimmed = draftDelivery.trim()
        if (!trimmed) { toast.error('Cần nhập link Delivery trước khi xác nhận.'); return }
        setSavingCard(true)
        const ok = await saveSingle({ productLink: trimmed })
        if (!ok) { setSavingCard(false); return }
        setForm((p) => ({ ...p, productLink: trimmed }))
        setLocalTask((p) => ({ ...p, productLink: trimmed }))
        setEditingDelivery(false)
        // Auto-submit gate — non-admin assignee whose task is 'Đang thực hiện'.
        const shouldAutoSubmit =
            !isAdmin && !!currentUserId && localTask.assigneeId === currentUserId && localTask.status === 'Đang thực hiện'
        if (shouldAutoSubmit) {
            try {
                const res = await updateTaskStatus(localTask.id, 'Revision', workspaceId)
                if (res?.success) {
                    toast.success('Đã nộp bài — admin sẽ review sớm. Deadline đã được tạm dừng.')
                    setLocalTask((prev) => ({ ...prev, status: 'Revision', deadline: null }))
                } else {
                    toast.error(res?.error || 'Link đã lưu, nhưng chưa chuyển status. Vui lòng thử lại.')
                }
            } catch { toast.error('Link đã lưu, nhưng chưa chuyển status. Vui lòng thử lại.') }
        }
        setSavingCard(false)
    }

    const handleSaveDeadline = async () => {
        setSavingCard(true)
        const ok = await saveSingle({ deadline: draftDeadline || undefined })
        if (ok) {
            setForm((p) => ({ ...p, deadline: draftDeadline }))
            setLocalTask((p) => ({ ...p, deadline: draftDeadline ? new Date(draftDeadline) : null }))
            setEditingDeadline(false)
        }
        setSavingCard(false)
    }

    const handleSaveFinance = async () => {
        if (!isAdmin) return
        setSavingCard(true)
        const ok = await saveSingle({ jobPriceUSD: Number(draftFinance.jobPriceUSD), value: Number(draftFinance.value) })
        if (ok) {
            setForm((p) => ({ ...p, jobPriceUSD: Number(draftFinance.jobPriceUSD), value: Number(draftFinance.value) }))
            setLocalTask((p) => ({ ...p, jobPriceUSD: Number(draftFinance.jobPriceUSD), value: Number(draftFinance.value) }))
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
            setLocalTask((p) => ({ ...p, notes_vi: cleanNotes, notes_en: null }))
            setEditingNotes(false)
        }
        setSavingCard(false)
    }

    const handleSaveTitle = async () => {
        const trimmed = draftTitle.trim()
        if (!trimmed) { toast.error('Tên không được để trống'); return }
        setSavingCard(true)
        const ok = await saveSingle({ title: trimmed }, 'Đã đổi tên video')
        if (ok) { setLocalTask((p) => ({ ...p, title: trimmed })); setEditingTitle(false) }
        setSavingCard(false)
    }

    const enterEditTitle = () => { setDraftTitle(localTask.title ?? ''); setEditingTitle(true) }
    const enterEditDelivery = () => { setDraftDelivery(form.productLink); setEditingDelivery(true) }
    const enterEditDeadline = () => { setDraftDeadline(form.deadline); setEditingDeadline(true) }
    const enterEditFinance = () => { setDraftFinance({ jobPriceUSD: form.jobPriceUSD, value: form.value }); setEditingFinance(true) }
    const enterEditNotes = () => { setDraftNotes(form.notes); setEditingNotes(true) }

    const isLocked =
        !isAdmin && !!currentUserId && localTask.assigneeId === currentUserId &&
        (localTask.status === 'Nhận task' || localTask.status === 'Đã nhận task')

    const handleStartTask = async () => {
        if (starting) return
        setStarting(true)
        try {
            const res = await updateTaskStatus(localTask.id, 'Đang thực hiện', workspaceId)
            if (res?.success) {
                toast.success('Đã bắt đầu task — chúc bạn làm việc hiệu quả!')
                setLocalTask((prev) => ({ ...prev, status: 'Đang thực hiện' }))
            } else {
                toast.error(res?.error || 'Không thể bắt đầu task. Vui lòng thử lại.')
            }
        } catch { toast.error('Không thể bắt đầu task. Vui lòng thử lại.') } finally { setStarting(false) }
    }

    const statusInfo = getStatusInfo(localTask.status)

    return (
        <div
            className="fixed inset-0 z-dialog flex flex-col bg-surface-0"
            style={{ background: 'rgba(10,10,10,0.98)' }}
        >
            {/* Status glow */}
            <div
                className="absolute pointer-events-none"
                style={{ top: -40, right: -40, width: 140, height: 140, borderRadius: '50%', background: statusInfo.color, opacity: 0.08, filter: 'blur(50px)' }}
            />

            {/* HEADER (reuse TaskStatusBar) — pt safe-area */}
            <div className="flex-shrink-0 relative z-[1]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
                <TaskStatusBar
                    localTask={localTask}
                    isAdmin={isAdmin}
                    isBulkMode={false}
                    bulkCount={0}
                    onClose={onClose}
                    editingTitle={editingTitle}
                    draftTitle={draftTitle}
                    setDraftTitle={setDraftTitle}
                    setEditingTitle={setEditingTitle}
                    savingCard={savingCard}
                    onSaveTitle={handleSaveTitle}
                    onEnterEditTitle={enterEditTitle}
                />
            </div>

            {isLocked ? (
                /* Locked gate (non-admin assignee) */
                <div className="flex-1 flex items-center justify-center px-6 pb-6 relative z-[1]">
                    <div className="w-full max-w-sm mx-auto rounded-3xl p-8 flex flex-col items-center text-center" style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.18)' }}>
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)' }}>
                            <Lock className="w-7 h-7 text-violet-300" strokeWidth={1.8} />
                        </div>
                        <h3 className="text-[18px] font-extrabold text-white mb-2 tracking-tight">Bạn chưa bắt đầu task này</h3>
                        <p className="text-[13px] text-zinc-400 mb-7 leading-relaxed">
                            Bấm <span className="text-violet-300 font-semibold">Bắt đầu</span> để xem chi tiết và chính thức nhận task.
                            Trạng thái sẽ chuyển sang <span className="text-yellow-300 font-semibold">Đang thực hiện</span>.
                        </p>
                        <button
                            type="button"
                            onClick={handleStartTask}
                            disabled={starting}
                            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full text-white font-bold disabled:opacity-70 min-h-[48px]"
                            style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)', boxShadow: '0 12px 32px rgba(139,92,246,0.45)' }}
                        >
                            {starting ? (<><Loader2 className="w-4 h-4 animate-spin" /> Đang bắt đầu…</>) : (<><Play className="w-4 h-4" strokeWidth={2.5} /> Bắt đầu</>)}
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {/* TAB BAR (3 tab) */}
                    <div className="flex-shrink-0 relative z-[1] mx-4 mt-1 mb-3 flex items-center bg-white/[0.04] border border-white/5 rounded-full p-1">
                        {TABS.map((tab) => {
                            const Icon = tab.icon
                            const isActive = activeTab === tab.id
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full text-[13px] font-semibold transition-colors min-h-[44px]",
                                        isActive ? "bg-white/[0.08] text-white shadow-[0_2px_8px_rgba(139,92,246,0.15)]" : "text-zinc-400",
                                    )}
                                >
                                    <Icon size={15} strokeWidth={1.8} />
                                    {tab.label}
                                </button>
                            )
                        })}
                    </div>

                    {/* CONTENT */}
                    {activeTab === 'comments' ? (
                        /* Bình luận — TaskCommentColumn fills; composer bám trên bàn phím
                           bằng cách rút chiều cao container theo keyboard inset (Pattern 10). */
                        <div
                            className="flex-1 min-h-0 overflow-hidden relative z-[1]"
                            style={{ marginBottom: kbOpen ? inset : 'env(safe-area-inset-bottom)' }}
                        >
                            <TaskCommentColumn taskId={task.id} workspaceId={workspaceId} />
                        </div>
                    ) : (
                        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] relative z-[1] custom-scrollbar">
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
                                    onTaskCompleted={() => setLocalTask((prev) => ({ ...prev, status: 'Hoàn tất' }))}
                                    onTaskStatusChanged={(s) => setLocalTask((prev) => ({ ...prev, status: s }))}
                                />
                            )}

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

                            {/* GHI CHÚ — luôn hiển thị dưới nội dung tab (giống desktop) */}
                            {activeTab === 'main' && (
                                <div className="mt-5 pt-5 border-t border-white/5">
                                    <Card
                                        title="Ghi chú"
                                        rightSlot={
                                            isAdmin && !editingNotes ? (
                                                <EditButton onClick={enterEditNotes} />
                                            ) : editingNotes ? (
                                                <ConfirmCancelGroup onConfirm={handleSaveNotes} onCancel={() => setEditingNotes(false)} saving={savingCard} />
                                            ) : null
                                        }
                                    >
                                        {editingNotes ? (
                                            <div className="rounded-xl overflow-hidden border border-white/5 bg-white/[0.02] min-h-[220px]">
                                                <TiptapEditor content={draftNotes} onChange={(html) => setDraftNotes(html)} />
                                            </div>
                                        ) : form.notes?.trim() ? (
                                            <div className="prose prose-invert prose-sm max-w-none text-zinc-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(form.notes) }} />
                                        ) : (
                                            <p className="text-[13px] text-muted-foreground">Chưa có ghi chú nào.</p>
                                        )}
                                    </Card>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
