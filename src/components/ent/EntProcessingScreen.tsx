'use client'

// [Giải trí] Màn chờ khi phim chưa sẵn sàng (hoặc chuyển mã thất bại).
// Tự làm mới mỗi 5 giây trong lúc còn đang xử lý — người xem không phải F5.

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react'

export default function EntProcessingScreen({
    title,
    failed,
    message,
}: {
    title: string
    failed: boolean
    message: string | null
}) {
    const router = useRouter()

    useEffect(() => {
        if (failed) return
        const t = setInterval(() => router.refresh(), 5000)
        return () => clearInterval(t)
    }, [failed, router])

    return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
            {failed ? (
                <AlertTriangle className="h-9 w-9 text-red-400" />
            ) : (
                <Loader2 className="h-9 w-9 animate-spin text-amber-400" />
            )}
            <h1 className="text-lg font-medium text-zinc-100">{title}</h1>
            <p className="max-w-md text-sm text-zinc-400">
                {failed
                    ? (message ?? 'Chuyển mã thất bại. Hãy gỡ phim này và tải lên lại.')
                    : 'Phim đang được chuyển mã. Trang sẽ tự cập nhật khi sẵn sàng.'}
            </p>
            <Link
                href="/entertainment"
                className="mt-2 inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/5"
            >
                <ArrowLeft className="h-4 w-4" />
                Về kho phim
            </Link>
        </div>
    )
}
