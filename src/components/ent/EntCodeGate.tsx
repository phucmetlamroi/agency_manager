'use client'

// [Giải trí] Màn nhập mã — cửa duy nhất vào kho phim.
//
// Cố ý KHÔNG nói gì về kho phía sau: không đếm số phim, không tên phim, không
// phân biệt "mã sai" với "mã đã thu hồi". Ai chưa có mã thì màn này không tiết
// lộ được điều gì ngoài việc nó tồn tại.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { KeyRound, Loader2, Clapperboard } from 'lucide-react'
import { formatEntCode, normalizeEntCode } from '@/lib/ent/code-format'

export default function EntCodeGate() {
    const router = useRouter()
    const [code, setCode] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const submit = async (e: React.FormEvent) => {
        e.preventDefault()
        const raw = normalizeEntCode(code)
        if (!raw) return
        setBusy(true)
        setError(null)
        try {
            const res = await fetch('/api/ent/auth/verify-code', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ code: raw }),
            })
            if (!res.ok) {
                const body = await res.json().catch(() => null)
                setError(body?.error?.message ?? 'Mã không hợp lệ.')
                setBusy(false)
                return
            }
            // Cookie đã set ở phía server ⇒ refresh để RSC dựng lại đúng giao diện.
            router.refresh()
        } catch {
            setError('Không kết nối được. Kiểm tra mạng rồi thử lại.')
            setBusy(false)
        }
    }

    return (
        <div className="flex min-h-dvh items-center justify-center px-4">
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950/60 p-8 shadow-2xl shadow-black/60 backdrop-blur-xl"
            >
                <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-400">
                        <Clapperboard className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold text-zinc-100">Giải trí</h1>
                        <p className="text-xs text-zinc-500">Khu vực riêng — cần mã truy cập.</p>
                    </div>
                </div>

                <form onSubmit={submit} className="space-y-4">
                    <label className="block">
                        <span className="mb-2 block text-sm text-zinc-400">Mã truy cập</span>
                        <div className="relative">
                            <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                            <input
                                autoFocus
                                value={code}
                                onChange={(e) => setCode(formatEntCode(normalizeEntCode(e.target.value)))}
                                placeholder="XXXX-XXXX-XXXX-XXXX"
                                spellCheck={false}
                                autoComplete="off"
                                className="w-full rounded-xl border border-white/10 bg-zinc-900/50 py-3 pl-11 pr-4 font-mono tracking-wider text-zinc-100 placeholder:text-zinc-700 outline-none transition-colors focus:border-amber-500/40 focus:bg-zinc-900/80"
                            />
                        </div>
                    </label>

                    {error && (
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-sm text-red-400"
                        >
                            {error}
                        </motion.p>
                    )}

                    <motion.button
                        type="submit"
                        disabled={busy || !normalizeEntCode(code)}
                        whileHover={{ scale: busy ? 1 : 1.01 }}
                        whileTap={{ scale: busy ? 1 : 0.99 }}
                        transition={{ duration: 0.15 }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500/90 py-3 font-medium text-zinc-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
                    >
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                        {busy ? 'Đang kiểm tra…' : 'Vào kho phim'}
                    </motion.button>
                </form>
            </motion.div>
        </div>
    )
}
