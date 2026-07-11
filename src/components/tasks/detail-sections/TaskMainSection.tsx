"use client"

// [P2-01] "Chính" tab body: Bàn giao (delivery) + Deadline + Tài chính (finance).
// Extracted verbatim from TaskDetailModal. All state + save handlers live in the
// container and arrive as props — this file is presentational only.
// NB Finance: Client ($) is agency revenue → ADMIN-ONLY display (jobPriceUSD leak
// discipline). Staff (VND) is the editor's own wage. Do NOT change this gating.

import React from "react"
import { ExternalLink, Plus } from "lucide-react"
import type { TaskWithUser } from "@/types/admin"
import { TaskReviewUploadSection } from "@/components/review/TaskReviewUploadSection"
import { Card, EditButton, ConfirmCancelGroup, formatDate, formatLink, type TaskDetailForm } from "./_shared"

export function TaskMainSection({
    localTask,
    form,
    isAdmin,
    savingCard,
    editingDelivery,
    draftDelivery,
    setDraftDelivery,
    onEnterEditDelivery,
    onSaveDelivery,
    setEditingDelivery,
    editingDeadline,
    draftDeadline,
    setDraftDeadline,
    onEnterEditDeadline,
    onSaveDeadline,
    setEditingDeadline,
    editingFinance,
    draftFinance,
    setDraftFinance,
    onEnterEditFinance,
    onSaveFinance,
    setEditingFinance,
    onTaskCompleted,
}: {
    localTask: TaskWithUser
    form: TaskDetailForm
    isAdmin: boolean
    savingCard: boolean
    editingDelivery: boolean
    draftDelivery: string
    setDraftDelivery: (v: string) => void
    onEnterEditDelivery: () => void
    onSaveDelivery: () => void
    setEditingDelivery: (v: boolean) => void
    editingDeadline: boolean
    draftDeadline: string
    setDraftDeadline: (v: string) => void
    onEnterEditDeadline: () => void
    onSaveDeadline: () => void
    setEditingDeadline: (v: boolean) => void
    editingFinance: boolean
    draftFinance: { jobPriceUSD: number; value: number }
    setDraftFinance: React.Dispatch<React.SetStateAction<{ jobPriceUSD: number; value: number }>>
    onEnterEditFinance: () => void
    onSaveFinance: () => void
    setEditingFinance: (v: boolean) => void
    onTaskCompleted: () => void
}) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* DELIVERY card — editable by BOTH admin and user (assignee submits delivery link here) */}
            <Card
                title="Bàn giao"
                className="min-h-[220px]"
                rightSlot={
                    !editingDelivery ? (
                        <EditButton onClick={onEnterEditDelivery} />
                    ) : (
                        <ConfirmCancelGroup
                            onConfirm={onSaveDelivery}
                            onCancel={() => setEditingDelivery(false)}
                            saving={savingCard}
                        />
                    )
                }
            >
                {editingDelivery ? (
                    <textarea
                        value={draftDelivery}
                        onChange={(e) => setDraftDelivery(e.target.value)}
                        placeholder="Dán link bàn giao hoặc ghi chú trạng thái…"
                        className="flex-1 w-full rounded-xl bg-white/[0.04] border border-violet-500/40 p-3 text-[13px] text-zinc-300 placeholder:text-muted-foreground outline-none focus:border-violet-500 resize-none min-h-[150px]"
                        autoFocus
                    />
                ) : form.productLink?.trim() ? (
                    form.productLink.startsWith('http') ? (
                        <a
                            href={formatLink(form.productLink)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[13px] text-violet-400 hover:text-violet-300 inline-flex items-center gap-1"
                        >
                            <span>Xem bản bàn giao</span>
                            <ExternalLink size={12} className="flex-shrink-0" />
                        </a>
                    ) : (
                        <p className="text-[13px] text-zinc-300 leading-relaxed whitespace-pre-wrap">
                            {form.productLink}
                        </p>
                    )
                ) : (
                    <button
                        type="button"
                        onClick={onEnterEditDelivery}
                        className="self-start inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-violet-300 transition-colors"
                    >
                        <Plus size={12} /> Thêm link bàn giao
                    </button>
                )}

                {/* [Review P1.10 + P3.7] Up thẳng video review + sync task → Hoàn tất */}
                {localTask?.id && (
                    <TaskReviewUploadSection
                        taskId={localTask.id}
                        taskStatus={localTask.status}
                        onTaskCompleted={onTaskCompleted}
                    />
                )}
            </Card>

            {/* RIGHT — Deadline + Finance stacked */}
            <div className="flex flex-col gap-4">
                <Card
                    title="Deadline"
                    rightSlot={
                        isAdmin && !editingDeadline ? (
                            <EditButton onClick={onEnterEditDeadline} />
                        ) : editingDeadline ? (
                            <ConfirmCancelGroup
                                onConfirm={onSaveDeadline}
                                onCancel={() => setEditingDeadline(false)}
                                saving={savingCard}
                            />
                        ) : null
                    }
                >
                    {editingDeadline ? (
                        <input
                            type="datetime-local"
                            value={draftDeadline}
                            onChange={(e) => setDraftDeadline(e.target.value)}
                            autoFocus
                            className="h-9 w-full rounded-full bg-white/[0.06] border border-violet-500/40 px-3 text-[13px] text-zinc-300 outline-none focus:border-violet-500"
                        />
                    ) : (
                        <span className="text-[14px] font-semibold text-zinc-200">
                            {formatDate(localTask.deadline)}
                        </span>
                    )}
                </Card>

                <Card
                    title="Tài chính"
                    rightSlot={
                        isAdmin && !editingFinance ? (
                            <EditButton onClick={onEnterEditFinance} />
                        ) : editingFinance ? (
                            <ConfirmCancelGroup
                                onConfirm={onSaveFinance}
                                onCancel={() => setEditingFinance(false)}
                                saving={savingCard}
                            />
                        ) : null
                    }
                >
                    {editingFinance && isAdmin ? (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-[12px] text-zinc-400">Khách ($)</span>
                                <input
                                    type="number"
                                    value={draftFinance.jobPriceUSD}
                                    onChange={(e) => setDraftFinance(d => ({ ...d, jobPriceUSD: Number(e.target.value) }))}
                                    autoFocus
                                    className="w-28 h-8 rounded-full bg-white/[0.06] border border-violet-500/40 px-3 text-[13px] text-zinc-200 text-right outline-none focus:border-violet-500"
                                />
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-[12px] text-zinc-400">Nhân viên (VND)</span>
                                <input
                                    type="number"
                                    value={draftFinance.value}
                                    onChange={(e) => setDraftFinance(d => ({ ...d, value: Number(e.target.value) }))}
                                    className="w-32 h-8 rounded-full bg-white/[0.06] border border-violet-500/40 px-3 text-[13px] text-zinc-200 text-right outline-none focus:border-violet-500"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {/* [Sprint J P0] Client ($) = agency revenue. ADMIN-ONLY display.
                                Non-admin (staff) chỉ thấy Staff (VND) — lương riêng của họ. */}
                            {isAdmin && (
                                <div className="flex items-center justify-between">
                                    <span className="text-[12px] text-zinc-400">Khách ($)</span>
                                    <span className="text-[14px] font-bold text-emerald-400">
                                        $ {Number(form.jobPriceUSD || 0).toLocaleString('en-US')}
                                    </span>
                                </div>
                            )}
                            <div className="flex items-center justify-between">
                                <span className="text-[12px] text-zinc-400">Nhân viên (VND)</span>
                                <span className="text-[14px] font-bold text-zinc-200">
                                    VND {Number(form.value || 0).toLocaleString('vi-VN')}
                                </span>
                            </div>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    )
}
