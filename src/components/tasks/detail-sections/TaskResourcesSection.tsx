"use client"

// [P2-01] "Tài nguyên" tab body: either the Multi-Hook Map panel (when the RAW
// asset is a saved hook graph) or the Resources/References LinkRow grid.
// Extracted verbatim from TaskDetailModal — hook-graph STATE + save handlers live
// in the container and arrive as props. The React-Flow viewers are client-only +
// heavy, so they stay lazy-loaded here (only ship when the Assets tab renders).

import React from "react"
import dynamic from 'next/dynamic'
import { Pencil } from "lucide-react"
import type { HookGraph } from "@/lib/velox/hook-graph-types"
import { Card, LinkRow, type TaskDetailForm } from "./_shared"

const HookGraphViewer = dynamic(
    () => import('@/components/velox/hookgraph/HookGraphViewer').then((m) => m.HookGraphViewer),
    { ssr: false },
)
const HookGraphEditor = dynamic(
    () => import('@/components/velox/hookgraph/HookGraphEditor').then((m) => m.HookGraphEditor),
    { ssr: false },
)

export function TaskResourcesSection({
    form,
    isAdmin,
    hookGraph,
    editingMap,
    editGraph,
    setEditGraph,
    savingMap,
    showMapPanel,
    setShowMapPanel,
    onEditMap,
    onCancelMap,
    onSaveMap,
    onSaveResource,
    onSaveReference,
}: {
    form: TaskDetailForm
    isAdmin: boolean
    hookGraph: HookGraph | null
    editingMap: boolean
    editGraph: HookGraph | null
    setEditGraph: (g: HookGraph | null) => void
    savingMap: boolean
    showMapPanel: boolean
    setShowMapPanel: (v: boolean) => void
    onEditMap: () => void
    onCancelMap: () => void
    onSaveMap: () => void
    onSaveResource: (key: 'linkRaw' | 'linkBroll' | 'scriptLink' | 'submissionFolder', newValue: string) => Promise<void>
    onSaveReference: (key: 'references' | 'collectFilesLink', newValue: string) => Promise<void>
}) {
    if (showMapPanel && hookGraph) {
        /* [Hook Graph] Map panel — opened from the RAW Assets row.
           Has a "← Quay lại" button back to the Resources grid. */
        return (
            <Card
                title="🗺 Multi-Hook Map"
                rightSlot={
                    <div className="flex items-center gap-2">
                        {isAdmin &&
                            (editingMap ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={onCancelMap}
                                        className="rounded-lg px-2.5 py-1 text-[12px] text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                                    >
                                        Hủy
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onSaveMap}
                                        disabled={savingMap}
                                        className="rounded-lg bg-violet-600 px-3 py-1 text-[12px] font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                                    >
                                        {savingMap ? 'Đang lưu…' : 'Lưu map'}
                                    </button>
                                </>
                            ) : (
                                <button
                                    type="button"
                                    onClick={onEditMap}
                                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-medium text-violet-300 hover:bg-violet-500/15"
                                >
                                    <Pencil className="h-3.5 w-3.5" /> Sửa map
                                </button>
                            ))}
                        <button
                            type="button"
                            onClick={() => {
                                if (editingMap) onCancelMap()
                                setShowMapPanel(false)
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[12px] font-medium text-zinc-300 hover:bg-white/10 hover:text-white"
                        >
                            ← Quay lại
                        </button>
                    </div>
                }
            >
                {editingMap ? (
                    <HookGraphEditor
                        initialGraph={editGraph ?? hookGraph}
                        onChange={setEditGraph}
                        height={460}
                    />
                ) : (
                    <HookGraphViewer graph={hookGraph} height={440} />
                )}
            </Card>
        )
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card title="Tài nguyên">
                <div className="flex flex-col">
                    {hookGraph ? (
                        /* [Hook Graph] RAW Assets holds a Multi-Hook Map —
                           show a "configured" pill that opens the map panel. */
                        <button
                            type="button"
                            onClick={() => setShowMapPanel(true)}
                            title="Mở sơ đồ Multi-hook Map"
                            className="group flex w-full items-center justify-between gap-3 border-b border-white/5 py-2 text-left last:border-0"
                        >
                            <span className="flex-shrink-0 text-[12px] font-medium text-zinc-300">
                                File RAW
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-[12px] font-semibold text-violet-300 transition-colors group-hover:bg-violet-500/20">
                                🗺 Multi-hook Map · {hookGraph.blocks.length} block
                                <span className="text-violet-400">→</span>
                            </span>
                        </button>
                    ) : (
                        <LinkRow
                            label="File RAW"
                            value={form.linkRaw}
                            canEdit={isAdmin}
                            onSave={(v) => onSaveResource('linkRaw', v)}
                        />
                    )}
                    <LinkRow
                        label="File B-Roll"
                        value={form.linkBroll}
                        canEdit={isAdmin}
                        onSave={(v) => onSaveResource('linkBroll', v)}
                    />
                    <LinkRow
                        label="Kịch bản"
                        value={form.scriptLink}
                        canEdit={isAdmin}
                        onSave={(v) => onSaveResource('scriptLink', v)}
                    />
                    <LinkRow
                        label="Thư mục nộp bài"
                        value={form.submissionFolder}
                        canEdit={isAdmin}
                        onSave={(v) => onSaveResource('submissionFolder', v)}
                    />
                </div>
            </Card>

            <Card title="Tham khảo">
                <div className="flex flex-col">
                    <LinkRow
                        label="Tài liệu tham khảo"
                        value={form.references}
                        canEdit={isAdmin}
                        onSave={(v) => onSaveReference('references', v)}
                    />
                    <LinkRow
                        label="Dự án mẫu"
                        value={form.collectFilesLink}
                        canEdit={isAdmin}
                        onSave={(v) => onSaveReference('collectFilesLink', v)}
                    />
                </div>
            </Card>
        </div>
    )
}
