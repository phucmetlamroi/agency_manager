'use client'

import React, { useState, useEffect, useTransition } from 'react'
import { useParams } from 'next/navigation'
import { getLivePresence } from '@/actions/tracking-actions'
import { startImpersonation } from '@/actions/impersonation-actions'
import { Monitor, Clock, UserCheck, UserMinus, RefreshCw, Eye, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

export default function LivePresenceBoard() {
    const params = useParams()
    const workspaceId = params.workspaceId as string
    
    const [presence, setPresence] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [isPending, startTransition] = useTransition()
    const [impersonatingId, setImpersonatingId] = useState<string | null>(null)

    const handleImpersonate = (userId: string) => {
        if (!workspaceId) return
        setImpersonatingId(userId)
        startTransition(() => {
            startImpersonation(userId, workspaceId).catch(console.error).finally(() => {
                setImpersonatingId(null)
            })
        })
    }

    const fetchData = async () => {
        setLoading(true)
        const data = await getLivePresence()
        setPresence(data)
        setLoading(false)
    }

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 15000) // 15s refresh
        return () => clearInterval(interval)
    }, [])

    return (
        <div className="w-full h-full flex flex-col bg-zinc-950/40 rounded-3xl border border-white/5 overflow-hidden">
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-zinc-900/30">
                <div className="flex items-center gap-2">
                    <UserCheck size={18} className="text-emerald-400" />
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">Live Presence</h2>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono">
                        {presence.length} Active
                    </span>
                </div>
                <button 
                    onClick={fetchData}
                    disabled={loading}
                    className="p-1 px-3 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all transition-colors flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
                >
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    Auto-Sync
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {presence.length > 0 ? presence.map((p) => (
                    <div 
                        key={p.userId} 
                        className="group relative bg-zinc-900/40 hover:bg-zinc-800/60 border border-white/5 p-3 rounded-2xl transition-all duration-300"
                    >
                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <Avatar className="h-10 w-10 border border-white/10">
                                    <AvatarImage src={`https://avatar.vercel.sh/${p.username}`} />
                                    <AvatarFallback>{p.username[0]}</AvatarFallback>
                                </Avatar>
                                <span className={clsx(
                                    "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-zinc-900 shadow-sm",
                                    p.status === 'ONLINE' ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
                                )} />
                            </div>
                            
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <h3 className="text-sm font-semibold text-white truncate">{p.username}</h3>
                                    <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">{p.role}</span>
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                    <div className="flex items-center gap-1.5">
                                        {p.status === 'ONLINE' ? (
                                            <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold">
                                                <Monitor size={10} />
                                                <span>Active</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1 text-[10px] text-amber-500 font-bold">
                                                <Clock size={10} />
                                                <span>Idle</span>
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                                        <Clock size={10} />
                                        Last seen: {p.lastSeen}
                                    </span>
                                </div>
                            </div>

                                <div className="ml-auto flex items-center">
                                    <button
                                        onClick={() => handleImpersonate(p.userId)}
                                        disabled={isPending || loading}
                                        className="shrink-0 w-10 h-10 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-400 transition-all duration-300 disabled:opacity-50 flex items-center justify-center border border-indigo-500/30 hover:border-indigo-500/60 shadow-xl z-20"
                                        title={`Test as ${p.username}`}
                                    >
                                        {impersonatingId === p.userId ? (
                                            <Loader2 size={18} className="animate-spin" />
                                        ) : (
                                            <Eye size={18} />
                                        )}
                                    </button>
                                </div>
                            </div>

                        {/* Hover Detail Glow */}
                        <div className={clsx(
                            "absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border",
                            p.status === 'ONLINE' ? "border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.05)]" : "border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.05)]"
                        )} />
                    </div>
                )) : (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-3 py-10 italic">
                        <UserMinus size={32} strokeWidth={1} />
                        <span className="text-xs">No users currently active.</span>
                    </div>
                )}
            </div>

            <div className="p-3 bg-zinc-900/20 border-t border-white/5 flex gap-4 justify-center">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Online</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Away / Inactive</span>
                </div>
            </div>
        </div>
    )
}
