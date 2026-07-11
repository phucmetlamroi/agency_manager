"use client"

// [P2-01] Header band of the task detail — title (inline-editable by admin),
// manager/assignee names (via getDisplayName — no raw g_… handles, FR-E5),
// status + type pills. Extracted verbatim from TaskDetailModal (state stays in
// the container; this is presentational + prop-driven).

import React from "react"
import { X } from "lucide-react"
import type { TaskWithUser } from "@/types/admin"
import { getDisplayName } from "@/lib/display-name"
import { StatusPill, TypePill, EditButton, ConfirmCancelGroup } from "./_shared"

export function TaskStatusBar({
    localTask,
    isAdmin,
    isBulkMode,
    bulkCount,
    onClose,
    editingTitle,
    draftTitle,
    setDraftTitle,
    setEditingTitle,
    savingCard,
    onSaveTitle,
    onEnterEditTitle,
}: {
    localTask: TaskWithUser
    isAdmin: boolean
    isBulkMode: boolean
    bulkCount: number
    onClose: () => void
    editingTitle: boolean
    draftTitle: string
    setDraftTitle: (v: string) => void
    setEditingTitle: (v: boolean) => void
    savingCard: boolean
    onSaveTitle: () => void
    onEnterEditTitle: () => void
}) {
    return (
        <div className="flex flex-col gap-3 px-6 pt-6 pb-3 border-b border-white/5 relative z-[1]">
            <div className="flex items-center justify-between">
                <h2 className="text-[16px] font-extrabold text-white">Chi tiết Task</h2>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Đóng chi tiết task"
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.10] text-zinc-400 hover:text-white transition-colors"
                >
                    <X size={16} />
                </button>
            </div>

            {/* [Bulk fix] Bulk mode indicator — shows user that any edit will apply to N tasks */}
            {isBulkMode && (
                <div
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
                    style={{
                        background: 'rgba(139,92,246,0.10)',
                        border: '1px solid rgba(139,92,246,0.30)',
                    }}
                >
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-violet-500/20 text-violet-300 text-xs font-bold">
                        {bulkCount}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-bold text-violet-200">
                            Sửa hàng loạt — đang chỉnh {bulkCount} task cùng lúc
                        </div>
                        <div className="text-[11px] text-violet-300/80">
                            Mọi thay đổi sẽ được áp dụng cho toàn bộ task đã tick.
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-2">
                {isAdmin && editingTitle && !isBulkMode ? (
                    <div className="flex items-center gap-2">
                        <input
                            autoFocus
                            value={draftTitle}
                            onChange={(e) => setDraftTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') onSaveTitle()
                                else if (e.key === 'Escape') setEditingTitle(false)
                            }}
                            maxLength={200}
                            placeholder="Tên video / task"
                            className="flex-1 min-w-0 bg-zinc-900/70 border border-violet-500/40 rounded-lg px-3 py-1.5 text-[16px] font-bold text-white outline-none focus:border-violet-400"
                        />
                        <ConfirmCancelGroup onConfirm={onSaveTitle} onCancel={() => setEditingTitle(false)} saving={savingCard} />
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 min-w-0">
                        <h3 className="text-[18px] font-extrabold text-white tracking-tight truncate">
                            {localTask.title}
                        </h3>
                        {isAdmin && !isBulkMode && <EditButton onClick={onEnterEditTitle} title="Đổi tên video" />}
                    </div>
                )}
                <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[12px] text-zinc-400">
                    <span>Quản lý: <span className="text-zinc-200 font-medium">{getDisplayName(localTask.assignedBy as any, { fallback: '—' })}</span></span>
                    <span className="text-muted-foreground">·</span>
                    <span>Người làm: <span className="text-zinc-200 font-medium">{getDisplayName(localTask.assignee as any, { fallback: 'Chưa giao' })}</span></span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <StatusPill status={localTask.status} />
                    {localTask.type && <TypePill type={localTask.type} />}
                </div>
            </div>
        </div>
    )
}
