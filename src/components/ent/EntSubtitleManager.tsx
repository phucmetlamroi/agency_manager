'use client'

// [Giải trí] Hộp thoại quản lý phụ đề của một phim.
// Chỉ nhận tệp .srt do người dùng đưa vào — không có tự sinh phụ đề.

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { X, Upload, Trash2, Loader2, Subtitles } from 'lucide-react'
import type { EntVideoCard } from './EntLibrary'

interface SubRow {
    id: string
    label: string
    lang: string | null
}

export default function EntSubtitleManager({ video, onClose }: { video: EntVideoCard; onClose: () => void }) {
    const [subs, setSubs] = useState<SubRow[] | null>(null)
    const [uploading, setUploading] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const load = async () => {
        try {
            const res = await fetch(`/api/ent/videos/${video.id}/subtitles`)
            if (res.ok) setSubs((await res.json()).subtitles)
        } catch {
            /* bỏ qua */
        }
    }
    useEffect(() => {
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [video.id])

    const upload = async (file: File) => {
        setUploading(true)
        try {
            const fd = new FormData()
            fd.append('file', file)
            // Nhãn mặc định = tên tệp bỏ đuôi; người dùng đổi sau bằng cách up lại
            // với tên khác (kho phim thường chỉ 1-2 phụ đề nên không cần sửa nhãn).
            fd.append('label', file.name.replace(/\.[^.]+$/, ''))
            const res = await fetch(`/api/ent/videos/${video.id}/subtitles`, { method: 'POST', body: fd })
            if (!res.ok) {
                const b = await res.json().catch(() => null)
                toast.error(b?.error?.message ?? 'Không tải được phụ đề.')
                return
            }
            toast.success('Đã thêm phụ đề.')
            await load()
        } finally {
            setUploading(false)
        }
    }

    const remove = async (id: string) => {
        const res = await fetch(`/api/ent/videos/${video.id}/subtitles/${id}`, { method: 'DELETE' })
        if (res.ok) setSubs((prev) => prev?.filter((s) => s.id !== id) ?? null)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.18 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl"
            >
                <div className="mb-5 flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                        <Subtitles className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-zinc-100">Phụ đề</h3>
                        <p className="truncate text-xs text-zinc-500">{video.title}</p>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-200">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {subs === null ? (
                    <div className="flex justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
                    </div>
                ) : subs.length === 0 ? (
                    <p className="py-4 text-center text-sm text-zinc-600">Phim này chưa có phụ đề.</p>
                ) : (
                    <div className="space-y-2">
                        {subs.map((s) => (
                            <div
                                key={s.id}
                                className="flex items-center gap-3 rounded-xl border border-white/5 bg-zinc-900/50 px-3 py-2"
                            >
                                <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{s.label}</span>
                                {s.lang && <span className="text-[11px] text-zinc-600">{s.lang}</span>}
                                <button
                                    onClick={() => remove(s.id)}
                                    className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                                    title="Gỡ phụ đề"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <input
                    ref={inputRef}
                    type="file"
                    accept=".srt,.vtt,text/plain"
                    hidden
                    onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) upload(f)
                        e.target.value = ''
                    }}
                />
                <button
                    onClick={() => inputRef.current?.click()}
                    disabled={uploading}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 py-3 text-sm text-zinc-300 transition-colors hover:border-amber-500/40 hover:bg-amber-500/5 disabled:opacity-50"
                >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploading ? 'Đang xử lý…' : 'Thêm tệp .srt'}
                </button>
                <p className="mt-2 text-center text-[11px] text-zinc-600">
                    Tệp .srt sẽ được chuyển sang định dạng trình duyệt đọc được. Nên lưu bằng mã UTF-8.
                </p>
            </motion.div>
        </div>
    )
}
