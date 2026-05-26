'use client'

/**
 * [Velox Deep Scan v3.1 — UI section 6.6]
 *
 * Inline expanded row inside the QuickCreateMode preview table. Shows
 * Body + Hooks + extras file details for a MainItem.kind='pair'.
 *
 * Toggled via the row's chevron icon.
 */

import { ChevronDown, ChevronRight, Film, Layers } from 'lucide-react'
import type { MainItem, MainItemPair, MainItemFolderBundle } from '@/lib/velox-helpers'

interface Props {
    item: MainItem
    expanded: boolean
    onToggleExpand: () => void
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export default function VeloxPairExpandRow({ item, expanded, onToggleExpand }: Props) {
    // Only pair and folder-bundle have meaningful expansion
    const isPair = item.kind === 'pair'
    const isBundle = item.kind === 'folder-bundle'
    if (!isPair && !isBundle) return null

    return (
        <>
            <button
                type="button"
                onClick={onToggleExpand}
                className="flex items-center gap-1 text-zinc-400 hover:text-violet-300 transition-colors"
                title={expanded ? 'Thu gọn' : 'Mở rộng'}
            >
                {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </button>
            {expanded && isPair && <PairExpansion pair={item as MainItemPair} />}
            {expanded && isBundle && <BundleExpansion bundle={item as MainItemFolderBundle} />}
        </>
    )
}

function PairExpansion({ pair }: { pair: MainItemPair }) {
    return (
        <div className="col-span-full pl-8 pr-3 py-2 bg-violet-500/[0.04] border-l-2 border-violet-500/30 ml-2 my-1 rounded text-[10px] text-zinc-300 space-y-1">
            <p className="text-[10px] font-bold uppercase text-violet-300 mb-1">
                🎬 Pair: {pair.basePart}
            </p>
            {pair.body && (
                <div className="flex items-center gap-2">
                    <Film size={10} className="text-emerald-300 shrink-0" />
                    <span className="text-zinc-400">Body:</span>
                    <span className="truncate flex-1">{pair.body.fullName}</span>
                    <span className="text-zinc-500 shrink-0">{formatBytes(pair.body.sizeBytes)}</span>
                </div>
            )}
            {pair.hooks && (
                <div className="flex items-center gap-2">
                    <Film size={10} className="text-amber-300 shrink-0" />
                    <span className="text-zinc-400">Hooks:</span>
                    <span className="truncate flex-1">{pair.hooks.fullName}</span>
                    <span className="text-zinc-500 shrink-0">{formatBytes(pair.hooks.sizeBytes)}</span>
                </div>
            )}
            {pair.extras.map((e, i) => (
                <div key={i} className="flex items-center gap-2">
                    <Film size={10} className="text-zinc-500 shrink-0" />
                    <span className="text-zinc-400">Extra:</span>
                    <span className="truncate flex-1">{e.fullName}</span>
                    <span className="text-zinc-500 shrink-0">{formatBytes(e.sizeBytes)}</span>
                </div>
            ))}
            {pair.perVideoArollUrl && (
                <div className="flex items-center gap-2 pt-1 border-t border-white/5 mt-1">
                    <span className="text-indigo-300">📂 A-Roll per-video matched</span>
                </div>
            )}
            {pair.perVideoBrollUrls && pair.perVideoBrollUrls.length > 0 && (
                <div className="flex items-center gap-2">
                    <span className="text-indigo-300">📁 {pair.perVideoBrollUrls.length} per-video broll folder matched</span>
                </div>
            )}
        </div>
    )
}

function BundleExpansion({ bundle }: { bundle: MainItemFolderBundle }) {
    return (
        <div className="col-span-full pl-8 pr-3 py-2 bg-emerald-500/[0.04] border-l-2 border-emerald-500/30 ml-2 my-1 rounded text-[10px] text-zinc-300 space-y-1">
            <p className="text-[10px] font-bold uppercase text-emerald-300 mb-1">
                <Layers size={10} className="inline mr-1" />
                Bundle: {bundle.folder.name} ({bundle.folder.videoFiles.length} files)
            </p>
            {bundle.folder.videoFiles.slice(0, 6).map((f) => (
                <div key={f.fileId} className="flex items-center gap-2">
                    <Film size={10} className="text-emerald-200/60 shrink-0" />
                    <span className="truncate flex-1">{f.fullName}</span>
                    <span className="text-zinc-500 shrink-0">{formatBytes(f.sizeBytes)}</span>
                </div>
            ))}
            {bundle.folder.videoFiles.length > 6 && (
                <p className="text-zinc-500 italic">
                    +{bundle.folder.videoFiles.length - 6} files khác trong bundle
                </p>
            )}
        </div>
    )
}
