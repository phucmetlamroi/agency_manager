'use client'

/**
 * Impersonation Banner — hiển thị ở top khi admin đang impersonate user khác.
 *
 * Audit finding #2.5 (HIGH): Trước đây impersonation TTL 2h không có cảnh báo
 * countdown → admin có thể quên logout, session privileged kéo dài.
 *
 * Component này:
 * - Hiển thị "Đang impersonate user X" + countdown thời gian còn lại
 * - Cảnh báo đỏ khi <10 phút (force admin quay lại nhanh)
 * - Nút "Stop impersonation" hiển thị nổi bật
 *
 * Inject vào layout dashboard/admin nếu session.user.isImpersonating=true.
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeftRight, Clock } from 'lucide-react'

interface Props {
    impersonatedUsername: string
    expiresAtIso: string
    onStop: () => void | Promise<void>
}

export default function ImpersonationBanner({ impersonatedUsername, expiresAtIso, onStop }: Props) {
    const [secondsLeft, setSecondsLeft] = useState(() => {
        const expires = new Date(expiresAtIso).getTime()
        return Math.max(0, Math.floor((expires - Date.now()) / 1000))
    })
    const [stopping, setStopping] = useState(false)

    useEffect(() => {
        const interval = setInterval(() => {
            const expires = new Date(expiresAtIso).getTime()
            const remaining = Math.max(0, Math.floor((expires - Date.now()) / 1000))
            setSecondsLeft(remaining)
            if (remaining === 0) {
                // TTL expired → trigger stop (server sẽ reject anyway)
                onStop()
            }
        }, 1000)
        return () => clearInterval(interval)
    }, [expiresAtIso, onStop])

    const minutes = Math.floor(secondsLeft / 60)
    const seconds = secondsLeft % 60
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

    const isCritical = secondsLeft < 600 // <10 phút → đỏ
    const isWarning = secondsLeft < 1800 // <30 phút → vàng

    const bg = isCritical
        ? 'from-red-600/30 to-red-500/20 border-red-500/50'
        : isWarning
        ? 'from-amber-500/25 to-orange-500/20 border-amber-500/40'
        : 'from-purple-600/25 to-fuchsia-500/20 border-purple-500/40'

    return (
        <div className={`bg-gradient-to-r ${bg} border-b px-4 py-2.5`}>
            <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-3 text-sm">
                {isCritical ? (
                    <AlertTriangle className="w-4 h-4 text-red-300 flex-shrink-0 animate-pulse" />
                ) : (
                    <ArrowLeftRight className="w-4 h-4 text-purple-300 flex-shrink-0" />
                )}

                <span className="text-zinc-100 flex-1">
                    🎭 Bạn đang <strong>impersonate</strong> user <strong className="text-purple-200">{impersonatedUsername}</strong>
                    {isCritical && <span className="text-red-300 ml-2">— Sắp hết hạn!</span>}
                </span>

                <div className="flex items-center gap-1.5 px-2 py-1 bg-black/30 rounded-md font-mono text-xs">
                    <Clock className={`w-3 h-3 ${isCritical ? 'text-red-300' : 'text-zinc-400'}`} />
                    <span className={isCritical ? 'text-red-200 font-bold' : 'text-zinc-200'}>
                        {timeStr}
                    </span>
                </div>

                <button
                    type="button"
                    onClick={() => {
                        if (stopping) return
                        setStopping(true)
                        onStop()
                    }}
                    disabled={stopping}
                    className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-md transition-colors disabled:opacity-50"
                >
                    {stopping ? 'Stopping...' : '← Stop impersonation'}
                </button>
            </div>
        </div>
    )
}
