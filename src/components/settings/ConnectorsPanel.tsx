'use client'

/**
 * [Quick Create] OAuth Connectors UI — Dropbox + Google Drive
 *
 * Allows each user to connect/disconnect their personal Dropbox or Google
 * Drive account per workspace. Tokens are stored encrypted server-side.
 *
 * Connected state: green dot + "Connected as user@email" + Disconnect button.
 * Disconnected state: gray + "Connect" button → opens OAuth authorize route.
 */

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
    CheckCircle2, XCircle, Loader2, Link2, Unlink,
    CloudUpload, HardDrive,
} from 'lucide-react'
import { toast } from 'sonner'
import { disconnectIntegration } from '@/actions/integration-actions'

/* ──────────────────────────────────────────────────────────────────── */
/*  Types                                                              */
/* ──────────────────────────────────────────────────────────────────── */

interface ConnectedIntegration {
    provider: string
    accountEmail: string | null
    connectedAt: string | Date
    updatedAt: string | Date
}

interface Props {
    workspaceId: string
    integrations: ConnectedIntegration[]
}

interface ProviderMeta {
    id: 'dropbox' | 'google_drive'
    label: string
    description: string
    icon: any
    color: string
    authorizeUrl: string
}

const PROVIDERS: ProviderMeta[] = [
    {
        id: 'dropbox',
        label: 'Dropbox',
        description:
            'Cho phép Velox scan video files trong folder Dropbox của bạn để tạo task hàng loạt.',
        icon: CloudUpload,
        color: 'blue',
        authorizeUrl: '/api/integrations/dropbox/authorize',
    },
    {
        id: 'google_drive',
        label: 'Google Drive',
        description:
            'Cho phép Velox scan video files trong folder Google Drive của bạn để tạo task hàng loạt.',
        icon: HardDrive,
        color: 'emerald',
        authorizeUrl: '/api/integrations/google-drive/authorize',
    },
]

/* ──────────────────────────────────────────────────────────────────── */
/*  Component                                                          */
/* ──────────────────────────────────────────────────────────────────── */

export default function ConnectorsPanel({ workspaceId, integrations }: Props) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [, startTransition] = useTransition()
    const [disconnecting, setDisconnecting] = useState<string | null>(null)

    // Show flash message from OAuth callback (e.g., ?connected=dropbox)
    const connected = searchParams?.get('connected')
    const errorParam = searchParams?.get('error')

    function handleConnect(provider: ProviderMeta) {
        // Open OAuth authorize endpoint — server redirects to provider consent screen
        window.location.href = `${provider.authorizeUrl}?workspaceId=${workspaceId}`
    }

    async function handleDisconnect(providerId: string) {
        if (!confirm(`Ngắt kết nối ${providerId === 'dropbox' ? 'Dropbox' : 'Google Drive'}?`))
            return
        setDisconnecting(providerId)
        try {
            const res = await disconnectIntegration(workspaceId, providerId)
            if ('error' in res) {
                toast.error(res.error)
            } else {
                toast.success('Đã ngắt kết nối.')
                startTransition(() => router.refresh())
            }
        } finally {
            setDisconnecting(null)
        }
    }

    const integrationByProvider = new Map(
        integrations.map((i) => [i.provider, i]),
    )

    return (
        <div className="space-y-4">
            {/* Header */}
            <div>
                <h3 className="text-lg font-bold text-zinc-100">Connectors</h3>
                <p className="text-sm text-zinc-400 mt-1">
                    Kết nối tài khoản Dropbox / Google Drive cá nhân để Velox có thể scan folder video và tạo task hàng loạt.
                </p>
            </div>

            {/* Flash messages */}
            {connected && (
                <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                    <span className="text-sm text-emerald-200">
                        Đã kết nối <strong>{connected === 'dropbox' ? 'Dropbox' : 'Google Drive'}</strong> thành công.
                    </span>
                </div>
            )}
            {errorParam && (
                <div className="rounded-2xl bg-red-500/10 border border-red-500/30 px-4 py-3 flex items-center gap-2">
                    <XCircle size={16} className="text-red-400 shrink-0" />
                    <span className="text-sm text-red-200">
                        Lỗi khi kết nối {errorParam.includes('dropbox') ? 'Dropbox' : 'Google Drive'}. Vui lòng thử lại.
                    </span>
                </div>
            )}

            {/* Provider cards */}
            <div className="space-y-3">
                {PROVIDERS.map((provider) => {
                    const Icon = provider.icon
                    const integration = integrationByProvider.get(provider.id)
                    const isConnected = !!integration
                    const busy = disconnecting === provider.id

                    return (
                        <div
                            key={provider.id}
                            className="rounded-2xl bg-zinc-950/60 backdrop-blur-xl border border-[rgba(139,92,246,0.15)] p-4 transition-colors"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                    <div className={`p-3 rounded-xl bg-${provider.color}-500/10 border border-${provider.color}-500/20 shrink-0`}>
                                        <Icon size={22} className={`text-${provider.color}-400`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h4 className="text-sm font-bold text-zinc-100">{provider.label}</h4>
                                            {isConnected ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold uppercase text-emerald-300">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                                    Connected
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-500/10 border border-zinc-500/20 text-[10px] font-bold uppercase text-zinc-400">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                                                    Disconnected
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-zinc-400 mt-1">{provider.description}</p>
                                        {isConnected && integration.accountEmail && (
                                            <p className="text-[11px] text-zinc-500 mt-2">
                                                Kết nối với tài khoản <span className="text-zinc-300">{integration.accountEmail}</span>
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="shrink-0">
                                    {isConnected ? (
                                        <button
                                            onClick={() => handleDisconnect(provider.id)}
                                            disabled={busy}
                                            className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-semibold transition-colors disabled:opacity-50"
                                        >
                                            {busy ? (
                                                <Loader2 size={12} className="animate-spin" />
                                            ) : (
                                                <Unlink size={12} />
                                            )}
                                            Disconnect
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleConnect(provider)}
                                            className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors"
                                        >
                                            <Link2 size={12} />
                                            Connect
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Help text */}
            <div className="rounded-2xl bg-zinc-900/40 border border-white/5 p-4 mt-6">
                <p className="text-xs text-zinc-400 leading-relaxed">
                    <span className="font-bold text-zinc-300">Bảo mật:</span> Tokens OAuth được mã hóa AES-256-GCM trước khi lưu vào database.
                    Chỉ bạn (chủ tài khoản) có thể truy cập và quản lý kết nối cá nhân của mình.
                    Bạn có thể ngắt kết nối bất kỳ lúc nào — provider sẽ revoke token và app sẽ mất quyền truy cập folder của bạn.
                </p>
            </div>
        </div>
    )
}
