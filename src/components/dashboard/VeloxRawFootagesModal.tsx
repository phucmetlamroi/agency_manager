'use client'

/**
 * [Velox v1.0 — Phase 2 redesign]
 *
 * Lightweight popup for editing per-video raw footage URLs after Velox
 * applied N≥2 videos. Replaces the full BatchTaskTable (rejected by user as
 * too much UI churn).
 *
 * UX:
 *   - Mini table: 2 cols (Video title — readonly + Raw URL — editable)
 *   - Rows are 1:1 with videoList lines in AddTaskModal (matched by index)
 *   - Save = onChange fires with the full updated array
 *   - User can leave URL empty for a row (task created without rawFootage)
 *
 * NO other fields are editable here — type/price/assignee/notes etc. stay in
 * the regular wizard form (shared across all batch tasks per user's spec).
 */

import { motion, AnimatePresence } from 'framer-motion'
import { X, Rocket } from 'lucide-react'
import { useEffect, useState } from 'react'

interface Props {
    open: boolean
    onClose: () => void
    /** Video titles parsed from form.videoList (split + trim + filter empty) */
    videoTitles: string[]
    /** Current per-video URLs (1:1 with videoTitles by index). Pre-populated
     *  from Velox scan output. */
    urls: string[]
    /** Save callback — fires with the updated URL array. Parent merges into state. */
    onChange: (urls: string[]) => void
}

export default function VeloxRawFootagesModal({
    open,
    onClose,
    videoTitles,
    urls,
    onChange,
}: Props) {
    // Local draft so user can edit + cancel without polluting parent state
    const [draft, setDraft] = useState<string[]>(urls)

    // Resync draft whenever popup opens (in case parent updated array externally)
    useEffect(() => {
        if (open) setDraft(urls)
    }, [open, urls])

    // [Bug fix] Pad draft khi videoTitles dài hơn — KHÔNG truncate khi
    // videoTitles ngắn hơn (tránh mất URLs). Số row hiển thị = max(draft,
    // videoTitles) để user thấy được tất cả URLs đã extract, kể cả khi
    // videoList trên form chính tạm thời chưa khớp.
    useEffect(() => {
        setDraft((prev) => {
            if (videoTitles.length <= prev.length) return prev
            return [...prev, ...Array(videoTitles.length - prev.length).fill('')]
        })
    }, [videoTitles.length])

    const updateRow = (index: number, value: string) => {
        setDraft((prev) => {
            const next = [...prev]
            next[index] = value
            return next
        })
    }

    const handleSave = () => {
        onChange(draft)
        onClose()
    }

    const handleCancel = () => {
        setDraft(urls) // discard edits
        onClose()
    }

    const filledCount = draft.filter((u) => u.trim()).length

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                    onClick={handleCancel}
                >
                    <motion.div
                        initial={{ opacity: 0, y: 16, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 16, scale: 0.97 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-3xl bg-zinc-950/95 backdrop-blur-xl border border-emerald-500/[0.20] shadow-[0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-3 border-b border-white/5 shrink-0">
                            <div className="flex items-start gap-3 min-w-0">
                                <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 shrink-0">
                                    <Rocket size={16} className="text-emerald-300" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-[15px] font-extrabold text-white">
                                        Velox Raw Footages
                                    </h3>
                                    <p className="text-[11px] text-zinc-400 mt-0.5">
                                        {filledCount}/{videoTitles.length} link · chỉ chỉnh sửa được URL của từng video
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="flex items-center justify-center w-7 h-7 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-zinc-400 hover:text-white transition-colors shrink-0"
                                aria-label="Cancel"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        {/* Body — scrollable mini table */}
                        <div className="flex-1 overflow-auto custom-scrollbar px-6 py-4">
                            {(() => {
                                // [Bug fix] Render rows = max(titles, urls). Show all
                                // extracted URLs kể cả khi videoList trên form chính
                                // tạm thời chưa khớp về số dòng.
                                const rowCount = Math.max(videoTitles.length, draft.length)
                                if (rowCount === 0) {
                                    return (
                                        <div className="text-center py-8 text-zinc-500 text-[13px]">
                                            Chưa có video nào trong videoList. Quay về form và thêm video trước.
                                        </div>
                                    )
                                }
                                return (
                                    <table className="w-full text-[12px] border-collapse">
                                        <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur z-10">
                                            <tr className="text-[10px] font-bold uppercase text-zinc-500">
                                                <th className="text-left px-2 py-2 border-b border-white/5 w-[8%]">#</th>
                                                <th className="text-left px-2 py-2 border-b border-white/5 w-[35%]">
                                                    Video title
                                                </th>
                                                <th className="text-left px-2 py-2 border-b border-white/5">
                                                    Raw URL
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Array.from({ length: rowCount }).map((_, idx) => {
                                                const title = videoTitles[idx] ?? `(no title for row ${idx + 1})`
                                                return (
                                                    <tr
                                                        key={idx}
                                                        className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                                                    >
                                                        <td className="px-2 py-2 text-zinc-500 font-mono">{idx + 1}</td>
                                                        <td className={`px-2 py-2 truncate ${
                                                            videoTitles[idx] ? 'text-zinc-200' : 'text-zinc-600 italic'
                                                        }`}>
                                                            {title}
                                                        </td>
                                                        <td className="px-2 py-2">
                                                            <input
                                                                type="url"
                                                                value={draft[idx] ?? ''}
                                                                onChange={(e) => updateRow(idx, e.target.value)}
                                                                placeholder="https://..."
                                                                className="w-full bg-zinc-900/60 border border-white/10 rounded-md px-2.5 py-1.5 text-[11px] font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/40 focus:bg-zinc-900/80"
                                                            />
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                )
                            })()}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between gap-3 px-6 py-3 border-t border-white/5 shrink-0">
                            <p className="text-[11px] text-zinc-500">
                                Chỉnh title trong videoList ở form chính. Đây chỉ edit URL.
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleCancel}
                                    className="px-4 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.10] text-[12px] text-zinc-300 font-semibold transition-colors"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    className="px-4 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-[12px] font-bold transition-colors"
                                >
                                    Lưu
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
