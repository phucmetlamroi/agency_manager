// [Review module P3-B / FR-08·09·10] Staff auto-transition buttons rendered in the player
// header. Which button shows is derived PURELY from the task status + role via the client-safe
// `canAutoTransition` guard (the server re-checks the same predecessor). This component is only
// ever mounted by the INTERNAL shell (never the guest tree), so no env gating is needed.
//
//   F10  "Duyệt & gửi khách"          admin · A2/A4/A7 → A5
//   F8   "Kết thúc feedback"          admin · A2/A4 → A3 (only when there IS feedback; A4 = re-open round 2+)
//   F9   "Xác nhận đã sửa xong"       admin|assignee · A3→A4 / A6→A7
//
// [feedback-flow spec §3] F9 is the EDITOR's explicit "I've finished fixing this round" action.
// It used to be labeled with the destination status string ("Đã sửa feedback (nội bộ)"), which the
// editor read as the system DECLARING the work already done. It is now an imperative CTA gated by a
// confirm dialog; clicking it (server-side) resolves the whole round's comments and flips the status.
// The button is derived from status, so it auto-RESETS to "not done" whenever the manager re-opens a
// new feedback round (A4→A3) and disappears once confirmed (A4) — no per-round reset code needed.

'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
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
    /** parent comments on the CURRENT version still open (resolvedAt == null). Shown in the F9 confirm dialog. */
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
    const [confirmFix, setConfirmFix] = useState(false)
    const cur = taskStatus ?? ''

    const canApprove = isAdmin && canAutoTransition(cur, REVIEW_STATUS_MAP.sentToClient) // F10 (A2/A4/A7 → A5)
    const canFeedback = isAdmin && hasComments && canAutoTransition(cur, REVIEW_STATUS_MAP.internalFeedbackOpen) // F8 (A2/A4 → A3)
    // F9 — internal round (A3→A4) or client round (A6→A7).
    const fixTarget = canAutoTransition(cur, REVIEW_STATUS_MAP.internalFixDone)
        ? REVIEW_STATUS_MAP.internalFixDone
        : canAutoTransition(cur, REVIEW_STATUS_MAP.clientFixDone)
          ? REVIEW_STATUS_MAP.clientFixDone
          : null
    // [feedback-flow spec] "Xác nhận đã sửa xong" is the EDITOR's action only. The admin's
    // moves are "Kết thúc feedback" (F8) and "Duyệt & gửi khách" (F10) — never F9. Gating on
    // assignee-only means a non-assignee admin correctly waits during A3/A6 instead of seeing
    // the editor's confirm button. (The server still allows admin as a fallback via the API.)
    const canFix = isAssignee && fixTarget != null
    const isClientFix = fixTarget === REVIEW_STATUS_MAP.clientFixDone

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
                    onClick={() => setConfirmFix(true)}
                    disabled={busy !== null}
                    className="flex items-center gap-1.5 rounded-lg border border-teal-400/30 bg-teal-500/10 px-3 py-1.5 text-sm font-medium text-teal-300 hover:bg-teal-500/20 disabled:opacity-50"
                    title="Xác nhận bạn đã sửa xong feedback của đợt này"
                >
                    {busy === 'fix' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                    <span className="hidden sm:inline">
                        {isClientFix ? 'Xác nhận đã sửa (khách)' : 'Xác nhận đã sửa xong'}
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

            {/* [spec §4.1] Light confirm popup so the editor can't mark "đã sửa" by accident. On confirm the
                server resolves the whole round + flips the status + notifies the manager. */}
            {confirmFix && canFix && (
                <ConfirmFixDialog
                    unresolvedCount={unresolvedCount}
                    isClientFix={isClientFix}
                    busy={busy === 'fix'}
                    onCancel={() => setConfirmFix(false)}
                    onConfirm={async () => {
                        await run('fix', () => apiConfirmFix(assetId))
                        setConfirmFix(false)
                    }}
                />
            )}
        </div>
    )
}

function ConfirmFixDialog({
    unresolvedCount,
    isClientFix,
    busy,
    onConfirm,
    onCancel,
}: {
    unresolvedCount: number
    isClientFix: boolean
    busy: boolean
    onConfirm: () => void
    onCancel: () => void
}) {
    const targetLabel = isClientFix ? 'Đã sửa feedback (khách)' : 'Đã sửa feedback (nội bộ)'
    // [bug-A] The player header has `backdrop-blur`, which makes it the containing block for
    // any `position:fixed` descendant → this modal was trapped inside the 56px header (clipped
    // at the top, un-clickable). Portal to <body> so `fixed inset-0` covers the real viewport.
    if (typeof document === 'undefined') return null
    return createPortal(
        <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"
            onClick={busy ? undefined : onCancel}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl shadow-black/60"
            >
                <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal-500/15 text-teal-300">
                        <CheckCheck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-base font-semibold text-white">
                            Xác nhận đã sửa xong{isClientFix ? ' (khách)' : ''}?
                        </h3>
                        <p className="mt-1 text-sm text-white/60">
                            Bạn chắc chắn đã sửa toàn bộ feedback của đợt này? Sau khi xác nhận, task sẽ chuyển sang
                            {' '}
                            <span className="text-white/80">“{targetLabel}”</span> và quản lý sẽ được thông báo để duyệt.
                        </p>
                        {unresolvedCount > 0 && (
                            <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-300">
                                Còn {unresolvedCount} feedback chưa đánh dấu — xác nhận sẽ tự đánh dấu tất cả là đã xử lý.
                            </p>
                        )}
                    </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                    <button
                        onClick={onCancel}
                        disabled={busy}
                        className="rounded-lg px-3 py-1.5 text-sm text-white/70 hover:bg-white/10 disabled:opacity-50"
                    >
                        Huỷ
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={busy}
                        className="flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-400 disabled:opacity-50"
                    >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                        Đồng ý, đã sửa xong
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    )
}
