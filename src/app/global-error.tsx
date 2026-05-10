'use client'

import { useEffect } from 'react'

/**
 * Global error boundary — catches unhandled exceptions in any route.
 *
 * Replaces Next.js's default "Application error: a client-side exception has
 * occurred" generic fallback with a more diagnostic page showing:
 *   1. Error message (so user can screenshot + share)
 *   2. Error digest (server-tracked id for Vercel logs)
 *   3. Reset button to retry
 *   4. Login redirect button as escape hatch
 *
 * Why: production deploys minify/strip the error stack, so users hit blank
 * page with no actionable info. This component surfaces the actual reason.
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        // Log to console for browser-level inspection
        console.error('[GlobalError]', {
            message: error.message,
            digest: error.digest,
            stack: error.stack,
        })

        // Best-effort report to server for Vercel runtime logs
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
                }),
                keepalive: true,
            }).catch(() => { /* network errors swallowed */ })
        } catch {
            // ignore
        }
    }, [error])

    return (
        <html lang="vi">
            <body
                style={{
                    margin: 0,
                    minHeight: '100dvh',
                    background: 'linear-gradient(135deg, #1a0e3d 0%, #0a0014 50%, #000 100%)',
                    color: '#e4e4e7',
                    fontFamily: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '24px 16px',
                }}
            >
                <div
                    style={{
                        maxWidth: 480,
                        width: '100%',
                        background: 'rgba(10,10,10,0.6)',
                        backdropFilter: 'blur(24px)',
                        WebkitBackdropFilter: 'blur(24px)',
                        border: '1px solid rgba(139,92,246,0.20)',
                        borderRadius: 24,
                        padding: 28,
                        boxShadow: '0 32px 80px rgba(0,0,0,0.50)',
                    }}
                >
                    <div
                        style={{
                            width: 56,
                            height: 56,
                            borderRadius: 16,
                            background: 'rgba(239,68,68,0.12)',
                            border: '1px solid rgba(239,68,68,0.30)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 18px',
                            fontSize: 28,
                        }}
                    >
                        ⚠️
                    </div>

                    <h1
                        style={{
                            fontSize: 20,
                            fontWeight: 800,
                            color: '#fff',
                            textAlign: 'center',
                            marginBottom: 10,
                        }}
                    >
                        Có lỗi xảy ra
                    </h1>

                    <p
                        style={{
                            fontSize: 13,
                            color: '#a1a1aa',
                            textAlign: 'center',
                            marginBottom: 18,
                            lineHeight: 1.5,
                        }}
                    >
                        Xin lỗi, đã có sự cố xảy ra khi tải trang. Bạn có thể thử lại hoặc đăng nhập lại.
                    </p>

                    {/* Error details — visible to user for debugging/sharing */}
                    <div
                        style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 12,
                            padding: '12px 14px',
                            marginBottom: 20,
                        }}
                    >
                        <p style={{ fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 6 }}>
                            Chi tiết lỗi
                        </p>
                        <p style={{ fontSize: 12, color: '#fca5a5', wordBreak: 'break-word', fontFamily: 'monospace', marginBottom: 6 }}>
                            {error.message || 'Unknown error'}
                        </p>
                        {error.digest && (
                            <p style={{ fontSize: 11, color: '#71717a', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                                ID: {error.digest}
                            </p>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <button
                            type="button"
                            onClick={reset}
                            style={{
                                width: '100%',
                                padding: '12px 20px',
                                borderRadius: 999,
                                background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: 14,
                                border: 'none',
                                cursor: 'pointer',
                                boxShadow: '0 8px 24px rgba(139,92,246,0.45)',
                            }}
                        >
                            🔄 Thử lại
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                // Hard reload + clear local cache (best-effort)
                                try { localStorage.clear() } catch {}
                                try { sessionStorage.clear() } catch {}
                                window.location.href = '/login'
                            }}
                            style={{
                                width: '100%',
                                padding: '12px 20px',
                                borderRadius: 999,
                                background: 'transparent',
                                color: '#a1a1aa',
                                fontWeight: 600,
                                fontSize: 13,
                                border: '1px solid rgba(255,255,255,0.10)',
                                cursor: 'pointer',
                            }}
                        >
                            Đăng nhập lại + xóa cache
                        </button>
                    </div>
                </div>
            </body>
        </html>
    )
}
