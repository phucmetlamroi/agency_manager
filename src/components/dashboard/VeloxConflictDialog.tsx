'use client'

/**
 * [Velox v1.0 — Spec section 7.4]
 *
 * Conflict resolution dialog when Velox "Áp dụng vào form" detects that the
 * AddTaskModal form already has user-typed values in fields that Velox wants
 * to write to.
 *
 * MVP: batch-apply (1 choice applies to all conflicting fields). Per-field
 * resolution is a v2 polish.
 *
 * Three options (spec 7.4):
 *   - Ghi đè: replace existing values with Velox output
 *   - Giữ: skip conflicting fields, only fill empty ones
 *   - Gộp: for list/text fields (videoList, notes) → append. For others → overwrite.
 *
 * Spec exception: if note conflict + checkbox kế thừa ON → caller skips dialog,
 * directly appends note.
 */

import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, FileEdit, Shield, Combine, X } from 'lucide-react'
import { getVeloxFieldMeta, type VeloxFormPrefill } from '@/lib/velox-helpers'

export type ConflictStrategy = 'overwrite' | 'keep' | 'merge'

interface Props {
    open: boolean
    /** Set of field names that conflict (form already has different values) */
    conflicts: Set<keyof VeloxFormPrefill>
    onResolve: (strategy: ConflictStrategy) => void
    onCancel: () => void
}

const FIELD_LABEL: Partial<Record<keyof VeloxFormPrefill, string>> = {
    clientId: 'Client',
    taskType: 'Task type',
    deadline: 'Deadline',
    assigneeId: 'Editor (assignee)',
    videoList: 'Video list',
    jobPriceUSD: 'Client price (USD)',
    editorFee: 'Editor wage (VND)',
    rawFootage: 'Raw footage link',
    notes: 'Notes',
}

export default function VeloxConflictDialog({ open, conflicts, onResolve, onCancel }: Props) {
    const conflictList = Array.from(conflicts)

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                    onClick={onCancel}
                >
                    <motion.div
                        initial={{ opacity: 0, y: 16, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 16, scale: 0.97 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-md rounded-3xl bg-zinc-950/95 backdrop-blur-xl border border-[rgba(245,158,11,0.20)] shadow-[0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-3">
                            <div className="flex items-start gap-3 min-w-0">
                                <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 shrink-0">
                                    <AlertTriangle size={16} className="text-amber-300" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-[15px] font-extrabold text-white">
                                        Field đã có dữ liệu
                                    </h3>
                                    <p className="text-[11px] text-zinc-400 mt-0.5">
                                        Velox muốn ghi vào {conflictList.length} field bạn đã nhập tay.
                                        Chọn cách xử lý:
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={onCancel}
                                className="flex items-center justify-center w-7 h-7 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-zinc-400 hover:text-white transition-colors shrink-0"
                                aria-label="Cancel"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        {/* Conflict field list */}
                        <div className="px-6 py-3 max-h-[180px] overflow-y-auto custom-scrollbar">
                            <div className="flex flex-wrap gap-1.5">
                                {conflictList.map((field) => (
                                    <span
                                        key={field}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-200"
                                        title={getVeloxFieldMeta(field)}
                                    >
                                        {FIELD_LABEL[field] ?? field}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Options */}
                        <div className="px-6 pb-6 pt-2 flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={() => onResolve('overwrite')}
                                className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl bg-white/[0.04] hover:bg-violet-500/10 border border-white/5 hover:border-violet-500/40 transition-colors text-left group"
                            >
                                <div className="p-1.5 rounded-lg bg-violet-500/15 border border-violet-500/30 shrink-0">
                                    <FileEdit size={14} className="text-violet-300" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[13px] font-bold text-zinc-100 group-hover:text-white">
                                        Ghi đè
                                    </div>
                                    <div className="text-[11px] text-zinc-500 mt-0.5">
                                        Dùng giá trị từ Velox, thay thế giá trị đã nhập
                                    </div>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => onResolve('keep')}
                                className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl bg-white/[0.04] hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/40 transition-colors text-left group"
                            >
                                <div className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 shrink-0">
                                    <Shield size={14} className="text-emerald-300" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[13px] font-bold text-zinc-100 group-hover:text-white">
                                        Giữ
                                    </div>
                                    <div className="text-[11px] text-zinc-500 mt-0.5">
                                        Giữ giá trị bạn đã nhập, chỉ điền các field đang trống
                                    </div>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => onResolve('merge')}
                                className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl bg-white/[0.04] hover:bg-indigo-500/10 border border-white/5 hover:border-indigo-500/40 transition-colors text-left group"
                            >
                                <div className="p-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 shrink-0">
                                    <Combine size={14} className="text-indigo-300" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[13px] font-bold text-zinc-100 group-hover:text-white">
                                        Gộp
                                    </div>
                                    <div className="text-[11px] text-zinc-500 mt-0.5">
                                        Nối nội dung (cho Video list + Notes); các field khác sẽ ghi đè
                                    </div>
                                </div>
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
