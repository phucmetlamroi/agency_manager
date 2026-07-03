'use client'

/**
 * [Video Review] Staff-side uploader for a deliverable's review video. Lives in
 * the admin/editor TaskDetailModal "Bàn giao" card. Flow:
 *   1. requestVersionUpload(taskId) → mints a one-time Cloudflare Stream upload
 *      URL + creates the (not-ready) VideoVersion row (V1/V2/V3…).
 *   2. The browser POSTs the file straight to Stream (bytes never touch our
 *      server / Vercel's 4.5MB limit) with an upload-progress bar.
 *   3. Stream transcodes; the webhook flips ready=true. The client then sees it
 *      in the review portal.
 *
 * Dark-glass staff aesthetic (violet), distinct from the light client portal.
 */

import { useEffect, useRef, useState } from 'react'
import { UploadCloud, Film, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { requestVersionUpload, listTaskVersions } from '@/actions/video-review-staff-actions'
import { useSupabaseChannel } from '@/hooks/useSupabaseChannel'
import { REVIEW_EVENTS, getReviewTaskChannel } from '@/lib/review-channels'

type VersionRow = { id: string; versionNumber: number; label: string | null; ready: boolean; status: string; createdAt: string }

const STATUS_LABEL: Record<string, string> = {
    NEEDS_REVIEW: 'Chờ khách duyệt',
    IN_PROGRESS: 'Đang làm',
    APPROVED: 'Đã duyệt',
    NEEDS_CHANGES: 'Khách yêu cầu sửa',
}

export default function VideoVersionUploader({ taskId }: { taskId: string }) {
    const [versions, setVersions] = useState<VersionRow[]>([])
    const [phase, setPhase] = useState<'idle' | 'minting' | 'uploading' | 'done' | 'error'>('idle')
    const [pct, setPct] = useState(0)
    const [err, setErr] = useState<string | null>(null)
    const fileRef = useRef<HTMLInputElement>(null)

    const refresh = () => {
        listTaskVersions(taskId).then((res) => { if (res.success) setVersions(res.versions) }).catch(() => { })
    }
    useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [taskId])

    // [B4/B6] Stay live: the Stream webhook broadcasts VERSION_NEW when encoding
    // finishes, and client approve / request-changes broadcast STATUS_CHANGED,
    // both onto this deliverable's channel. Re-fetch so "đang xử lý" clears and
    // the status column updates without re-opening the task.
    useSupabaseChannel(
        getReviewTaskChannel(taskId),
        (event) => { if (event === REVIEW_EVENTS.VERSION_NEW || event === REVIEW_EVENTS.STATUS_CHANGED) refresh() },
        true,
    )

    const onPick = async (file: File) => {
        setErr(null); setPct(0); setPhase('minting')
        const res = await requestVersionUpload(taskId)
        if (!res.success || !res.uploadURL) {
            setPhase('error'); setErr(res.error || 'Không tạo được link upload.'); return
        }
        setPhase('uploading')
        try {
            await new Promise<void>((resolve, reject) => {
                const fd = new FormData()
                fd.append('file', file)
                const xhr = new XMLHttpRequest()
                xhr.open('POST', res.uploadURL!)
                xhr.upload.onprogress = (e) => { if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 100)) }
                xhr.onload = () => { (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error('upload_failed_' + xhr.status)) }
                xhr.onerror = () => reject(new Error('network'))
                xhr.send(fd)
            })
            setPhase('done'); setPct(100); refresh()
        } catch (e: any) {
            setPhase('error'); setErr('Tải lên thất bại. Vui lòng thử lại.')
        }
    }

    const busy = phase === 'minting' || phase === 'uploading'

    return (
        <div className="mt-3 pt-3 border-t border-white/5">
            <div className="flex items-center gap-2 mb-2">
                <Film size={13} className="text-violet-400" />
                <span className="text-[12px] font-semibold text-zinc-300">Video review (khách duyệt trực tiếp)</span>
            </div>

            {/* Existing versions */}
            {versions.length > 0 && (
                <div className="flex flex-col gap-1.5 mb-2.5">
                    {versions.map((v) => (
                        <div key={v.id} className="flex items-center gap-2 text-[11.5px]">
                            <span className="font-bold text-violet-300">V{v.versionNumber}</span>
                            <span className={`inline-flex items-center gap-1 ${v.ready ? 'text-zinc-400' : 'text-amber-400'}`}>
                                {v.ready ? STATUS_LABEL[v.status] ?? v.status : (<><Loader2 size={10} className="animate-spin" /> đang xử lý</>)}
                            </span>
                            {v.label && <span className="text-zinc-600 truncate">· {v.label}</span>}
                        </div>
                    ))}
                </div>
            )}

            {/* Upload control */}
            <input
                ref={fileRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.currentTarget.value = '' }}
            />
            {phase === 'uploading' ? (
                <div className="w-full">
                    <div className="flex items-center justify-between text-[11.5px] text-zinc-400 mb-1">
                        <span className="inline-flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Đang tải lên…</span>
                        <span className="tabular-nums">{pct}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full bg-violet-500 transition-[width] duration-200" style={{ width: `${pct}%` }} />
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 px-3 py-1.5 text-[12px] font-semibold text-violet-300 transition-colors disabled:opacity-50"
                >
                    {phase === 'minting' ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}
                    {versions.length > 0 ? `Tải bản V${versions.length + 1}` : 'Tải video review lên'}
                </button>
            )}

            {phase === 'done' && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-emerald-400">
                    <CheckCircle2 size={12} /> Đã tải lên — Cloudflare đang xử lý, khách sẽ xem được sau ít phút.
                </p>
            )}
            {phase === 'error' && err && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-red-400">
                    <AlertCircle size={12} /> {err}
                </p>
            )}
        </div>
    )
}
