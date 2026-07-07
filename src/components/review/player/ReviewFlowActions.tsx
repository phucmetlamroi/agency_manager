// [Review module P3-B / FR-08·09·10] Staff auto-transition buttons rendered in the player
// header. Which button shows is derived PURELY from the task status + role via the client-safe
// `canAutoTransition` guard (the server re-checks the same predecessor). This component is only
// ever mounted by the INTERNAL shell (never the guest tree), so no env gating is needed.
//
//   F10  "Duyệt & gửi khách"          admin · A2/A4/A7 → A5
//   F8   "Kết thúc feedback"          admin · A2 → A3 (only when there IS feedback)
//   F9   "Đã sửa feedback (nội bộ/khách)"  admin|assignee · A3→A4 / A6→A7, gated by 0 unresolved

'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { CheckCheck, Send, MessageSquareX, Loader2 } from 'lucide-react'
import { canAutoTransition } from '@/lib/task-statuses'
import { REVIEW_STATUS_MAP } from '@/lib/review/status-map'
import { apiMarkFeedbackDone, apiConfirmFix, apiApproveAndSend } from '@/lib/review/team-actions'

interface ReviewFlowActionsProps {
    assetId: string
    taskStatus: string | null
    isAdmin: boolean
    isAssignee: boolean
    /** parent comments on the CURRENT version still open (completedAt == null). Gates F9. */
    unresolvedCount: number
    /** any comment on the current version — gates F8 (don't "close feedback" with none). */
    hasComments: boolean
    /** re-fetch the asset/version so the buttons reflect the new status. */
    onDone: () => void
}

export function ReviewFlowActions({
    assetId,
    taskStatus,
    isAdmin,
    isAssignee,
    unresolvedCount,
    hasComments,
    onDone,
}: ReviewFlowActionsProps) {
    const [busy, setBusy] = useState<null | 'feedback' | 'fix' | 'approve'>(null)
    const cur = taskStatus ?? ''

    const canApprove = isAdmin && canAutoTransition(cur, REVIEW_STATUS_MAP.sentToClient) // F10 (A2/A4/A7 → A5)
    const canFeedback = isAdmin && hasComments && canAutoTransition(cur, REVIEW_STATUS_MAP.internalFeedbackOpen) // F8 (A2 → A3)
    // F9 — internal round (A3→A4) or client round (A6→A7).
    const fixTarget = canAutoTransition(cur, REVIEW_STATUS_MAP.internalFixDone)
        ? REVIEW_STATUS_MAP.internalFixDone
        : canAutoTransition(cur, REVIEW_STATUS_MAP.clientFixDone)
          ? REVIEW_STATUS_MAP.clientFixDone
          : null
    const canFix = (isAssignee || isAdmin) && fixTarget != null

    if (!canApprove && !canFeedback && !canFix) return null

    async function run(kind: 'feedback' | 'fix' | 'approve', fn: () => Promise<{ status: string }>) {
        if (busy) return
        setBusy(kind)
        try {
            const res = await fn()
            toast.success(`Đã chuyển task sang "${res.status}".`)
            onDone()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Không thực hiện được. Thử lại.')
        } finally {
            setBusy(null)
        }
    }

    return (
        <div className="flex items-center gap-2">
            {canFeedback && (
                <button
                    onClick={() => run('feedback', () => apiMarkFeedbackDone(assetId))}
                    disabled={busy !== null}
                    className="flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                    title="Chốt phiên feedback — editor sẽ nhận thông báo cần sửa"
                >
                    {busy === 'feedback' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareX className="h-4 w-4" />}
                    <span className="hidden sm:inline">Kết thúc feedback</span>
                </button>
            )}
            {canFix && (
                <button
                    onClick={() => run('fix', () => apiConfirmFix(assetId))}
                    disabled={busy !== null || unresolvedCount > 0}
                    className="flex items-center gap-1.5 rounded-lg border border-teal-400/30 bg-teal-500/10 px-3 py-1.5 text-sm font-medium text-teal-300 hover:bg-teal-500/20 disabled:opacity-50"
                    title={
                        unresolvedCount > 0
                            ? `Còn ${unresolvedCount} feedback chưa tick "đã xử lý"`
                            : 'Xác nhận đã sửa xong feedback'
                    }
                >
                    {busy === 'fix' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                    <span className="hidden sm:inline">
                        {fixTarget === REVIEW_STATUS_MAP.clientFixDone ? 'Đã sửa feedback (khách)' : 'Đã sửa feedback (nội bộ)'}
                        {unresolvedCount > 0 ? ` · còn ${unresolvedCount}` : ''}
                    </span>
                </button>
            )}
            {canApprove && (
                <button
                    onClick={() => run('approve', () => apiApproveAndSend(assetId))}
                    disabled={busy !== null}
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-1.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
                    title="Duyệt bản dựng và gửi cho khách"
                >
                    {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    <span className="hidden sm:inline">Duyệt &amp; gửi khách</span>
                </button>
            )}
        </div>
    )
}
