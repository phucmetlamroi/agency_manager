'use client'

/**
 * [Velox Deep Scan v3.1 — UI section 6.3, D1 spec]
 *
 * Dropdown for picking taskName format when pair-type MainItems are present.
 *
 * 3 modes:
 *   A — Base raw ("Video 1")
 *   B — Base + Client prefix ("LGR Video 1") [default if prefix detected]
 *   C — Full body filename ("LGR Video 1 Body")
 *
 * Live preview shows first 3 task names rendered in the selected mode.
 */

import { Type, ChevronDown } from 'lucide-react'
import type { MainItem, TaskNameMode } from '@/lib/velox-helpers'

interface Props {
    mainItems: MainItem[]
    selectedMode: TaskNameMode
    onChange: (mode: TaskNameMode) => void
    defaultMode: TaskNameMode
}

const MODE_LABELS: Record<TaskNameMode, string> = {
    A: 'A — Base raw',
    B: 'B — Base + Client prefix',
    C: 'C — Full body filename',
}

export default function VeloxTaskNameSelector({
    mainItems,
    selectedMode,
    onChange,
    defaultMode,
}: Props) {
    // Skip rendering if no pair items (D1 only matters for pairs)
    const hasPairs = mainItems.some((m) => m.kind === 'pair')
    if (!hasPairs) return null

    // Preview: first 3 task names in current mode
    const preview = mainItems.slice(0, 3).map((m) => m.taskNameByMode[selectedMode] ?? m.taskName)

    return (
        <div className="rounded-2xl bg-zinc-950/40 border border-white/8 p-4">
            <div className="flex items-center gap-2 mb-2">
                <Type size={13} className="text-violet-300" />
                <h4 className="text-[11px] font-bold uppercase tracking-wide text-zinc-300">
                    Định dạng tên task (D1)
                </h4>
                {selectedMode === defaultMode && (
                    <span className="text-[10px] text-violet-400 font-semibold">[auto-detect]</span>
                )}
            </div>

            <div className="relative mb-3">
                <select
                    value={selectedMode}
                    onChange={(e) => onChange(e.target.value as TaskNameMode)}
                    className="appearance-none w-full bg-zinc-900/60 border border-white/10 rounded-full pl-3 pr-9 py-2 text-[12px] text-zinc-200 focus:outline-none focus:border-violet-500/40 cursor-pointer"
                >
                    {(['A', 'B', 'C'] as TaskNameMode[]).map((m) => (
                        <option key={m} value={m}>
                            {MODE_LABELS[m]} {m === defaultMode ? '(auto-detect)' : ''}
                        </option>
                    ))}
                </select>
                <ChevronDown
                    size={12}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"
                />
            </div>

            <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase text-zinc-500">Preview</p>
                {preview.map((name, i) => (
                    <div
                        key={i}
                        className="text-[11px] text-zinc-300 font-mono px-2 py-1 rounded bg-white/[0.03]"
                    >
                        {name || '(empty)'}
                    </div>
                ))}
                {mainItems.length > 3 && (
                    <p className="text-[10px] text-zinc-500 italic">
                        +{mainItems.length - 3} task khác sẽ được rename theo cùng pattern.
                    </p>
                )}
            </div>
        </div>
    )
}
