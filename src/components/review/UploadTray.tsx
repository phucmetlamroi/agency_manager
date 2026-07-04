'use client'

// [Review module P1.10] Global Upload Sheet (UI-UX-SPEC §8.1). Docks bottom-right
// above every admin page, survives navigation (the engine/store are module
// singletons — this only reads them). Per-file progress/speed + pause/resume/cancel,
// batch header, "clear finished". The beforeunload guard lives in the engine.

import { useState } from 'react'
import {
    Film,
    Image as ImageIcon,
    Pause,
    Play,
    X,
    RotateCcw,
    CheckCircle2,
    AlertTriangle,
    ChevronDown,
    ChevronUp,
    Loader2,
    UploadCloud,
} from 'lucide-react'
import { uploadEngine } from '@/lib/review/upload-engine'
import { useUploadItems } from '@/lib/review/use-upload-store'
import {
    aggregateProgress,
    etaSeconds,
    formatBytes,
    type UploadItem,
} from '@/lib/review/upload-store'

export function UploadTray() {
    const items = useUploadItems()
    const [expanded, setExpanded] = useState(true)
    const [confirmCancelAll, setConfirmCancelAll] = useState(false)

    if (items.length === 0) return null

    const agg = aggregateProgress(items)
    const inFlight = agg.active + agg.queued
    const headline =
        inFlight > 0
            ? `Đang tải lên ${inFlight} file — ${agg.percent}%`
            : agg.failed > 0
              ? `${agg.failed} file lỗi • ${agg.done} hoàn tất`
              : `${agg.done} file hoàn tất`

    return (
        <div className="fixed bottom-4 right-4 z-[9998] w-[360px] max-w-[calc(100vw-2rem)]">
            {!expanded ? (
                <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="ml-auto flex items-center gap-2 rounded-full border border-[rgba(139,92,246,0.3)] bg-zinc-950/90 px-4 py-2.5 text-[12px] font-medium text-zinc-200 shadow-2xl shadow-black/60 backdrop-blur-xl transition-colors hover:bg-zinc-900"
                >
                    <UploadCloud size={15} className="text-violet-400" />
                    <span>
                        {inFlight > 0 ? `${inFlight} file` : `${agg.done} xong`} • {agg.percent}%
                    </span>
                    <ChevronUp size={14} className="text-zinc-500" />
                </button>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-[rgba(139,92,246,0.2)] bg-zinc-950/90 shadow-2xl shadow-black/60 backdrop-blur-xl">
                    {/* header */}
                    <div className="flex items-center gap-2 border-b border-white/5 px-3.5 py-2.5">
                        {inFlight > 0 ? (
                            <Loader2 size={14} className="shrink-0 animate-spin text-violet-400" />
                        ) : agg.failed > 0 ? (
                            <AlertTriangle size={14} className="shrink-0 text-red-400" />
                        ) : (
                            <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />
                        )}
                        <span className="flex-1 truncate text-[12.5px] font-medium text-zinc-200">{headline}</span>
                        <button
                            type="button"
                            onClick={() => setExpanded(false)}
                            className="grid h-6 w-6 place-items-center rounded-full text-zinc-500 transition-colors hover:bg-white/[0.08] hover:text-zinc-300"
                            aria-label="Thu gọn"
                        >
                            <ChevronDown size={15} />
                        </button>
                    </div>

                    {/* rows */}
                    <div className="max-h-[320px] overflow-y-auto">
                        {items.map((it) => (
                            <UploadRow key={it.id} item={it} />
                        ))}
                    </div>

                    {/* footer */}
                    <div className="flex items-center justify-between gap-2 border-t border-white/5 px-3 py-2">
                        {confirmCancelAll ? (
                            <div className="flex w-full items-center justify-between gap-2">
                                <span className="text-[11.5px] text-zinc-400">Hủy tất cả upload đang chạy?</span>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            // Only cancel rows still in motion — never terminal
                                            // (done/failed/canceled) ones (would mislabel them).
                                            for (const it of items) {
                                                if (
                                                    it.status !== 'done' &&
                                                    it.status !== 'failed' &&
                                                    it.status !== 'canceled'
                                                ) {
                                                    uploadEngine.cancel(it.id)
                                                }
                                            }
                                            setConfirmCancelAll(false)
                                        }}
                                        className="rounded-full bg-red-500/90 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-red-500"
                                    >
                                        Hủy tất cả
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setConfirmCancelAll(false)}
                                        className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-white/[0.12]"
                                    >
                                        Không
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={() => uploadEngine.clearFinished()}
                                    className="rounded-full px-2.5 py-1 text-[11.5px] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
                                >
                                    Xóa các mục đã xong
                                </button>
                                {inFlight > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setConfirmCancelAll(true)}
                                        className="rounded-full px-2.5 py-1 text-[11.5px] text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-red-300"
                                    >
                                        Hủy tất cả
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

function UploadRow({ item }: { item: UploadItem }) {
    const pct =
        item.sizeBytes > 0 ? Math.min(100, Math.floor((item.bytesUploaded / item.sizeBytes) * 100)) : 0
    const eta = etaSeconds(item)
    const dest = item.folderPath?.length ? item.folderPath.map((b) => b.name).join(' / ') : item.targetLabel

    const cancel = () => {
        if ((item.status === 'uploading' || item.status === 'completing') && pct > 50) {
            if (!window.confirm(`Hủy upload "${item.name}"? Phần đã tải sẽ bị bỏ.`)) return
        }
        uploadEngine.cancel(item.id)
    }

    return (
        <div className="border-t border-white/5 px-3.5 py-2.5 first:border-t-0">
            <div className="flex items-center gap-2">
                {item.kind === 'IMAGE' ? (
                    <ImageIcon size={14} className="shrink-0 text-zinc-500" />
                ) : (
                    <Film size={14} className="shrink-0 text-zinc-500" />
                )}
                <span className="flex-1 truncate text-[12px] text-zinc-200" title={item.name}>
                    {item.name}
                </span>
                <span className="shrink-0 text-[10.5px] tabular-nums text-zinc-500">
                    {formatBytes(item.sizeBytes)}
                </span>
            </div>

            {dest && (
                <div className="mt-0.5 truncate pl-6 text-[10.5px] text-zinc-600" title={dest}>
                    → {dest}
                </div>
            )}

            {/* progress + controls */}
            <div className="mt-1.5 flex items-center gap-2 pl-6">
                {item.status === 'uploading' || item.status === 'paused' || item.status === 'queued' ? (
                    <>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                            <div
                                className={`h-full rounded-full transition-[width] duration-300 ${
                                    item.pausedReason ? 'bg-amber-400/70' : 'bg-[#8B5CF6]'
                                }`}
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                        <span className="w-9 shrink-0 text-right text-[10.5px] tabular-nums text-zinc-400">
                            {pct}%
                        </span>
                    </>
                ) : (
                    <StatusLine item={item} />
                )}

                <RowActions item={item} onCancel={cancel} />
            </div>

            {/* speed / eta line while uploading */}
            {item.status === 'uploading' && item.speedBps ? (
                <div className="mt-1 pl-6 text-[10.5px] tabular-nums text-zinc-500">
                    {formatBytes(item.speedBps)}/s{eta != null ? ` • còn ~${formatEta(eta)}` : ''}
                </div>
            ) : null}

            {/* error detail */}
            {item.status === 'failed' && item.error ? (
                <div className="mt-1 pl-6 text-[10.5px] text-red-300/90">{item.error}</div>
            ) : null}
        </div>
    )
}

function StatusLine({ item }: { item: UploadItem }) {
    if (item.status === 'completing')
        return (
            <span className="flex flex-1 items-center gap-1.5 text-[11px] text-zinc-400">
                <Loader2 size={12} className="animate-spin" /> Đang hoàn tất…
            </span>
        )
    if (item.status === 'processing')
        return (
            <span className="flex flex-1 items-center gap-1.5 text-[11px] text-violet-300">
                <Loader2 size={12} className="animate-spin" /> Đang xử lý video…
            </span>
        )
    if (item.status === 'done')
        return (
            <span className="flex flex-1 items-center gap-1.5 text-[11px] text-emerald-400">
                <CheckCircle2 size={12} /> Hoàn tất
            </span>
        )
    if (item.status === 'failed')
        return (
            <span className="flex flex-1 items-center gap-1.5 text-[11px] text-red-300">
                <AlertTriangle size={12} /> Thất bại
            </span>
        )
    if (item.status === 'canceled')
        return <span className="flex-1 text-[11px] text-zinc-500">Đã hủy</span>
    return <span className="flex-1 text-[11px] text-zinc-500">Chờ…</span>
}

function RowActions({ item, onCancel }: { item: UploadItem; onCancel: () => void }) {
    const iconBtn =
        'grid h-6 w-6 shrink-0 place-items-center rounded-full text-zinc-400 transition-colors hover:bg-white/[0.1] hover:text-zinc-100'
    return (
        <div className="flex shrink-0 items-center gap-0.5">
            {item.status === 'uploading' && (
                <button type="button" onClick={() => uploadEngine.pause(item.id)} className={iconBtn} aria-label="Tạm dừng">
                    <Pause size={13} />
                </button>
            )}
            {item.status === 'paused' && item.pausedReason === 'user' && (
                <button type="button" onClick={() => uploadEngine.resume(item.id)} className={iconBtn} aria-label="Tiếp tục">
                    <Play size={13} />
                </button>
            )}
            {item.status === 'failed' && (
                <button type="button" onClick={() => uploadEngine.retry(item.id)} className={iconBtn} aria-label="Thử lại">
                    <RotateCcw size={13} />
                </button>
            )}
            {item.status === 'done' || item.status === 'canceled' || item.status === 'failed' ? (
                <button type="button" onClick={() => uploadEngine.remove(item.id)} className={iconBtn} aria-label="Bỏ khỏi danh sách">
                    <X size={13} />
                </button>
            ) : (
                <button type="button" onClick={onCancel} className={iconBtn} aria-label="Hủy">
                    <X size={13} />
                </button>
            )}
        </div>
    )
}

function formatEta(sec: number): string {
    if (sec < 60) return `${sec}s`
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}m${s > 0 ? ` ${String(s).padStart(2, '0')}s` : ''}`
}
