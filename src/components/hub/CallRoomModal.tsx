'use client'

import { useEffect, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Loader2, X } from 'lucide-react'
import { LiveKitRoom, VideoConference } from '@livekit/components-react'
import '@livekit/components-styles'

interface Props {
    workspaceId: string
    channelId: string
    channelName: string
    onClose: () => void
    onConnected?: () => void
}

/**
 * [Phase 2 · LiveKit] Full-screen call window for a channel. Fetches a short-lived
 * room token from /api/livekit/token, then renders LiveKit's prebuilt
 * VideoConference (grid + mic/cam toggle + screenshare + leave). Loaded via
 * next/dynamic({ssr:false}) so the ~3MB SDK stays out of the main chat bundle.
 */
export default function CallRoomModal({ workspaceId, channelId, channelName, onClose, onConnected }: Props) {
    const [token, setToken] = useState<string | null>(null)
    const [serverUrl, setServerUrl] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const res = await fetch('/api/livekit/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ workspaceId, channelId }),
                })
                const data = await res.json().catch(() => ({}))
                if (cancelled) return
                if (!res.ok) {
                    setError(data?.error || 'Không vào được cuộc gọi.')
                    return
                }
                setToken(data.token)
                setServerUrl(data.url)
            } catch {
                if (!cancelled) setError('Lỗi kết nối tới máy chủ cuộc gọi.')
            }
        })()
        return () => {
            cancelled = true
        }
    }, [workspaceId, channelId])

    return (
        <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-sm" style={{ zIndex: 9998 }} />
                <DialogPrimitive.Content
                    className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col outline-none overflow-hidden"
                    style={{
                        zIndex: 9999,
                        width: 'min(1100px, calc(100vw - 32px))',
                        height: 'min(720px, calc(100vh - 48px))',
                        borderRadius: 20,
                        background: 'rgba(8,8,12,0.97)',
                        border: '1px solid rgba(139,92,246,0.22)',
                        boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
                    }}
                    onInteractOutside={(e) => e.preventDefault()}
                >
                    <DialogPrimitive.Title className="sr-only">Cuộc gọi #{channelName}</DialogPrimitive.Title>
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 shrink-0">
                        <span className="text-sm font-bold text-zinc-100">📹 Cuộc gọi · #{channelName}</span>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition-colors"
                            title="Rời / đóng"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="flex-1 min-h-0" data-lk-theme="default">
                        {error ? (
                            <div className="h-full grid place-items-center text-center px-6">
                                <div>
                                    <p className="text-sm text-red-300 font-semibold">{error}</p>
                                    <p className="text-xs text-zinc-500 mt-2">
                                        Kiểm tra cấu hình LiveKit (API key / URL) hoặc quyền truy cập kênh.
                                    </p>
                                </div>
                            </div>
                        ) : !token || !serverUrl ? (
                            <div className="h-full grid place-items-center text-zinc-400 gap-2 text-sm">
                                <Loader2 className="w-5 h-5 animate-spin" /> Đang kết nối cuộc gọi…
                            </div>
                        ) : (
                            <LiveKitRoom
                                token={token}
                                serverUrl={serverUrl}
                                connect
                                audio
                                video
                                onConnected={onConnected}
                                onDisconnected={onClose}
                                style={{ height: '100%' }}
                            >
                                <VideoConference />
                            </LiveKitRoom>
                        )}
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    )
}
