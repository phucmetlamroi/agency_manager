'use client'

// [Giải trí] Giao diện NGƯỜI UP: khu kéo-thả + bảng quản lý kho.
// Người xem không bao giờ thấy màn này (trang đã gác vai trò ở phía server).

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import type { EntCodeRole } from '@prisma/client'
import { Film, Trash2, Check, X, Loader2, AlertTriangle, Subtitles, KeyRound, Pencil, Upload, RotateCw } from 'lucide-react'
import EntTabBar from './EntTabBar'
import EntUploadPanel from './EntUploadPanel'
import EntSubtitleManager from './EntSubtitleManager'
import { entProgress } from '@/lib/ent/progress'
import type { EntVideoCard } from './EntLibrary'

function fmtBytes(raw: string): string {
    const n = Number(raw)
    if (!Number.isFinite(n)) return ''
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
    if (n >= 1e6) return `${(n / 1e6).toFixed(0)} MB`
    return `${(n / 1e3).toFixed(0)} KB`
}

export default function EntUploadManager({
    role,
    isGlobalAdmin,
}: {
    role: EntCodeRole
    isGlobalAdmin: boolean
}) {
    const [videos, setVideos] = useState<EntVideoCard[] | null>(null)
    const [editing, setEditing] = useState<string | null>(null)
    const [draftTitle, setDraftTitle] = useState('')
    const [subsFor, setSubsFor] = useState<EntVideoCard | null>(null)
    const [busy, setBusy] = useState<string | null>(null)

    // [rà soát 05/08] Đếm nhịp riêng: trước đây vòng poll móc vào chính `videos`,
    // nên MỘT lần fetch lỗi (mạng chớp) là danh sách không đổi ⇒ effect không chạy
    // lại ⇒ vòng poll CHẾT VĨNH VIỄN, phim treo "Đang chuyển mã" tới khi tải trang.
    const [tick, setTick] = useState(0)

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/ent/videos')
            if (!res.ok) return
            const body = await res.json()
            setVideos(body.videos)
        } catch {
            /* để nhịp sau lo */
        }
    }, [])

    useEffect(() => {
        load()
    }, [load, tick])

    // Còn phim đang xử lý thì hỏi lại mỗi 5 giây, hết thì thôi.
    useEffect(() => {
        if (!videos?.some((v) => v.status === 'PROCESSING' || v.status === 'UPLOADED')) return
        const t = setTimeout(() => setTick((n) => n + 1), 5000)
        return () => clearTimeout(t)
    }, [videos, tick])

    const saveTitle = async (id: string) => {
        const title = draftTitle.trim()
        if (!title) return
        setBusy(id)
        try {
            const res = await fetch(`/api/ent/videos/${id}`, {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ title }),
            })
            if (!res.ok) {
                const b = await res.json().catch(() => null)
                toast.error(b?.error?.message ?? 'Không đổi được tên.')
                return
            }
            setVideos((prev) => prev?.map((v) => (v.id === id ? { ...v, title } : v)) ?? null)
            setEditing(null)
        } finally {
            setBusy(null)
        }
    }

    // Chạy lại từ tệp gốc còn trên R2 — thay cho việc gỡ phim rồi tải lại vài GB.
    const retryVideo = async (v: EntVideoCard) => {
        setBusy(v.id)
        try {
            const res = await fetch(`/api/ent/videos/${v.id}/retry`, { method: 'POST' })
            if (!res.ok) {
                const b = await res.json().catch(() => null)
                toast.error(b?.error?.message ?? 'Không chạy lại được.')
                return
            }
            toast.success('Đã cho chạy lại. Trạng thái sẽ tự cập nhật ngay bên dưới.')
            setTick((n) => n + 1)
        } finally {
            setBusy(null)
        }
    }

    const removeVideo = async (v: EntVideoCard) => {
        if (!confirm(`Gỡ hẳn "${v.title}"? Phim và phụ đề sẽ bị xoá vĩnh viễn, không khôi phục được.`)) return
        setBusy(v.id)
        try {
            const res = await fetch(`/api/ent/videos/${v.id}`, { method: 'DELETE' })
            if (!res.ok) {
                const b = await res.json().catch(() => null)
                toast.error(b?.error?.message ?? 'Không gỡ được phim.')
                return
            }
            setVideos((prev) => prev?.filter((x) => x.id !== v.id) ?? null)
            toast.success('Đã gỡ phim.')
        } finally {
            setBusy(null)
        }
    }

    return (
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
            <EntTabBar role={role} />

            <section className="mt-6">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-500">
                    <Upload className="h-3.5 w-3.5" />
                    Thêm phim
                </h2>
                <EntUploadPanel onUploaded={load} />
            </section>

            <section className="mt-12">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                        Kho phim {videos ? `(${videos.length})` : ''}
                    </h2>
                    {isGlobalAdmin && (
                        <Link
                            href="/entertainment/codes"
                            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
                        >
                            <KeyRound className="h-3.5 w-3.5" />
                            Mã truy cập
                        </Link>
                    )}
                </div>

                {videos === null ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
                    </div>
                ) : videos.length === 0 ? (
                    <p className="py-10 text-center text-sm text-zinc-600">Chưa có phim nào.</p>
                ) : (
                    <div className="space-y-2">
                        {videos.map((v) => {
                            const p = entProgress(v)
                            // Chỉ mời "Thử lại" khi việc CHƯA tới tay Mux. Đã có asset thì
                            // chạy lại là trả tiền encode lần hai, nên không được gợi ý.
                            const canRetry = !v.hasMuxAsset && (p.stage === 'failed' || p.stuck)
                            return (
                            <motion.div
                                key={v.id}
                                layout
                                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-zinc-950/50 p-3 transition-colors hover:bg-zinc-900/50"
                            >
                                <div className="h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
                                    {v.posterUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={v.posterUrl} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="flex h-full items-center justify-center">
                                            <Film className="h-4 w-4 text-zinc-700" />
                                        </div>
                                    )}
                                </div>

                                <div className="min-w-0 flex-1">
                                    {editing === v.id ? (
                                        <div className="flex items-center gap-1">
                                            <input
                                                autoFocus
                                                value={draftTitle}
                                                onChange={(e) => setDraftTitle(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') saveTitle(v.id)
                                                    if (e.key === 'Escape') setEditing(null)
                                                }}
                                                className="min-w-0 flex-1 rounded-lg border border-amber-500/40 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 outline-none"
                                            />
                                            <button
                                                onClick={() => saveTitle(v.id)}
                                                className="rounded-lg p-1.5 text-emerald-400 hover:bg-white/5"
                                            >
                                                <Check className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => setEditing(null)}
                                                className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => {
                                                setEditing(v.id)
                                                setDraftTitle(v.title)
                                            }}
                                            className="group flex max-w-full items-center gap-2 text-left"
                                        >
                                            <span className="truncate text-sm text-zinc-100">{v.title}</span>
                                            <Pencil className="h-3 w-3 shrink-0 text-zinc-700 transition-colors group-hover:text-zinc-400" />
                                        </button>
                                    )}
                                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-600">
                                        <span
                                            className={
                                                p.stage === 'ready'
                                                    ? 'text-emerald-500'
                                                    : p.stuck
                                                      ? 'text-red-400'
                                                      : 'text-amber-500'
                                            }
                                        >
                                            {p.label}
                                        </span>
                                        {/* Con số CHẠY: bằng chứng duy nhất người dùng có được
                                            rằng hệ thống còn sống, thay cho một vòng xoay câm. */}
                                        {p.elapsed && <span>· {p.elapsed}</span>}
                                        <span>{fmtBytes(v.sizeBytes)}</span>
                                        {v.height && <span>{v.height}p</span>}
                                        {v.subtitleCount > 0 && <span>{v.subtitleCount} phụ đề</span>}
                                    </div>
                                    {p.hint && (
                                        <p className="mt-1 text-[11px] leading-relaxed text-red-400/80">{p.hint}</p>
                                    )}
                                </div>

                                {(p.stage === 'queued' || p.stage === 'encoding') && !p.stuck && (
                                    <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                                )}
                                {p.stuck && <AlertTriangle className="h-4 w-4 text-red-400" />}

                                {canRetry && (
                                    <button
                                        onClick={() => retryVideo(v)}
                                        disabled={busy === v.id}
                                        className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 px-2.5 py-1.5 text-xs text-amber-300 transition-colors hover:bg-amber-500/10 disabled:opacity-40"
                                    >
                                        {busy === v.id ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <RotateCw className="h-3.5 w-3.5" />
                                        )}
                                        Thử lại
                                    </button>
                                )}

                                <button
                                    onClick={() => setSubsFor(v)}
                                    title="Phụ đề"
                                    className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
                                >
                                    <Subtitles className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={() => removeVideo(v)}
                                    disabled={busy === v.id}
                                    title="Gỡ phim"
                                    className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                                >
                                    {busy === v.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Trash2 className="h-4 w-4" />
                                    )}
                                </button>
                            </motion.div>
                            )
                        })}
                    </div>
                )}
            </section>

            <AnimatePresence>
                {subsFor && (
                    <EntSubtitleManager
                        video={subsFor}
                        onClose={() => {
                            setSubsFor(null)
                            load()
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}
