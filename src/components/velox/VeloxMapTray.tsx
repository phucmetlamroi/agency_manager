'use client'

/**
 * [Velox v4 — Tray panel]
 *
 * Right-side rail for files that didn't land on the map. Two variants
 * share the same component — `kind` flips the label, icon and item style.
 *   - "raw"      → 🗂 Raw / Chưa cắt   (collapsed by default)
 *   - "unsorted" → ⚪ Chưa phân loại  (open by default, low-confidence)
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, Layers, HelpCircle } from 'lucide-react'
import type { VeloxFile } from '@/lib/velox/v4-types'

export interface VeloxMapTrayProps {
    kind: 'raw' | 'unsorted'
    files: VeloxFile[]
    /** Optional header subline (e.g. "folder raw-dump"). */
    subline?: string
    defaultOpen?: boolean
    onFileClick?: (file: VeloxFile) => void
}

export default function VeloxMapTray({
    kind,
    files,
    subline,
    defaultOpen,
    onFileClick,
}: VeloxMapTrayProps) {
    const isUnsorted = kind === 'unsorted'
    const [open, setOpen] = useState(defaultOpen ?? isUnsorted)
    const Icon = isUnsorted ? HelpCircle : Layers

    const title = isUnsorted ? 'Chưa phân loại' : 'Raw / Chưa cắt'
    const helpText = isUnsorted
        ? 'Tên file mơ hồ — Velox không chắc role. Kéo vào lane đúng để gán.'
        : 'Velox nhận ra đây là footage thô / chưa cắt (tên mặc định Premiere & máy quay). Không tự đưa lên bản đồ.'

    return (
        <div className="bg-zinc-950/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl shadow-black/60 overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
                aria-expanded={open}
            >
                <div
                    className={[
                        'w-8 h-8 rounded-lg grid place-items-center flex-none',
                        isUnsorted
                            ? 'bg-zinc-700/40 text-zinc-300'
                            : 'bg-sky-500/15 text-sky-400 border border-sky-500/30',
                    ].join(' ')}
                    aria-hidden="true"
                >
                    <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-white tracking-tight">
                        {title}
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono">
                        {files.length} file{files.length === 1 ? '' : 's'}
                        {subline ? ` · ${subline}` : ''}
                    </div>
                </div>
                <ChevronRight
                    className={[
                        'w-4 h-4 text-zinc-500 transition-transform duration-200',
                        open && 'rotate-90',
                    ]
                        .filter(Boolean)
                        .join(' ')}
                    aria-hidden="true"
                />
            </button>

            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="overflow-hidden"
                    >
                        <div className="px-3 pb-3 pt-1">
                            <p className="text-[11px] text-zinc-500 px-1 py-2 leading-snug italic">
                                {helpText}
                            </p>
                            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1 velox-scroll">
                                {files.length === 0 ? (
                                    <div className="text-[11px] text-zinc-600 italic text-center py-3">
                                        (trống)
                                    </div>
                                ) : (
                                    files.map((f, i) => (
                                        <FileRow
                                            key={`${f.path}-${i}`}
                                            file={f}
                                            onClick={onFileClick}
                                            highlight={isUnsorted}
                                        />
                                    ))
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function FileRow({
    file,
    onClick,
    highlight,
}: {
    file: VeloxFile
    onClick?: (f: VeloxFile) => void
    highlight: boolean
}) {
    return (
        <button
            type="button"
            onClick={() => onClick?.(file)}
            className={[
                'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left',
                'border bg-white/[0.02] text-zinc-300 transition-colors',
                highlight ? 'border-amber-500/20 hover:border-amber-500/40' : 'border-white/5 hover:border-white/15',
                'hover:bg-white/[0.05]',
            ].join(' ')}
            title={file.rawReason || file.path}
        >
            <div className="w-5 h-5 rounded-md bg-white/5 grid place-items-center text-[10px] text-zinc-500 flex-none font-mono">
                {highlight ? '?' : '▦'}
            </div>
            <span className="flex-1 min-w-0 text-[11.5px] font-mono truncate">
                {file.name}
            </span>
            <span className="text-[10px] text-zinc-600 font-mono flex-none">
                {formatSize(file.sizeBytes)}
            </span>
        </button>
    )
}

function formatSize(bytes: number): string {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)}KB`
    if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(0)}MB`
    return `${(bytes / 1_073_741_824).toFixed(1)}GB`
}
