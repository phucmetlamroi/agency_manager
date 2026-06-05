'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Send, MessageSquare } from 'lucide-react'
import { useSupabaseChannel } from '@/hooks/useSupabaseChannel'
import { getChannelBroadcastTopic, CHAT_EVENTS } from '@/lib/chat-channels'
import {
    getOrCreateClientChannelAsClient, getClientMessages, sendClientMessage,
    type PortalMessageDTO,
} from '@/actions/client-portal-actions'
import { initials } from './format'

export default function MessageModal({ workspaceId, currentUserId, onClose }: {
    workspaceId: string
    currentUserId: string
    onClose: () => void
}) {
    const [channelId, setChannelId] = useState<string | null>(null)
    // [ChatP2-5] Channels the CLIENT has access to (default per-client + invited-into).
    const [channels, setChannels] = useState<{ id: string; name: string }[]>([])
    const [messages, setMessages] = useState<PortalMessageDTO[]>([])
    const [text, setText] = useState('')
    const [loading, setLoading] = useState(true)
    const [sending, setSending] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const scrollRef = useRef<HTMLDivElement>(null)

    const mergeNew = useCallback((incoming: PortalMessageDTO[]) => {
        setMessages(prev => {
            const ids = new Set(prev.map(m => m.id))
            const adds = incoming.filter(m => m && !ids.has(m.id))
            return adds.length ? [...prev, ...adds].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : prev
        })
    }, [])

    // Open / create the per-client channel + list any extra channels the client was invited into.
    useEffect(() => {
        let alive = true
        getOrCreateClientChannelAsClient(workspaceId).then(res => {
            if (!alive) return
            if (!('channel' in res)) { setErr(res.error); setLoading(false); return }
            const ch = res.channel
            setChannelId(ch.id)
            setChannels(res.availableChannels ?? [ch])
            getClientMessages(workspaceId, ch.id).then(r => {
                if (!alive) return
                setMessages(r.messages)
                setLoading(false)
            })
        })
        return () => { alive = false }
    }, [workspaceId])

    // Switch to a different channel (load its history; realtime hook re-subscribes via channelId dep).
    const switchChannel = useCallback((nextId: string) => {
        if (!nextId || nextId === channelId) return
        setChannelId(nextId)
        setMessages([])
        setLoading(true)
        getClientMessages(workspaceId, nextId).then(r => {
            setMessages(r.messages)
            setLoading(false)
        }).catch(() => setLoading(false))
    }, [channelId, workspaceId])

    // Realtime — receive staff replies (and dedupe our own).
    const { broadcast } = useSupabaseChannel(
        channelId ? getChannelBroadcastTopic(channelId) : '',
        (event, payload) => {
            if (event === CHAT_EVENTS.MESSAGE_NEW && payload?.id) mergeNew([payload])
        },
        !!channelId,
    )

    // 15s safety-net poll while open.
    useEffect(() => {
        if (!channelId) return
        const id = setInterval(() => {
            if (document.hidden) return
            getClientMessages(workspaceId, channelId).then(r => mergeNew(r.messages)).catch(() => { })
        }, 15000)
        return () => clearInterval(id)
    }, [channelId, workspaceId, mergeNew])

    useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages])

    const send = async () => {
        const clean = text.trim()
        if (!clean || !channelId || sending) return
        setSending(true); setErr(null)
        const res = await sendClientMessage(workspaceId, channelId, clean)
        setSending(false)
        if (!('message' in res)) { setErr(res.error); return }
        setText('')
        mergeNew([res.message])
        broadcast(CHAT_EVENTS.MESSAGE_NEW, res.message)
    }

    return (
        <>
            <div className="pc-scrim-in" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 90 }} />
            <div className="pc-view-in" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 460, maxWidth: '94vw', height: 560, maxHeight: '90vh', zIndex: 91, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 18, boxShadow: '0 24px 70px rgba(0,0,0,0.6)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                        <span style={{ width: 32, height: 32, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', color: 'var(--accent-fg)' }}><MessageSquare size={16} /></span>
                        <div>
                            <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: 'var(--fg)' }}>Message your team</h2>
                            <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-3)' }}>Ask about a deliverable, deadline or invoice</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="pc-btn pc-btn-quiet" style={{ padding: 8, borderRadius: 9 }}><X size={16} /></button>
                </div>

                {/* [ChatP2-5] Channel switcher — only render when the client has access to >1 channel. */}
                {channels.length > 1 && (
                    <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid var(--line)', overflowX: 'auto' }}>
                        {channels.map(c => {
                            const active = c.id === channelId
                            return (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => switchChannel(c.id)}
                                    style={{
                                        whiteSpace: 'nowrap',
                                        padding: '5px 10px',
                                        borderRadius: 999,
                                        fontSize: 12,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        background: active ? 'var(--accent-soft)' : 'transparent',
                                        border: '1px solid ' + (active ? 'var(--accent-line)' : 'var(--line-2)'),
                                        color: active ? 'var(--accent-fg)' : 'var(--fg-2)',
                                    }}
                                >
                                    #{c.name}
                                </button>
                            )
                        })}
                    </div>
                )}

                {/* Thread */}
                <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {loading ? (
                        <div style={{ margin: 'auto', fontSize: 13, color: 'var(--fg-3)' }}>Loading…</div>
                    ) : messages.length === 0 ? (
                        <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--fg-3)', fontSize: 13.5, maxWidth: 260 }}>
                            No messages yet. Say hello — your team will reply here.
                        </div>
                    ) : messages.map(m => {
                        const mine = m.authorId === currentUserId
                        const name = m.author?.displayName || m.author?.username || (mine ? 'You' : 'Team')
                        return (
                            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', gap: 3 }}>
                                <div style={{ maxWidth: '82%', padding: '9px 12px', borderRadius: 13, fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: mine ? 'var(--accent-soft)' : 'var(--surface-2)', border: '1px solid ' + (mine ? 'var(--accent-line)' : 'var(--line-2)'), color: 'var(--fg-1)' }}>{m.content}</div>
                                <span style={{ fontSize: 10.5, color: 'var(--fg-4)', padding: '0 4px' }}>{mine ? 'You' : name} · {new Date(m.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                        )
                    })}
                </div>

                {/* Composer */}
                <div style={{ padding: 14, borderTop: '1px solid var(--line)' }}>
                    {err && <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--danger)' }}>{err}</p>}
                    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-end' }}>
                        <textarea value={text} onChange={e => setText(e.target.value)} rows={1} placeholder="Write a message…"
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
                            className="pc-input" style={{ height: 'auto', minHeight: 42, maxHeight: 120, padding: '11px 12px', resize: 'none', lineHeight: 1.5, flex: 1 }} />
                        <button className="pc-btn pc-btn-primary" disabled={!text.trim() || sending} onClick={send} style={{ height: 42, padding: '0 14px' }}>
                            <Send size={15} />
                        </button>
                    </div>
                </div>
            </div>
        </>
    )
}
