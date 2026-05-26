'use client'

/**
 * [Velox Deep Scan v3.1 — UI section 6.4 D2 CUSTOM]
 *
 * Modal cho user gắn broll per-task riêng biệt khi pick D2 = CUSTOM.
 *
 * Grid layout:
 *   - Mỗi row: 1 MainItem (task)
 *   - Cols: General checkboxes | Per-Video checkboxes | Loose checkboxes
 *   - Save → return Record<mainItemKey, { generalUrls, perVideoUrls, looseUrls }>
 */

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sliders, X } from 'lucide-react'
import type { MainItem, BrollV3 } from '@/lib/velox-helpers'

interface Props {
    open: boolean
    onClose: () => void
    mainItems: MainItem[]
    broll: BrollV3 | null
    initialMap?: Record<string, { generalUrls?: string[]; perVideoUrls?: string[]; looseUrls?: string[] }>
    onSave: (
        map: Record<string, { generalUrls?: string[]; perVideoUrls?: string[]; looseUrls?: string[] }>,
    ) => void
}

/** Stable per-task key for the map */
function getTaskKey(m: MainItem): string {
    if (m.kind === 'file') return m.file.fileId
    if (m.kind === 'pair') return m.basePart
    return m.folder.url
}

function getTaskLabel(m: MainItem): string {
    if (m.kind === 'pair') return m.taskName
    if (m.kind === 'folder-bundle') return m.folder.name
    return m.file.name
}

export default function VeloxBrollManagerModal({
    open,
    onClose,
    mainItems,
    broll,
    initialMap,
    onSave,
}: Props) {
    const [draftMap, setDraftMap] = useState<typeof initialMap>(initialMap ?? {})

    useEffect(() => {
        if (open) {
            setDraftMap(initialMap ?? {})
        }
    }, [open, initialMap])

    const generalFolderUrls = useMemo(
        () => (broll?.generalFolders ?? []).map((f) => ({ url: f.url, name: f.name })),
        [broll],
    )
    const perVideoFolderUrls = useMemo(
        () => (broll?.perVideoFolders ?? []).map((f) => ({ url: f.url, name: f.name, videoIndex: f.videoIndex })),
        [broll],
    )
    const looseFileUrls = useMemo(
        () => (broll?.looseFiles ?? []).map((f) => ({ url: f.previewUrl, name: f.fullName })),
        [broll],
    )

    const toggleUrl = (
        taskKey: string,
        section: 'generalUrls' | 'perVideoUrls' | 'looseUrls',
        url: string,
    ) => {
        setDraftMap((prev) => {
            const current = prev?.[taskKey] ?? {}
            const arr = (current[section] ?? []).slice()
            const idx = arr.indexOf(url)
            if (idx >= 0) arr.splice(idx, 1)
            else arr.push(url)
            return {
                ...prev,
                [taskKey]: {
                    ...current,
                    [section]: arr.length > 0 ? arr : undefined,
                },
            }
        })
    }

    const isChecked = (
        taskKey: string,
        section: 'generalUrls' | 'perVideoUrls' | 'looseUrls',
        url: string,
    ): boolean => {
        return !!draftMap?.[taskKey]?.[section]?.includes(url)
    }

    const handleSave = () => {
        onSave(draftMap ?? {})
        onClose()
    }

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ opacity: 0, y: 16, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 16, scale: 0.97 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-3xl bg-zinc-950/95 backdrop-blur-xl border border-[rgba(139,92,246,0.20)] shadow-[0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-3 border-b border-white/5 shrink-0">
                            <div className="flex items-start gap-3">
                                <div className="p-2 rounded-xl bg-violet-500/15 border border-violet-500/30 shrink-0">
                                    <Sliders size={16} className="text-violet-300" />
                                </div>
                                <div>
                                    <h3 className="text-[15px] font-extrabold text-white">
                                        Custom B-Roll Mapping
                                    </h3>
                                    <p className="text-[11px] text-zinc-400 mt-0.5">
                                        Tick URL muốn gắn vào mỗi task riêng biệt.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex items-center justify-center w-7 h-7 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-zinc-400 hover:text-white shrink-0"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-auto custom-scrollbar px-6 py-4">
                            <table className="w-full text-[11px] border-collapse">
                                <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur z-10">
                                    <tr className="text-[10px] font-bold uppercase text-zinc-500">
                                        <th className="text-left px-2 py-2 border-b border-white/5">Task</th>
                                        <th className="text-left px-2 py-2 border-b border-white/5">General ({generalFolderUrls.length})</th>
                                        <th className="text-left px-2 py-2 border-b border-white/5">Per-Video ({perVideoFolderUrls.length})</th>
                                        <th className="text-left px-2 py-2 border-b border-white/5">Loose ({looseFileUrls.length})</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {mainItems.map((m) => {
                                        const key = getTaskKey(m)
                                        return (
                                            <tr key={key} className="border-b border-white/5">
                                                <td className="px-2 py-2 text-zinc-200 font-medium align-top max-w-[200px]">
                                                    <div className="truncate">{getTaskLabel(m)}</div>
                                                    {m.videoIndex && (
                                                        <div className="text-[10px] text-zinc-500">
                                                            Video #{m.videoIndex}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-2 py-2 align-top">
                                                    <div className="space-y-1">
                                                        {generalFolderUrls.map((g) => (
                                                            <label
                                                                key={g.url}
                                                                className="flex items-center gap-1.5 cursor-pointer text-[10px] text-zinc-300"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked(key, 'generalUrls', g.url)}
                                                                    onChange={() => toggleUrl(key, 'generalUrls', g.url)}
                                                                    className="w-3 h-3 rounded border-white/20 bg-zinc-900 text-violet-500"
                                                                />
                                                                <span className="truncate">{g.name}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-2 py-2 align-top">
                                                    <div className="space-y-1">
                                                        {perVideoFolderUrls.map((p) => (
                                                            <label
                                                                key={p.url}
                                                                className="flex items-center gap-1.5 cursor-pointer text-[10px] text-zinc-300"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked(key, 'perVideoUrls', p.url)}
                                                                    onChange={() => toggleUrl(key, 'perVideoUrls', p.url)}
                                                                    className="w-3 h-3 rounded border-white/20 bg-zinc-900 text-violet-500"
                                                                />
                                                                <span className="truncate">{p.name}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-2 py-2 align-top">
                                                    {looseFileUrls.length > 5 ? (
                                                        <div className="text-[10px] text-zinc-500 italic">
                                                            {looseFileUrls.length} files — tick top 5 hoặc skip
                                                        </div>
                                                    ) : null}
                                                    <div className="space-y-1 max-h-[100px] overflow-auto">
                                                        {looseFileUrls.slice(0, 10).map((l) => (
                                                            <label
                                                                key={l.url}
                                                                className="flex items-center gap-1.5 cursor-pointer text-[10px] text-zinc-300"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked(key, 'looseUrls', l.url)}
                                                                    onChange={() => toggleUrl(key, 'looseUrls', l.url)}
                                                                    className="w-3 h-3 rounded border-white/20 bg-zinc-900 text-violet-500"
                                                                />
                                                                <span className="truncate">{l.name}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-white/5 shrink-0">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.10] text-[12px] text-zinc-300 font-semibold"
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                className="px-4 py-1.5 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-[12px] font-bold"
                            >
                                Lưu mapping
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
