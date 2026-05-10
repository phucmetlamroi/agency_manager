'use client'

import { useEffect } from 'react'

/**
 * Workspace-level error boundary — catches errors specific to /[workspaceId]/* routes.
 *
 * Provides finer-grained recovery than `app/global-error.tsx`: user can retry
 * just the workspace tree without losing the layout chrome. Also surfaces
 * the actual error message instead of generic "Application error" fallback.
 */
export default function WorkspaceError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error('[WorkspaceError]', {
            message: error.message,
            digest: error.digest,
            stack: error.stack,
        })

        try {
            fetch('/api/log-client-error', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: error.message,
                    digest: error.digest,
                    stack: error.stack,
                    url: typeof window !== 'undefined' ? window.location.href : '',
                    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
                    boundary: 'workspace',
                }),
                keepalive: true,
            }).catch(() => { /* ignore network */ })
        } catch {
            // ignore
        }
    }, [error])

    return (
        <div className="min-h-dvh flex items-center justify-center px-4 py-6 bg-gradient-to-br from-[#1a0e3d] via-[#0a0014] to-black">
            <div className="max-w-md w-full rounded-3xl p-7" style={{
                background: 'rgba(10,10,10,0.6)',
                backdropFilter: 'blur(24px)',
                border: '1px solid rgba(139,92,246,0.20)',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center text-2xl" style={{
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.30)',
                }}>
                    ⚠️
                </div>

                <h1 className="text-[18px] font-extrabold text-white text-center mb-2">
                    Trang không thể tải được
                </h1>
                <p className="text-[13px] text-zinc-400 text-center mb-4 leading-relaxed">
                    Đã có sự cố xảy ra khi tải workspace này. Bạn có thể thử lại.
                </p>

                <div className="rounded-xl px-3 py-2.5 mb-4" style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                }}>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-1.5">
                        Chi tiết lỗi
                    </p>
                    <p className="text-[12px] text-red-300 break-words font-mono mb-1">
                        {error.message || 'Unknown error'}
                    </p>
                    {error.digest && (
                        <p className="text-[11px] text-zinc-500 break-all font-mono">
                            ID: {error.digest}
                        </p>
                    )}
                </div>

                <div className="flex flex-col gap-2.5">
                    <button
                        type="button"
                        onClick={reset}
                        className="w-full py-3 rounded-full text-white font-bold text-[14px]"
                        style={{
                            background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
                            boxShadow: '0 8px 24px rgba(139,92,246,0.45)',
                        }}
                    >
                        🔄 Thử lại
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            try { localStorage.clear() } catch {}
                            try { sessionStorage.clear() } catch {}
                            window.location.href = '/login'
                        }}
                        className="w-full py-3 rounded-full text-zinc-400 font-semibold text-[13px]"
                        style={{
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.10)',
                        }}
                    >
                        Đăng nhập lại + xóa cache
                    </button>
                </div>
            </div>
        </div>
    )
}
