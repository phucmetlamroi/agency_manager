'use client'

import { useEffect, useState } from 'react'
import { Volume2, Settings, PhoneCall, Users } from 'lucide-react'
import dynamic from 'next/dynamic'
import type { HubChannelDTO } from '@/actions/channel-actions'
import { getMyChannelManage } from '@/actions/channel-actions'
import ChannelSettingsModal from './ChannelSettingsModal'

// LiveKit SDK is ~3MB — keep it lazy.
const CallRoomModal = dynamic(() => import('./CallRoomModal'), { ssr: false })

/**
 * [Discord parity #9 · VOICE channel type]
 *
 * Renders a pure LiveKit room surface for VOICE-type channels — no message
 * stream, no composer. The "Join voice" button opens the existing
 * CallRoomModal (same one used by TEXT-channel call buttons). Settings gear
 * (MANAGE only) opens ChannelSettingsModal.
 *
 * The channel name doubles as the LiveKit room id (mirrors the TEXT-channel
 * call pattern in ChannelView).
 */
export default function VoiceChannelView({
    workspaceId,
    channel,
    onChannelUpdated,
}: {
    workspaceId: string
    channel: HubChannelDTO
    onChannelUpdated?: (patch: Partial<HubChannelDTO>) => void
}) {
    const [showSettings, setShowSettings] = useState(false)
    const [showCall, setShowCall] = useState(false)
    const [canManage, setCanManage] = useState(false)

    useEffect(() => {
        let cancelled = false
        getMyChannelManage(workspaceId, channel.id).then((res) => {
            if (!cancelled) setCanManage(res.canManage)
        }).catch(() => { })
        return () => { cancelled = true }
    }, [workspaceId, channel.id])

    return (
        <div className="h-full flex flex-col">
            {/* Header — mirrors ChannelView header layout */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <div className="flex items-center gap-2 min-w-0">
                    <Volume2 className="w-4 h-4 text-violet-300 shrink-0" />
                    <h1 className="text-sm font-semibold text-zinc-100 truncate">{channel.name}</h1>
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500 ml-1 shrink-0">Voice</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    {canManage && (
                        <button
                            onClick={() => setShowSettings(true)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/5"
                            title="Cài đặt kênh"
                        >
                            <Settings className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Body — landing surface with join button */}
            <div className="flex-1 min-h-0 grid place-items-center p-6">
                <div className="text-center max-w-md">
                    <div className="mx-auto w-16 h-16 rounded-2xl bg-violet-500/15 border border-violet-500/30 grid place-items-center mb-4">
                        <Volume2 className="w-7 h-7 text-violet-300" />
                    </div>
                    <h2 className="text-lg font-bold text-zinc-100">Kênh thoại · {channel.name}</h2>
                    <p className="mt-1 text-sm text-zinc-400">
                        Tham gia phòng thoại để trò chuyện qua âm thanh / video với thành viên kênh.
                    </p>
                    <button
                        onClick={() => setShowCall(true)}
                        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold px-5 py-2.5 text-sm shadow-lg shadow-violet-900/30"
                        title="Tham gia phòng thoại"
                    >
                        <PhoneCall className="w-4 h-4" />
                        Tham gia phòng thoại
                    </button>
                    {canManage && (
                        <p className="mt-3 text-[11px] text-zinc-500 inline-flex items-center justify-center gap-1">
                            <Users className="w-3 h-3" /> Quản trị viên kênh có thể quản lý thành viên ở Cài đặt.
                        </p>
                    )}
                </div>
            </div>

            {/* LiveKit room — full-screen modal; reuses the same CallRoomModal as TEXT-channel calls. */}
            {showCall && (
                <CallRoomModal
                    workspaceId={workspaceId}
                    channelId={channel.id}
                    channelName={channel.name}
                    onClose={() => setShowCall(false)}
                />
            )}

            {/* Settings reuse — VOICE channels share post-policy/slow-mode UI shape with TEXT for simplicity.
                postPolicy semantics for VOICE: EVERYONE = anyone can join+speak, ADMINS_ONLY = MOD/owner only.
                The actual mic/cam permission is enforced by LiveKit token. */}
            {showSettings && (
                <ChannelSettingsModal
                    workspaceId={workspaceId}
                    channel={channel}
                    onClose={() => setShowSettings(false)}
                    onSaved={(patch) => {
                        onChannelUpdated?.(patch)
                    }}
                />
            )}
        </div>
    )
}
