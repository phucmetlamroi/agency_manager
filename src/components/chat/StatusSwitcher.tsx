'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { setMyPresence, getMyPresence } from '@/actions/chat-actions'
import { presenceColor, presenceLabel } from '@/lib/presence-format'

const STATUSES: Array<{ value: 'ONLINE' | 'AWAY' | 'BUSY' | 'OFFLINE'; label: string; description: string }> = [
    { value: 'ONLINE', label: 'Online', description: 'Available to chat' },
    { value: 'AWAY', label: 'Away', description: 'Stepped away' },
    { value: 'BUSY', label: 'Busy', description: 'Please don\'t disturb' },
    { value: 'OFFLINE', label: 'Invisible', description: 'Appear offline' },
]

export function StatusSwitcher() {
    const [status, setStatus] = useState<string>('ONLINE')
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        getMyPresence().then(res => {
            if (res.data?.status) setStatus(res.data.status)
        })
    }, [])

    useEffect(() => {
        if (!open) return
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', onClick)
        return () => document.removeEventListener('mousedown', onClick)
    }, [open])

    const handleSelect = async (next: 'ONLINE' | 'AWAY' | 'BUSY' | 'OFFLINE') => {
        setStatus(next)
        setOpen(false)
        await setMyPresence(next)
    }

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] cursor-pointer border border-white/[0.06] transition-colors"
                title="Change my status"
            >
                <span className={`w-2 h-2 rounded-full ${presenceColor(status)}`} />
                <span className="text-[10px] font-semibold text-zinc-400">{presenceLabel(status)}</span>
                <ChevronDown className="w-2.5 h-2.5 text-zinc-500" />
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-1 bg-zinc-900 border border-violet-500/20 rounded-xl shadow-2xl py-1 min-w-[200px] z-50">
                    {STATUSES.map(s => (
                        <button
                            key={s.value}
                            onClick={() => handleSelect(s.value)}
                            className={`w-full flex items-start gap-2 px-3 py-2 cursor-pointer text-left border-none ${
                                status === s.value ? 'bg-violet-500/[0.08]' : 'bg-transparent hover:bg-white/5'
                            }`}
                        >
                            <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${presenceColor(s.value)}`} />
                            <div className="flex-1 min-w-0">
                                <div className="text-[12px] font-medium text-zinc-200">{s.label}</div>
                                <div className="text-[10px] text-zinc-500">{s.description}</div>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
