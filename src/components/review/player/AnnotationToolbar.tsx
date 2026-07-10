// [Review module P4.4] Floating drawing toolbar shown over the video while
// annotation mode is active (PRD FR-E05). Tools (pen/line/arrow/rect), the 4 locked
// review colours, stroke size, undo/redo/clear, and a "Xong" that leaves draw mode.
// Purely presentational — every action is delegated to the AnnotationController.

'use client'

import { Pen, Minus, ArrowUpRight, Square, Undo2, Redo2, Trash2, X } from 'lucide-react'
import { ANNOTATION_COLORS } from '@/lib/review/annotation'
import type { AnnotationController, AnnotationTool, AnnotationSizeKey } from './useAnnotation'

const TOOLS: { key: AnnotationTool; icon: React.ReactNode; label: string }[] = [
    { key: 'pen', icon: <Pen className="h-4 w-4" />, label: 'Bút vẽ' },
    { key: 'line', icon: <Minus className="h-4 w-4" />, label: 'Đường thẳng' },
    { key: 'arrow', icon: <ArrowUpRight className="h-4 w-4" />, label: 'Mũi tên' },
    { key: 'rect', icon: <Square className="h-4 w-4" />, label: 'Khung' },
]

const SIZES: { key: AnnotationSizeKey; dot: number }[] = [
    { key: 'small', dot: 4 },
    { key: 'medium', dot: 7 },
    { key: 'large', dot: 11 },
]

export function AnnotationToolbar({ ctl }: { ctl: AnnotationController }) {
    return (
        <div className="pointer-events-auto absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/10 bg-zinc-900/90 px-1.5 py-1 shadow-2xl backdrop-blur">
            {/* tools */}
            {TOOLS.map((t) => (
                <button
                    key={t.key}
                    onClick={() => ctl.setTool(t.key)}
                    title={t.label}
                    aria-label={t.label}
                    className={`grid h-8 w-8 place-items-center rounded-lg transition ${
                        ctl.tool === t.key ? 'bg-primary text-white' : 'text-white/70 hover:bg-white/10'
                    }`}
                >
                    {t.icon}
                </button>
            ))}

            <span className="mx-0.5 h-6 w-px bg-white/10" />

            {/* colours */}
            {Object.entries(ANNOTATION_COLORS).map(([name, hex]) => (
                <button
                    key={name}
                    onClick={() => ctl.setColor(hex)}
                    title={name}
                    aria-label={`Màu ${name}`}
                    className={`grid h-7 w-7 place-items-center rounded-full transition ${
                        ctl.color === hex ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-900' : 'hover:scale-110'
                    }`}
                >
                    <span className="h-4 w-4 rounded-full" style={{ backgroundColor: hex }} />
                </button>
            ))}

            <span className="mx-0.5 h-6 w-px bg-white/10" />

            {/* stroke size */}
            {SIZES.map((s) => (
                <button
                    key={s.key}
                    onClick={() => ctl.setSizeKey(s.key)}
                    title={`Nét ${s.key}`}
                    aria-label={`Nét ${s.key}`}
                    className={`grid h-8 w-7 place-items-center rounded-lg transition ${
                        ctl.sizeKey === s.key ? 'bg-white/15' : 'hover:bg-white/10'
                    }`}
                >
                    <span className="rounded-full bg-white" style={{ width: s.dot, height: s.dot }} />
                </button>
            ))}

            <span className="mx-0.5 h-6 w-px bg-white/10" />

            {/* history */}
            <button
                onClick={ctl.undo}
                disabled={!ctl.canUndo}
                title="Hoàn tác"
                aria-label="Hoàn tác"
                className="grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 disabled:opacity-30"
            >
                <Undo2 className="h-4 w-4" />
            </button>
            <button
                onClick={ctl.redo}
                disabled={!ctl.canRedo}
                title="Làm lại"
                aria-label="Làm lại"
                className="grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 disabled:opacity-30"
            >
                <Redo2 className="h-4 w-4" />
            </button>
            <button
                onClick={ctl.clear}
                disabled={!ctl.canUndo}
                title="Xóa hết"
                aria-label="Xóa hết"
                className="grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-30"
            >
                <Trash2 className="h-4 w-4" />
            </button>

            <span className="mx-0.5 h-6 w-px bg-white/10" />

            <button
                onClick={ctl.reset}
                title="Thoát vẽ"
                aria-label="Thoát vẽ"
                className="grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    )
}
