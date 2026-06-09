'use client'

/**
 * [Velox v4 — Multi-Hook Map main canvas]
 *
 * Top-level read-only renderer for `VeloxScanResult`. Lays out one
 * concept block per detected Video/Brand, with hook → body → cta fan-out,
 * a shared-assets row, and the Raw / Unsorted trays on the side.
 *
 * P3 ships read-only. Interactions (drag-drop assign, manual mode toggle,
 * inline rename) land in P4.
 */

import { useRef } from 'react'
import { Sparkles, Folder, Tag } from 'lucide-react'
import type {
    VeloxConcept,
    VeloxNode as VeloxNodeT,
    VeloxScanResult,
} from '@/lib/velox/v4-types'
import VeloxMapNode from './VeloxMapNode'
import VeloxMapTray from './VeloxMapTray'
import VeloxMapWires from './VeloxMapWires'

export interface VeloxMultiHookMapProps {
    result: VeloxScanResult
    /** Called when the user clicks a node card. Parent decides what
     *  happens (open Dropbox URL, show file details, …). */
    onNodeOpen?: (node: VeloxNodeT) => void
    /** Called when the user clicks a tray file. */
    onTrayFileClick?: (file: { name: string; url: string; path: string }) => void
}

export default function VeloxMultiHookMap({
    result,
    onNodeOpen,
    onTrayFileClick,
}: VeloxMultiHookMapProps) {
    const { concepts, sharedAssets, stats, trays, rootFolder, warnings } = result

    return (
        <div className="w-full">
            <Header
                folderName={rootFolder.name}
                folderUrl={rootFolder.url}
                stats={stats}
                warnings={warnings}
            />

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mt-5">
                {/* ─ Canvas ─────────────────────────────────────────────── */}
                <div className="space-y-6">
                    {concepts.length === 0 && sharedAssets.length === 0 && (
                        <div className="bg-zinc-950/50 border border-white/10 rounded-2xl p-8 text-center">
                            <p className="text-zinc-400 text-sm">
                                Velox không nhận diện được cấu trúc nào.
                            </p>
                            <p className="text-zinc-500 text-xs mt-1">
                                Tất cả file trong folder đang nằm ở khay phải. Kéo thủ
                                công khi P4 (drag-drop) hoàn thành.
                            </p>
                        </div>
                    )}

                    {concepts.map((c) => (
                        <ConceptBlock
                            key={c.id}
                            concept={c}
                            sharedAssets={sharedAssets}
                            onNodeOpen={onNodeOpen}
                        />
                    ))}

                    {sharedAssets.length > 0 && (
                        <SharedRow nodes={sharedAssets} onNodeOpen={onNodeOpen} />
                    )}
                </div>

                {/* ─ Right rail ─────────────────────────────────────────── */}
                <div className="space-y-3">
                    <VeloxMapTray
                        kind="unsorted"
                        files={trays.unsorted}
                        defaultOpen
                        onFileClick={onTrayFileClick}
                    />
                    <VeloxMapTray
                        kind="raw"
                        files={trays.raw}
                        defaultOpen={false}
                        onFileClick={onTrayFileClick}
                    />
                </div>
            </div>
        </div>
    )
}

// ────────────────────────────────────────────────────────────────────────────
//  Header — chips + folder breadcrumb + warnings
// ────────────────────────────────────────────────────────────────────────────

function Header({
    folderName,
    folderUrl,
    stats,
    warnings,
}: {
    folderName: string
    folderUrl: string
    stats: VeloxScanResult['stats']
    warnings: string[]
}) {
    return (
        <div className="bg-zinc-950/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-lg shadow-black/40">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <a
                    href={folderUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-zinc-300 hover:text-emerald-300 transition-colors"
                >
                    <Folder className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                    <span className="text-[13px] font-semibold tracking-tight">
                        {folderName}
                    </span>
                </a>
                <span className="text-zinc-700">|</span>

                <Chip label={`${stats.conceptsDetected} concept${stats.conceptsDetected === 1 ? '' : 's'}`} tone="violet" />
                <Chip label={`${stats.hooksDetected} hook`} tone="emerald" />
                <Chip label={`${stats.mappedFiles} mapped`} tone="emerald" />
                <Chip label={`${stats.unsortedFiles} chưa rõ`} tone="indigo" />
                <Chip label={`${stats.rawFiles} raw`} tone="sky" />
            </div>

            {warnings.length > 0 && (
                <ul className="mt-3 space-y-1 text-[11.5px] text-amber-300/90">
                    {warnings.map((w, i) => (
                        <li key={i} className="flex items-start gap-2">
                            <span className="text-amber-400">⚠</span>
                            <span>{w}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

function Chip({
    label,
    tone,
}: {
    label: string
    tone: 'emerald' | 'violet' | 'indigo' | 'sky'
}) {
    const palette = {
        emerald: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
        violet: 'text-violet-300 border-violet-500/30 bg-violet-500/10',
        indigo: 'text-indigo-300 border-indigo-500/30 bg-indigo-500/10',
        sky: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
    }[tone]
    return (
        <span
            className={[
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border font-mono',
                palette,
            ].join(' ')}
        >
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-90" />
            {label}
        </span>
    )
}

// ────────────────────────────────────────────────────────────────────────────
//  Concept block — one Video/Brand lane with fan-out wires
// ────────────────────────────────────────────────────────────────────────────

function ConceptBlock({
    concept,
    sharedAssets,
    onNodeOpen,
}: {
    concept: VeloxConcept
    sharedAssets: VeloxNodeT[]
    onNodeOpen?: (node: VeloxNodeT) => void
}) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const nodeRefs = useRef<Map<string, HTMLElement | null>>(new Map())

    const hooks = concept.nodes.filter((n) => n.role === 'HOOK')
    const callouts = concept.nodes.filter((n) => n.role === 'CALLOUT')
    const body = concept.nodes.find((n) => n.role === 'BODY')
    const cta =
        concept.nodes.find((n) => n.role === 'CTA') ??
        sharedAssets.find((n) => n.role === 'CTA')
    const finals = concept.finals

    const mutedNodeIds = new Set<string>()
    for (const n of concept.nodes) {
        if (n.status === 'EXCLUDED' || n.status === 'SUPERSEDED') mutedNodeIds.add(n.id)
    }

    return (
        <div className="bg-zinc-950/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-lg shadow-black/30">
            {/* Concept header */}
            <div className="flex items-center gap-2.5 mb-3">
                <span className="text-[10px] tracking-[0.18em] uppercase font-bold text-violet-300 border border-violet-500/30 bg-violet-500/10 rounded px-1.5 py-0.5 font-mono">
                    {sourceLabel(concept.source)}
                </span>
                <h3 className="text-[15px] font-bold text-white tracking-tight">
                    {concept.label}
                </h3>
                <span className="text-[11px] text-zinc-500 font-mono">
                    · {hooks.length} hook · {callouts.length} callout · {body ? '1 body' : 'không body'}
                </span>
            </div>

            <div
                ref={containerRef}
                className="relative grid grid-cols-[200px_1fr_200px] gap-x-2 items-center min-h-[140px]"
            >
                {/* Lane labels */}
                <div className="absolute -top-0.5 left-3 text-[9.5px] tracking-[0.16em] uppercase font-mono text-zinc-600">
                    Hooks
                </div>
                <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 text-[9.5px] tracking-[0.16em] uppercase font-mono text-zinc-600">
                    Body
                </div>
                <div className="absolute -top-0.5 right-3 text-[9.5px] tracking-[0.16em] uppercase font-mono text-zinc-600">
                    CTA
                </div>

                {/* Wires (absolute behind) */}
                <VeloxMapWires
                    edges={concept.edges}
                    nodeRefs={nodeRefs.current}
                    containerRef={containerRef}
                    mutedNodeIds={mutedNodeIds}
                />

                {/* Column 1 — Hooks + Callouts */}
                <div className="flex flex-col gap-2 z-10">
                    {hooks.map((h) => (
                        <NodeWrap key={h.id} node={h} nodeRefs={nodeRefs.current}>
                            <VeloxMapNode node={h} onOpen={onNodeOpen} />
                        </NodeWrap>
                    ))}
                    {callouts.map((c) => (
                        <NodeWrap key={c.id} node={c} nodeRefs={nodeRefs.current}>
                            <VeloxMapNode node={c} onOpen={onNodeOpen} />
                        </NodeWrap>
                    ))}
                </div>

                {/* Column 2 — Body */}
                <div className="flex justify-center items-center z-10">
                    {body && (
                        <NodeWrap node={body} nodeRefs={nodeRefs.current}>
                            <VeloxMapNode node={body} onOpen={onNodeOpen} />
                        </NodeWrap>
                    )}
                </div>

                {/* Column 3 — CTA */}
                <div className="flex justify-end items-center z-10">
                    {cta && (
                        <NodeWrap node={cta} nodeRefs={nodeRefs.current}>
                            <VeloxMapNode node={cta} onOpen={onNodeOpen} />
                        </NodeWrap>
                    )}
                </div>
            </div>

            {finals.length > 0 && (
                <div className="mt-4 pt-3 border-t border-white/5">
                    <div className="text-[10px] tracking-[0.16em] uppercase font-mono text-zinc-600 mb-2 flex items-center gap-2">
                        <Sparkles className="w-3 h-3" /> Final / Reference
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {finals.map((f) => (
                            <VeloxMapNode key={f.id} node={f} onOpen={onNodeOpen} dense />
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

function NodeWrap({
    node,
    nodeRefs,
    children,
}: {
    node: VeloxNodeT
    nodeRefs: Map<string, HTMLElement | null>
    children: React.ReactNode
}) {
    return (
        <div
            ref={(el) => {
                nodeRefs.set(node.id, el)
            }}
        >
            {children}
        </div>
    )
}

function sourceLabel(source: VeloxConcept['source']): string {
    switch (source) {
        case 'subfolder': return 'subfolder'
        case 'filename': return 'filename'
        case 'brand_prefix': return 'brand'
        case 'default': return 'main'
    }
}

// ────────────────────────────────────────────────────────────────────────────
//  Shared assets row
// ────────────────────────────────────────────────────────────────────────────

function SharedRow({
    nodes,
    onNodeOpen,
}: {
    nodes: VeloxNodeT[]
    onNodeOpen?: (node: VeloxNodeT) => void
}) {
    return (
        <div className="bg-violet-500/[0.04] backdrop-blur-xl border border-dashed border-violet-500/40 rounded-2xl px-5 py-4 shadow-lg shadow-violet-500/5">
            <div className="flex items-center gap-2 mb-2.5">
                <Tag className="w-3.5 h-3.5 text-violet-300" />
                <span className="text-[10px] tracking-[0.18em] uppercase font-mono text-violet-300 font-bold">
                    Shared assets · dùng chung mọi concept
                </span>
            </div>
            <div className="flex flex-wrap gap-2.5">
                {nodes.map((n) => (
                    <VeloxMapNode key={n.id} node={n} onOpen={onNodeOpen} />
                ))}
            </div>
        </div>
    )
}
