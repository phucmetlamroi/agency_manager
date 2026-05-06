'use client'

import { useEffect, useState } from 'react'
import { AtSign } from 'lucide-react'

export interface MentionableUser {
    id: string
    username: string
    nickname: string | null
    avatarUrl?: string | null
}

interface MentionAutocompleteProps {
    isOpen: boolean
    query: string
    candidates: MentionableUser[]
    onPick: (user: MentionableUser) => void
    onClose: () => void
}

export function MentionAutocomplete({ isOpen, query, candidates, onPick, onClose }: MentionAutocompleteProps) {
    const [activeIdx, setActiveIdx] = useState(0)

    const filtered = candidates.filter(c => {
        if (!query) return true
        const lq = query.toLowerCase()
        return (c.username || '').toLowerCase().includes(lq) || (c.nickname || '').toLowerCase().includes(lq)
    }).slice(0, 8)

    useEffect(() => {
        setActiveIdx(0)
    }, [query, isOpen])

    useEffect(() => {
        if (!isOpen) return
        const onKey = (e: KeyboardEvent) => {
            if (filtered.length === 0) return
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActiveIdx(prev => (prev + 1) % filtered.length)
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActiveIdx(prev => (prev - 1 + filtered.length) % filtered.length)
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                const pick = filtered[activeIdx]
                if (pick) onPick(pick)
            } else if (e.key === 'Escape') {
                onClose()
            }
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
    }, [isOpen, activeIdx, filtered, onPick, onClose])

    if (!isOpen || filtered.length === 0) return null

    return (
        <div className="absolute bottom-full left-2 right-2 mb-1 bg-zinc-900 border border-violet-500/30 rounded-xl shadow-2xl z-30 max-h-[200px] overflow-y-auto">
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase text-zinc-500 border-b border-white/[0.05]">
                <AtSign className="w-3 h-3" /> Mentions
            </div>
            {filtered.map((user, idx) => (
                <button
                    key={user.id}
                    onClick={() => onPick(user)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 cursor-pointer text-left border-none ${
                        idx === activeIdx ? 'bg-violet-500/[0.15]' : 'bg-transparent hover:bg-white/5'
                    }`}
                >
                    {user.avatarUrl ? (
                        <div className="w-6 h-6 rounded-full bg-center bg-cover" style={{ backgroundImage: `url(${user.avatarUrl})` }} />
                    ) : (
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-[10px] font-bold text-white">
                            {(user.nickname || user.username).charAt(0).toUpperCase()}
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-zinc-200 truncate">{user.nickname || user.username}</div>
                        {user.nickname && <div className="text-[10px] text-zinc-500 truncate">@{user.username}</div>}
                    </div>
                </button>
            ))}
        </div>
    )
}
