'use client'

// [Giải trí] KHO PHIM — giao diện người xem.
//
// Theo nếp chung của các trang xem phim: nền tối kiểu rạp để poster tự nổi lên,
// một khu nổi bật trên cùng, rồi lưới poster. Thêm hàng "Xem tiếp" dựng từ
// localStorage (cùng khoá mà trình phát ghi) — không cần bảng nào trong DB.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import type { EntCodeRole } from '@prisma/client'
import { Play, Search, Film, Loader2, AlertTriangle, Subtitles } from 'lucide-react'
import EntTabBar from './EntTabBar'
import { entProgress } from '@/lib/ent/progress'

export interface EntVideoCard {
    id: string
    title: string
    status: 'UPLOADING' | 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED'
    errorMessage: string | null
    durationMs: number | null
    width: number | null
    height: number | null
    sizeBytes: string
    subtitleCount: number
    posterUrl: string | null
    createdAt: string
    /** Mux đã nhận việc chưa — phân biệt "xếp hàng" với "đang chuyển mã". */
    hasMuxAsset: boolean
    /** Mốc đổi trạng thái gần nhất; gốc để đếm "đã bao lâu". */
    updatedAt: string
}

const RESUME_PREFIX = 'ent:pos:'

function fmtDuration(ms: number | null): string {
    if (!ms) return ''
    const total = Math.round(ms / 1000)
    const h = Math.floor(total / 3600)
    const m = Math.round((total % 3600) / 60)
    return h > 0 ? `${h} giờ ${m ? `${m} phút` : ''}`.trim() : `${m || 1} phút`
}

function qualityBadge(height: number | null): string | null {
    if (!height) return null
    if (height >= 2000) return '4K'
    if (height >= 1000) return '1080p'
    if (height >= 700) return '720p'
    return `${height}p`
}

export default function EntLibrary({ role }: { role: EntCodeRole }) {
    const [videos, setVideos] = useState<EntVideoCard[] | null>(null)
    const [query, setQuery] = useState('')
    const [resume, setResume] = useState<Record<string, number>>({})

    // Nạp danh sách; còn phim đang xử lý thì hỏi lại mỗi 5 giây rồi tự dừng.
    useEffect(() => {
        let alive = true
        let timer: ReturnType<typeof setTimeout> | null = null

        const load = async () => {
            try {
                const res = await fetch('/api/ent/videos')
                if (!res.ok) return
                const body = await res.json()
                if (!alive) return
                setVideos(body.videos)
                const busy = body.videos.some((v: EntVideoCard) => v.status === 'PROCESSING' || v.status === 'UPLOADED')
                if (busy) timer = setTimeout(load, 5000)
            } catch {
                /* mạng chập — lần poll sau tự lo */
            }
        }
        load()
        return () => {
            alive = false
            if (timer) clearTimeout(timer)
        }
    }, [])

    // Vị trí xem dở: đọc đúng các khoá trình phát đã ghi.
    useEffect(() => {
        try {
            const out: Record<string, number> = {}
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i)
                if (!k?.startsWith(RESUME_PREFIX)) continue
                const sec = Number(localStorage.getItem(k))
                if (Number.isFinite(sec) && sec > 0) out[k.slice(RESUME_PREFIX.length)] = sec
            }
            setResume(out)
        } catch {
            /* localStorage bị chặn */
        }
    }, [videos])

    const filtered = useMemo(() => {
        if (!videos) return []
        const q = query.trim().toLowerCase()
        return q ? videos.filter((v) => v.title.toLowerCase().includes(q)) : videos
    }, [videos, query])

    const ready = filtered.filter((v) => v.status === 'READY')
    const hero = !query ? ready[0] : undefined
    const grid = hero ? ready.slice(1) : ready
    const pending = filtered.filter((v) => v.status !== 'READY')
    const continueWatching = ready.filter((v) => resume[v.id] > 0)

    return (
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
            <EntTabBar role={role} />

            {/* Khu nổi bật — phim mới nhất */}
            {hero && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    className="relative mt-6 overflow-hidden rounded-3xl border border-white/5 bg-zinc-900"
                >
                    {hero.posterUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={hero.posterUrl}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover opacity-60"
                        />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent" />
                    <div className="relative flex min-h-[220px] flex-col justify-end gap-3 p-6 md:min-h-[340px] md:p-10">
                        <h2 className="text-2xl font-semibold text-zinc-50 md:text-4xl">{hero.title}</h2>
                        <p className="text-sm text-zinc-400">
                            {[fmtDuration(hero.durationMs), qualityBadge(hero.height), hero.subtitleCount ? 'Có phụ đề' : null]
                                .filter(Boolean)
                                .join(' · ')}
                        </p>
                        <Link
                            href={`/entertainment/watch/${hero.id}`}
                            className="mt-2 inline-flex w-fit items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 font-medium text-zinc-950 transition-colors hover:bg-amber-400"
                        >
                            <Play className="h-4 w-4 fill-current" />
                            Xem ngay
                        </Link>
                    </div>
                </motion.div>
            )}

            {/* Ô tìm */}
            <div className="relative mt-8 max-w-sm">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Tìm phim theo tên…"
                    className="w-full rounded-xl border border-white/10 bg-zinc-900/50 py-2.5 pl-11 pr-4 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors focus:border-amber-500/40"
                />
            </div>

            {videos === null ? (
                <div className="mt-16 flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
                </div>
            ) : (
                <>
                    {continueWatching.length > 0 && !query && (
                        <Section title="Xem tiếp">
                            {continueWatching.map((v) => (
                                <PosterCard key={v.id} v={v} resumeSec={resume[v.id]} />
                            ))}
                        </Section>
                    )}

                    {grid.length > 0 && (
                        <Section title={query ? 'Kết quả' : 'Tất cả phim'}>
                            {grid.map((v) => (
                                <PosterCard key={v.id} v={v} resumeSec={resume[v.id]} />
                            ))}
                        </Section>
                    )}

                    {/* Hàng đang xử lý — chỉ người up thấy (API đã lọc cho người xem) */}
                    {pending.length > 0 && (
                        <Section title="Đang xử lý">
                            {pending.map((v) => (
                                <PendingCard key={v.id} v={v} />
                            ))}
                        </Section>
                    )}

                    {ready.length === 0 && pending.length === 0 && (
                        <div className="mt-20 text-center">
                            <Film className="mx-auto mb-3 h-8 w-8 text-zinc-700" strokeWidth={1.5} />
                            <p className="text-zinc-400">{query ? 'Không tìm thấy phim nào.' : 'Kho phim đang trống.'}</p>
                            {!query && role === 'ENT_ADMIN' && (
                                <p className="mt-2 text-sm text-zinc-600">Sang tab “Up phim” để thêm video.</p>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="mt-10">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-zinc-500">{title}</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{children}</div>
        </section>
    )
}

function PosterCard({ v, resumeSec }: { v: EntVideoCard; resumeSec?: number }) {
    const progress = resumeSec && v.durationMs ? Math.min(1, (resumeSec * 1000) / v.durationMs) : 0
    return (
        <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.18 }}>
            <Link href={`/entertainment/watch/${v.id}`} className="group block">
                <div className="relative aspect-video overflow-hidden rounded-xl border border-white/5 bg-zinc-900">
                    {v.posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={v.posterUrl}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center">
                            <Film className="h-6 w-6 text-zinc-700" />
                        </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/30" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                        <span className="rounded-full bg-amber-500 p-3 text-zinc-950">
                            <Play className="h-5 w-5 fill-current" />
                        </span>
                    </div>

                    {v.durationMs && (
                        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[11px] tabular-nums text-white">
                            {fmtDuration(v.durationMs)}
                        </span>
                    )}
                    {v.subtitleCount > 0 && (
                        <span className="absolute left-1.5 top-1.5 rounded bg-black/75 p-1 text-white" title="Có phụ đề">
                            <Subtitles className="h-3 w-3" />
                        </span>
                    )}
                    {progress > 0 && (
                        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/50">
                            <div className="h-full bg-amber-500" style={{ width: `${progress * 100}%` }} />
                        </div>
                    )}
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-zinc-200 transition-colors group-hover:text-white">{v.title}</p>
                {qualityBadge(v.height) && <p className="text-[11px] text-zinc-600">{qualityBadge(v.height)}</p>}
            </Link>
        </motion.div>
    )
}

function PendingCard({ v }: { v: EntVideoCard }) {
    const p = entProgress(v)
    return (
        <div className="rounded-xl border border-white/5 bg-zinc-950/50 p-4">
            <div className="flex items-center gap-2">
                {p.stuck ? (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                ) : (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-400" />
                )}
                <p className="truncate text-sm text-zinc-300">{v.title}</p>
            </div>
            <p className={`mt-2 text-xs ${p.stuck ? 'text-red-400/80' : 'text-zinc-600'}`}>
                {p.label}
                {p.elapsed ? ` · ${p.elapsed}` : ''}
            </p>
            {p.hint && <p className="mt-1 text-[11px] leading-relaxed text-red-400/70">{p.hint}</p>}
        </div>
    )
}
