'use client'

/**
 * [Velox Deep Scan v3.1 — UI section 6.4, D2 spec]
 *
 * Broll match policy selector. Active state depends on scan result:
 *   - PENDING_USER_CONFIRM (both general + per-video exist) → user MUST pick
 *     before Apply enables. Inline dropdown with 4 options.
 *   - Other policies → just display the auto-selected mode (read-only info).
 *
 * The 4 options:
 *   - BOTH (Gộp cả 2)
 *   - PERVIDEO_ONLY (Chỉ Per-Video)
 *   - GENERAL_ONLY (Chỉ General)
 *   - CUSTOM (Custom per task → opens VeloxBrollManagerModal)
 */

import { Layers, ChevronDown, AlertCircle, Sliders } from 'lucide-react'
import type { BrollV3, BrollMatchPolicy } from '@/lib/velox-helpers'

interface Props {
    broll: BrollV3 | null
    initialPolicy: BrollMatchPolicy
    selectedPolicy: BrollMatchPolicy
    onPolicyChange: (next: BrollMatchPolicy) => void
    /** Callback to open VeloxBrollManagerModal when user picks CUSTOM */
    onOpenCustomModal?: () => void
}

const POLICY_LABELS: Record<BrollMatchPolicy, string> = {
    PENDING_USER_CONFIRM: 'Pick một mode...',
    BOTH: 'Gộp cả 2 (General + Per-Video)',
    PERVIDEO_ONLY: 'Chỉ Per-Video',
    GENERAL_ONLY: 'Chỉ General',
    CUSTOM: 'Custom per task',
    NONE: 'Không có B-Roll',
}

export default function VeloxBrollMatchSelector({
    broll,
    initialPolicy,
    selectedPolicy,
    onPolicyChange,
    onOpenCustomModal,
}: Props) {
    if (!broll || (broll.generalFolders.length === 0 && broll.perVideoFolders.length === 0 && broll.looseFiles.length === 0)) {
        return null
    }

    const isPending = initialPolicy === 'PENDING_USER_CONFIRM' && selectedPolicy === 'PENDING_USER_CONFIRM'

    // Determine which options are available based on what's detected
    const options: BrollMatchPolicy[] = []
    if (broll.generalFolders.length > 0 && broll.perVideoFolders.length > 0) {
        options.push('BOTH', 'PERVIDEO_ONLY', 'GENERAL_ONLY', 'CUSTOM')
    } else if (broll.generalFolders.length > 0) {
        options.push('GENERAL_ONLY')
    } else if (broll.perVideoFolders.length > 0) {
        options.push('PERVIDEO_ONLY')
    }

    const handlePick = (next: BrollMatchPolicy) => {
        if (next === 'CUSTOM' && onOpenCustomModal) {
            onOpenCustomModal()
            return
        }
        onPolicyChange(next)
    }

    return (
        <div
            className={`rounded-2xl p-4 ${isPending ? 'animate-pulse-slow' : ''}`}
            style={{
                background: isPending
                    ? 'rgba(245,158,11,0.08)'
                    : 'rgba(139,92,246,0.06)',
                border: `1px solid ${
                    isPending ? 'rgba(245,158,11,0.30)' : 'rgba(139,92,246,0.20)'
                }`,
            }}
        >
            <div className="flex items-start gap-3">
                <div
                    className={`p-2 rounded-xl shrink-0 ${
                        isPending
                            ? 'bg-amber-500/15 border border-amber-500/30'
                            : 'bg-violet-500/15 border border-violet-500/30'
                    }`}
                >
                    {isPending ? (
                        <AlertCircle size={14} className="text-amber-300" />
                    ) : (
                        <Layers size={14} className="text-violet-300" />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <h4
                        className={`text-sm font-extrabold mb-1 ${
                            isPending ? 'text-amber-100' : 'text-violet-100'
                        }`}
                    >
                        {isPending
                            ? 'Phát hiện cả General + Per-Video B-Roll'
                            : 'B-Roll match policy (D2)'}
                    </h4>
                    <div className="space-y-1 mb-3 text-[11px]">
                        {broll.generalFolders.length > 0 && (
                            <div className="text-zinc-400">
                                General: {broll.generalFolders.map((g) => g.name).join(', ')} (
                                {broll.generalFolders.reduce((s, g) => s + g.fileCount, 0)} files)
                            </div>
                        )}
                        {broll.perVideoFolders.length > 0 && (
                            <div className="text-zinc-400">
                                Per-Video: {broll.perVideoFolders.map((g) => g.name).join(', ')}
                            </div>
                        )}
                        {broll.looseFiles.length > 0 && (
                            <div className="text-zinc-500 italic">
                                + {broll.looseFiles.length} loose broll file ở root
                            </div>
                        )}
                    </div>

                    {options.length > 0 && (
                        <div className="relative">
                            <select
                                value={selectedPolicy}
                                onChange={(e) => handlePick(e.target.value as BrollMatchPolicy)}
                                className={`appearance-none w-full bg-zinc-900/60 border rounded-full pl-3 pr-9 py-2 text-[12px] focus:outline-none cursor-pointer ${
                                    isPending
                                        ? 'border-amber-500/40 text-amber-100'
                                        : 'border-white/10 text-zinc-200'
                                }`}
                            >
                                {isPending && (
                                    <option value="PENDING_USER_CONFIRM" disabled>
                                        {POLICY_LABELS.PENDING_USER_CONFIRM}
                                    </option>
                                )}
                                {options.map((o) => (
                                    <option key={o} value={o}>
                                        {POLICY_LABELS[o]}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown
                                size={12}
                                className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${
                                    isPending ? 'text-amber-300' : 'text-zinc-500'
                                }`}
                            />
                        </div>
                    )}

                    {isPending && (
                        <p className="mt-2 text-[10px] text-amber-200/70 italic">
                            Apply disabled cho đến khi pick.
                        </p>
                    )}

                    {selectedPolicy === 'CUSTOM' && onOpenCustomModal && (
                        <button
                            type="button"
                            onClick={onOpenCustomModal}
                            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-[11px] text-violet-200 font-semibold hover:bg-violet-500/25"
                        >
                            <Sliders size={11} />
                            Edit custom mapping
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
