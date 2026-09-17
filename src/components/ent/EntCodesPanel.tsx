'use client'

// [Giải trí] Bảng phát/thu hồi mã truy cập.
// Mã lưu dạng chữ để chủ hệ thống copy lại được cho người khác — bù lại entropy
// ~79 bit + chặn dò 8 lần/15 phút (theo IP và theo tài khoản).

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowLeft, Copy, Loader2, Plus, Ban, KeyRound } from 'lucide-react'
import { formatEntCode } from '@/lib/ent/code-format'

interface CodeRow {
    id: string
    code: string
    role: 'ENT_ADMIN' | 'ENT_VIEWER'
    note: string | null
    revokedAt: string | null
    useCount: number
    lastUsedAt: string | null
    createdAt: string
}

const ROLE_LABEL: Record<CodeRow['role'], string> = {
    ENT_ADMIN: 'Quản trị (up phim)',
    ENT_VIEWER: 'Người xem',
}

export default function EntCodesPanel() {
    const [codes, setCodes] = useState<CodeRow[] | null>(null)
    const [role, setRole] = useState<CodeRow['role']>('ENT_VIEWER')
    const [note, setNote] = useState('')
    const [busy, setBusy] = useState(false)

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/ent/codes')
            if (res.ok) setCodes((await res.json()).codes)
        } catch {
            /* bỏ qua */
        }
    }, [])
    useEffect(() => {
        load()
    }, [load])

    const create = async () => {
        setBusy(true)
        try {
            const res = await fetch('/api/ent/codes', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ role, note: note.trim() || undefined }),
            })
            if (!res.ok) {
                const b = await res.json().catch(() => null)
                toast.error(b?.error?.message ?? 'Không tạo được mã.')
                return
            }
            setNote('')
            await load()
            toast.success('Đã tạo mã mới.')
        } finally {
            setBusy(false)
        }
    }

    const revoke = async (id: string) => {
        if (!confirm('Thu hồi mã này? Người đang dùng sẽ bị đá ra ngay lập tức.')) return
        const res = await fetch(`/api/ent/codes/${id}/revoke`, { method: 'POST' })
        if (res.ok) {
            await load()
            toast.success('Đã thu hồi mã.')
        }
    }

    const copy = async (code: string) => {
        try {
            await navigator.clipboard.writeText(formatEntCode(code))
            toast.success('Đã sao chép mã.')
        } catch {
            toast.error('Trình duyệt chặn sao chép — hãy chọn và copy tay.')
        }
    }

    return (
        <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
            {/* Về KHO PHIM chứ không phải trang up: lần đầu tiên người ta tới đây từ
                màn nhập mã (chưa có mã ⇒ chưa vào được trang up). */}
            <Link
                href="/entertainment"
                className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
            >
                <ArrowLeft className="h-4 w-4" />
                Về kho phim
            </Link>

            <div className="mb-2 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                    <KeyRound className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <div>
                    <h1 className="text-xl font-semibold text-zinc-100">Mã truy cập kho phim</h1>
                    <p className="text-xs text-zinc-500">
                        Gửi mã kèm đường dẫn <span className="font-mono text-zinc-400">/entertainment</span>. Người nhận
                        vẫn cần tài khoản để đăng nhập.
                    </p>
                </div>
            </div>

            {/* Tạo mã */}
            <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-white/5 bg-zinc-950/50 p-4">
                <label className="flex flex-col gap-1.5">
                    <span className="text-xs text-zinc-500">Loại mã</span>
                    <select
                        value={role}
                        onChange={(e) => setRole(e.target.value as CodeRow['role'])}
                        className="rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500/40"
                    >
                        <option value="ENT_VIEWER">Người xem (chỉ xem phim)</option>
                        <option value="ENT_ADMIN">Quản trị (up + sửa + gỡ phim)</option>
                    </select>
                </label>
                <label className="flex min-w-[180px] flex-1 flex-col gap-1.5">
                    <span className="text-xs text-zinc-500">Ghi chú — phát cho ai</span>
                    <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="ví dụ: Minh (bạn cùng phòng)"
                        className="rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-700 outline-none focus:border-amber-500/40"
                    />
                </label>
                <button
                    onClick={create}
                    disabled={busy}
                    className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
                >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Tạo mã
                </button>
            </div>

            {/* Danh sách */}
            <div className="mt-6 space-y-2">
                {codes === null ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
                    </div>
                ) : codes.length === 0 ? (
                    // Lần chạy đầu tiên — nói thẳng phải làm gì, đừng để một dòng
                    // "Chưa phát mã nào" trống trơn.
                    <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center">
                        <p className="text-sm text-zinc-300">Chưa có mã nào — kho phim đang khoá kín.</p>
                        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-zinc-500">
                            Tạo một mã <span className="text-amber-300">Quản trị</span> ở trên cho chính bạn để vào
                            được trang up phim. Sau đó, muốn cho ai xem thì tạo thêm mã{' '}
                            <span className="text-zinc-300">Người xem</span> và gửi họ kèm đường dẫn{' '}
                            <span className="font-mono text-zinc-400">/entertainment</span>.
                        </p>
                    </div>
                ) : (
                    codes.map((c) => (
                        <motion.div
                            key={c.id}
                            layout
                            className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${
                                c.revokedAt ? 'border-white/5 bg-zinc-950/30 opacity-50' : 'border-white/5 bg-zinc-950/50'
                            }`}
                        >
                            <code className="font-mono text-sm tracking-wider text-zinc-100">{formatEntCode(c.code)}</code>
                            {!c.revokedAt && (
                                <button
                                    onClick={() => copy(c.code)}
                                    className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
                                    title="Sao chép"
                                >
                                    <Copy className="h-3.5 w-3.5" />
                                </button>
                            )}
                            <span
                                className={`rounded-full px-2 py-0.5 text-[11px] ${
                                    c.role === 'ENT_ADMIN' ? 'bg-amber-500/15 text-amber-300' : 'bg-white/5 text-zinc-400'
                                }`}
                            >
                                {ROLE_LABEL[c.role]}
                            </span>
                            {c.note && <span className="text-xs text-zinc-500">{c.note}</span>}
                            <div className="flex-1" />
                            <span className="text-[11px] text-zinc-600">
                                {c.revokedAt
                                    ? 'Đã thu hồi'
                                    : c.useCount
                                      ? `Dùng ${c.useCount} lần`
                                      : 'Chưa dùng'}
                            </span>
                            {!c.revokedAt && (
                                <button
                                    onClick={() => revoke(c.id)}
                                    className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                                >
                                    <Ban className="h-3.5 w-3.5" />
                                    Thu hồi
                                </button>
                            )}
                        </motion.div>
                    ))
                )}
            </div>
        </div>
    )
}
