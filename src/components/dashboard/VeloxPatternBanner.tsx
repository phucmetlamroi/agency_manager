'use client'

/**
 * [Velox Deep Scan v3.1 — UI section 6.2]
 *
 * Pattern-specific banner shown at top of QuickCreateMode after a successful
 * v=3 scan. Renders one of P1/P2/P3/P4/P5/P7 (P6 wrapper info is rendered
 * inline above this banner when isWrapper=true).
 */

import { FolderTree, Film, Layers, Sparkles, AlertTriangle } from 'lucide-react'
import type { PrimaryPattern, ScanResultV3 } from '@/lib/velox-helpers'

interface Props {
    result: ScanResultV3
}

const PATTERN_META: Record<
    PrimaryPattern,
    { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; tone: 'violet' | 'emerald' | 'amber' | 'indigo' }
> = {
    P1: { icon: Film, label: 'P1 — Flat', tone: 'indigo' },
    P2: { icon: Film, label: 'P2 — Body + Hooks', tone: 'violet' },
    P3: { icon: FolderTree, label: 'P3 — Folder Bundles', tone: 'violet' },
    P4: { icon: Layers, label: 'P4 — A-Roll Triplet', tone: 'emerald' },
    P5: { icon: Sparkles, label: 'P5 — Hybrid', tone: 'emerald' },
    P7: { icon: AlertTriangle, label: 'P7 — Hỗn loạn', tone: 'amber' },
}

const TONE_STYLES = {
    violet: {
        bg: 'rgba(139,92,246,0.08)',
        border: 'rgba(139,92,246,0.30)',
        text: 'text-violet-100',
        sub: 'text-violet-200/80',
        iconBg: 'bg-violet-500/15',
        iconBorder: 'border-violet-500/30',
        iconText: 'text-violet-300',
    },
    emerald: {
        bg: 'rgba(16,185,129,0.08)',
        border: 'rgba(16,185,129,0.30)',
        text: 'text-emerald-100',
        sub: 'text-emerald-200/80',
        iconBg: 'bg-emerald-500/15',
        iconBorder: 'border-emerald-500/30',
        iconText: 'text-emerald-300',
    },
    amber: {
        bg: 'rgba(245,158,11,0.08)',
        border: 'rgba(245,158,11,0.30)',
        text: 'text-amber-100',
        sub: 'text-amber-200/80',
        iconBg: 'bg-amber-500/15',
        iconBorder: 'border-amber-500/30',
        iconText: 'text-amber-300',
    },
    indigo: {
        bg: 'rgba(99,102,241,0.08)',
        border: 'rgba(99,102,241,0.30)',
        text: 'text-indigo-100',
        sub: 'text-indigo-200/80',
        iconBg: 'bg-indigo-500/15',
        iconBorder: 'border-indigo-500/30',
        iconText: 'text-indigo-300',
    },
} as const

function buildPatternMessage(result: ScanResultV3): string {
    const { primaryPattern, mainItems, broll, sharedAssets } = result
    const itemCount = mainItems.length
    const pairs = mainItems.filter((m) => m.kind === 'pair').length
    const bundles = mainItems.filter((m) => m.kind === 'folder-bundle').length

    switch (primaryPattern) {
        case 'P1':
            return `${itemCount} video file ở root, mỗi file = 1 task.`
        case 'P2':
            return pairs > 0
                ? `${pairs} task pair Body+Hooks. ${broll?.looseFiles.length ?? 0} broll loose detected.`
                : `${itemCount} root file với clean naming.`
        case 'P3':
            return `${bundles} bundle folder, mỗi folder = 1 task. Broll folders sẵn sàng gắn.`
        case 'P4':
            return `${pairs} pair từ output container. A-Roll shared + B-Roll variant detected.`
        case 'P5':
            return `${pairs} task pair với A-Roll per-video matched. Shared assets: ${sharedAssets.length}.`
        case 'P7':
            return `Cảnh báo: folder hỗn loạn, ≥50% files trông như camera dump (DSC/IMG/DJI/...). Review kỹ trước khi tạo task.`
    }
}

export default function VeloxPatternBanner({ result }: Props) {
    const meta = PATTERN_META[result.primaryPattern]
    const tone = TONE_STYLES[meta.tone]
    const Icon = meta.icon
    const message = buildPatternMessage(result)
    const confidencePct = Math.round(result.confidence * 100)

    return (
        <div
            className="rounded-2xl p-4 flex items-start gap-3"
            style={{
                background: tone.bg,
                border: `1px solid ${tone.border}`,
            }}
        >
            <div className={`p-2 rounded-xl ${tone.iconBg} border ${tone.iconBorder} shrink-0`}>
                <Icon size={16} className={tone.iconText} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <h4 className={`text-sm font-extrabold ${tone.text}`}>{meta.label}</h4>
                    <span className={`text-[10px] font-bold uppercase ${tone.sub}`}>
                        · Confidence {confidencePct}%
                    </span>
                </div>
                <p className={`text-[12px] leading-relaxed ${tone.sub}`}>{message}</p>
                {result.warnings.length > 0 && (
                    <ul className="mt-2 space-y-1">
                        {result.warnings.map((w, i) => (
                            <li key={i} className="text-[11px] text-amber-300/80 flex items-start gap-1.5">
                                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                                <span>{w}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}
