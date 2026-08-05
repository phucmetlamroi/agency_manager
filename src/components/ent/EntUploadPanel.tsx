'use client'

// [Giải trí] Khu kéo-thả + hàng đợi tải phim lên.
//
// Một tệp chạy tại một thời điểm (mỗi tệp đã ăn 6 part song song rồi — chạy hai
// phim cùng lúc chỉ chia đôi băng thông chứ không nhanh hơn), phim còn lại xếp hàng.
//
// ─── SỬA SAU RÀ SOÁT 05/08/2026 ─────────────────────────────────────────────
// • Mỗi lần kéo tệp sinh khoá NGẪU NHIÊN. Trước đây khoá suy ra từ tên+kích
//   thước+ngày sửa nên kéo lại ĐÚNG tệp đã up xong sẽ phát lại phiên cũ (multipart
//   đã đóng) và hỏng vĩnh viễn — kịch bản rất đời thường: up bằng mức "Tiết kiệm",
//   xem thấy mờ, kéo lại tệp đó với mức "Nguyên bản".
//   Khoá ngẫu nhiên cũng dứt lỗi React key trùng (thả cùng tệp hai lần làm hai
//   thanh tiến độ dính nhau).
// • Bấm X gọi ĐÚNG API /abort để R2 đóng multipart ngay.
// • Cảnh báo trước khi đóng tab lúc đang up.
// • Ô đặt tên: người dùng gõ xong mới bắt đầu up (trước đây phim đầu tiên chạy
//   ngay khi thả nên tên gõ vào không kịp gửi đi).
// • Hàng "Xong" có trạng thái riêng, không đứng mãi ở "Đang xử lý".

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { UploadCloud, X, CheckCircle2, AlertTriangle, Loader2, Film, Play } from 'lucide-react'
import { runEntUpload, abortEntUploadOnServer, clearUploadMemory, type EntUploadItem } from '@/lib/ent/upload-client'
import { titleFromFileName, ENT_TITLE_MAX } from '@/lib/ent/constants'

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|mpe?g|3gp|wmv)$/i

function fmtBytes(n: number): string {
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
    if (n >= 1e6) return `${(n / 1e6).toFixed(0)} MB`
    return `${(n / 1e3).toFixed(0)} KB`
}

function fmtSpeed(bps: number | null): string {
    if (!bps || bps <= 0) return ''
    if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} MB/s`
    return `${(bps / 1e3).toFixed(0)} KB/s`
}

function fmtEta(bytesLeft: number, bps: number | null): string {
    if (!bps || bps <= 0 || bytesLeft <= 0) return ''
    const s = Math.round(bytesLeft / bps)
    if (s < 60) return `còn ~${s} giây`
    if (s < 3600) return `còn ~${Math.round(s / 60)} phút`
    return `còn ~${(s / 3600).toFixed(1)} giờ`
}

const PHASE_LABEL: Record<EntUploadItem['phase'], string> = {
    queued: 'Sẵn sàng',
    uploading: 'Đang tải lên',
    finishing: 'Đang chốt',
    processing: 'Đã tải xong',
    failed: 'Lỗi',
    canceled: 'Đã hủy',
}

export default function EntUploadPanel({ onUploaded }: { onUploaded?: () => void }) {
    const [items, setItems] = useState<EntUploadItem[]>([])
    const [dragging, setDragging] = useState(false)
    const [quality, setQuality] = useState<'basic' | 'plus'>('plus')
    const inputRef = useRef<HTMLInputElement>(null)
    const abortRefs = useRef(new Map<string, AbortController>())
    const runningRef = useRef(false)
    // Đọc trong effect nhưng KHÔNG được nằm trong deps — nếu không, mỗi lần
    // onUploaded đổi identity là effect chạy lại giữa chừng.
    const onUploadedRef = useRef(onUploaded)
    onUploadedRef.current = onUploaded

    const patch = useCallback((id: string, p: Partial<EntUploadItem>) => {
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)))
    }, [])

    const add = useCallback(
        (files: File[]) => {
            const accepted = files.filter((f) => f.type.startsWith('video/') || VIDEO_EXT.test(f.name))
            if (!accepted.length) return
            setItems((prev) => [
                ...prev,
                ...accepted.map((file) => ({
                    // Khoá NGẪU NHIÊN cho mỗi lần kéo — xem chú thích đầu file.
                    id:
                        typeof crypto !== 'undefined' && crypto.randomUUID
                            ? crypto.randomUUID()
                            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    file,
                    title: titleFromFileName(file.name),
                    quality,
                    phase: 'queued' as const,
                    progress: 0,
                    speed: null,
                    error: null,
                    videoId: null,
                    sessionId: null,
                })),
            ])
        },
        [quality],
    )

    // Người dùng bấm "Bắt đầu" mới up — cho họ kịp sửa tên và chọn mức chất lượng.
    const [startedIds, setStartedIds] = useState<Set<string>>(() => new Set())
    const start = (id: string) => setStartedIds((prev) => new Set(prev).add(id))
    const startAll = () => setStartedIds(new Set(items.map((i) => i.id)))

    // Bộ chạy tuần tự: rút phim đầu tiên đã được bấm bắt đầu.
    useEffect(() => {
        if (runningRef.current) return
        const next = items.find((it) => it.phase === 'queued' && startedIds.has(it.id))
        if (!next) return

        runningRef.current = true
        const ctrl = new AbortController()
        abortRefs.current.set(next.id, ctrl)

        runEntUpload(next, ctrl.signal, { onUpdate: (p) => patch(next.id, p) })
            .then(() => onUploadedRef.current?.())
            .catch((e: unknown) => {
                if (ctrl.signal.aborted) patch(next.id, { phase: 'canceled' })
                else patch(next.id, { phase: 'failed', error: e instanceof Error ? e.message : 'Tải lên thất bại.' })
            })
            .finally(() => {
                abortRefs.current.delete(next.id)
                runningRef.current = false
                // Nhích state để effect chạy lại và rút phim kế tiếp.
                setItems((prev) => [...prev])
            })
    }, [items, startedIds, patch])

    // Đóng tab giữa lúc đang up là mất cả buổi — phải hỏi lại.
    const busy = items.some((it) => it.phase === 'uploading' || it.phase === 'finishing')
    useEffect(() => {
        if (!busy) return
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault()
            e.returnValue = ''
        }
        window.addEventListener('beforeunload', onBeforeUnload)
        return () => window.removeEventListener('beforeunload', onBeforeUnload)
    }, [busy])

    const remove = (it: EntUploadItem) => {
        const running = it.phase === 'uploading' || it.phase === 'finishing'
        if (running && !confirm(`Hủy tải lên "${it.title}"? Phần đã truyền sẽ bị bỏ.`)) return
        abortRefs.current.get(it.id)?.abort()
        // Báo máy chủ đóng multipart — R2 tính tiền phần đã ghi cho tới khi đóng.
        if (it.sessionId) void abortEntUploadOnServer(it.sessionId)
        clearUploadMemory(it.id)
        setItems((prev) => prev.filter((x) => x.id !== it.id))
    }

    const retry = (id: string) => patch(id, { phase: 'queued', error: null, speed: null })

    return (
        <div className="space-y-4">
            {/* Khu kéo-thả */}
            <div
                onDragOver={(e) => {
                    e.preventDefault()
                    setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                    e.preventDefault()
                    setDragging(false)
                    add(Array.from(e.dataTransfer.files))
                }}
                onClick={() => inputRef.current?.click()}
                className={`cursor-pointer rounded-3xl border-2 border-dashed p-10 text-center transition-colors ${
                    dragging
                        ? 'border-amber-500/60 bg-amber-500/5'
                        : 'border-white/10 bg-zinc-950/40 hover:border-white/20 hover:bg-zinc-900/40'
                }`}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept="video/*,.mkv,.avi,.wmv"
                    multiple
                    hidden
                    onChange={(e) => {
                        add(Array.from(e.target.files ?? []))
                        e.target.value = ''
                    }}
                />
                <UploadCloud className="mx-auto mb-3 h-8 w-8 text-zinc-600" strokeWidth={1.5} />
                <p className="text-zinc-300">Kéo phim thả vào đây, hoặc bấm để chọn tệp</p>
                <p className="mt-1 text-xs text-zinc-600">MP4, MOV, MKV, WebM… tối đa 32 GB mỗi tệp</p>
            </div>

            {/* Chọn mức encode — ảnh hưởng tiền, nên nói thẳng */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-zinc-500">Chất lượng:</span>
                {(
                    [
                        { v: 'plus', label: 'Nguyên bản', hint: 'giữ đúng độ phân giải nguồn (kể cả 4K) — có phí encode một lần' },
                        { v: 'basic', label: 'Tiết kiệm', hint: 'encode miễn phí nhưng tối đa 720p' },
                    ] as const
                ).map((opt) => (
                    <button
                        key={opt.v}
                        onClick={() => setQuality(opt.v)}
                        title={opt.hint}
                        className={`rounded-full border px-3 py-1.5 font-medium transition-colors ${
                            quality === opt.v
                                ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                                : 'border-white/10 text-zinc-400 hover:text-zinc-200'
                        }`}
                    >
                        {opt.label}
                    </button>
                ))}
                <span className="text-zinc-600">
                    {quality === 'plus' ? 'Giữ đúng độ nét gốc.' : 'Rẻ nhất, nhưng phim 1080p/4K sẽ bị hạ xuống 720p.'}
                </span>
            </div>

            {items.some((it) => it.phase === 'queued' && !startedIds.has(it.id)) && (
                <button
                    onClick={startAll}
                    className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-amber-400"
                >
                    <Play className="h-4 w-4 fill-current" />
                    Bắt đầu tải lên
                </button>
            )}

            {/* Hàng đợi */}
            <AnimatePresence initial={false}>
                {items.map((it) => {
                    const started = startedIds.has(it.id)
                    const editable = it.phase === 'queued' && !started
                    const bytesLeft = Math.max(0, it.file.size * (1 - it.progress))
                    return (
                        <motion.div
                            key={it.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.18 }}
                            className="rounded-xl border border-white/5 bg-zinc-950/50 p-4"
                        >
                            <div className="flex items-center gap-3">
                                <Film className="h-4 w-4 shrink-0 text-zinc-600" />
                                <input
                                    value={it.title}
                                    maxLength={ENT_TITLE_MAX}
                                    onChange={(e) => patch(it.id, { title: e.target.value })}
                                    disabled={!editable}
                                    className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-zinc-100 outline-none transition-colors hover:border-white/10 focus:border-amber-500/40 focus:bg-zinc-900/60 disabled:text-zinc-400"
                                />
                                <span className="shrink-0 text-xs text-zinc-600">{fmtBytes(it.file.size)}</span>
                                {it.phase === 'processing' ? (
                                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                                ) : it.phase === 'failed' ? (
                                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                                ) : it.phase === 'uploading' || it.phase === 'finishing' ? (
                                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-400" />
                                ) : null}
                                {editable && (
                                    <button
                                        onClick={() => start(it.id)}
                                        className="shrink-0 rounded-lg px-2 py-1 text-xs text-amber-300 transition-colors hover:bg-amber-500/10"
                                    >
                                        Bắt đầu
                                    </button>
                                )}
                                <button
                                    onClick={() => remove(it)}
                                    className="shrink-0 rounded-lg p-1 text-zinc-600 transition-colors hover:bg-white/5 hover:text-zinc-300"
                                    title={it.phase === 'uploading' ? 'Hủy tải lên' : 'Bỏ khỏi hàng đợi'}
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="mt-3 flex items-center gap-3">
                                <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
                                    <motion.div
                                        className={`h-full ${it.phase === 'failed' ? 'bg-red-500' : 'bg-amber-500'}`}
                                        animate={{ width: `${Math.round(it.progress * 100)}%` }}
                                        transition={{ duration: 0.2 }}
                                    />
                                </div>
                                <span className="w-44 shrink-0 text-right text-[11px] text-zinc-500">
                                    {PHASE_LABEL[it.phase]}
                                    {it.phase === 'uploading' && it.speed
                                        ? ` · ${fmtSpeed(it.speed)} · ${fmtEta(bytesLeft, it.speed)}`
                                        : ''}
                                </span>
                            </div>

                            {it.error && (
                                <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-red-400">
                                    {it.error}
                                    <button onClick={() => retry(it.id)} className="underline hover:text-red-300">
                                        Thử lại
                                    </button>
                                    <span className="text-zinc-600">(tiếp tục từ phần đã truyền xong)</span>
                                </p>
                            )}
                            {it.phase === 'processing' && (
                                <p className="mt-2 text-xs text-zinc-500">
                                    Đã tải lên xong. Đang chuyển mã — phim sẽ xuất hiện trong kho khi sẵn sàng.
                                </p>
                            )}
                        </motion.div>
                    )
                })}
            </AnimatePresence>
        </div>
    )
}
