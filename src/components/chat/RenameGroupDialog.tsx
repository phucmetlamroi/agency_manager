'use client'

import { useState, useEffect } from 'react'
import { X, Pencil, Loader2 } from 'lucide-react'
import { renameConversation } from '@/actions/chat-actions'
import { toast } from 'sonner'

interface RenameGroupDialogProps {
    isOpen: boolean
    onClose: () => void
    conversationId: string
    currentName: string
    onRenamed: (newName: string) => void
}

const MAX_LEN = 60

export function RenameGroupDialog({ isOpen, onClose, conversationId, currentName, onRenamed }: RenameGroupDialogProps) {
    const [name, setName] = useState(currentName)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (isOpen) setName(currentName)
    }, [isOpen, currentName])

    const handleSave = async () => {
        const trimmed = name.trim()
        if (!trimmed) {
            toast.error('Name cannot be empty')
            return
        }
        if (trimmed === currentName) {
            onClose()
            return
        }
        setSaving(true)
        const res = await renameConversation(conversationId, trimmed)
        setSaving(false)
        if (res.error) {
            toast.error(res.error)
            return
        }
        toast.success('Group renamed')
        onRenamed(trimmed)
        onClose()
    }

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) onClose() }}
        >
            <div className="w-[400px] bg-zinc-900/95 backdrop-blur-2xl rounded-2xl border border-white/[0.08] shadow-[0_24px_60px_rgba(0,0,0,0.5)] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-violet-500/10">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
                            <Pencil className="w-3.5 h-3.5 text-violet-400" />
                        </div>
                        <h3 className="text-[15px] font-bold text-white m-0">Rename Group</h3>
                    </div>
                    <button onClick={onClose} className="bg-transparent border-none cursor-pointer p-1 rounded-md hover:bg-white/10 transition-colors">
                        <X className="w-[18px] h-[18px] text-zinc-500" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-[18px] py-4 space-y-2">
                    <label className="text-[12px] text-zinc-400 font-medium">Group name</label>
                    <input
                        value={name}
                        onChange={e => setName(e.target.value.slice(0, MAX_LEN))}
                        onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                        placeholder="Enter group name..."
                        className="w-full bg-zinc-950 border border-zinc-700/50 focus:border-violet-500/50 rounded-xl px-3 py-2.5 text-[13px] text-zinc-200 outline-none transition-colors placeholder:text-zinc-600"
                        maxLength={MAX_LEN}
                        autoFocus
                    />
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] text-zinc-600">Max {MAX_LEN} characters</span>
                        <span className="text-[10px] text-zinc-500">{name.length}/{MAX_LEN}</span>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 px-[18px] py-3 border-t border-white/[0.05]">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="px-3 py-1.5 rounded-lg bg-white/5 text-zinc-400 text-[12px] font-semibold cursor-pointer hover:bg-white/10 transition-colors border-none disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !name.trim()}
                        className="px-4 py-1.5 rounded-lg bg-violet-500 text-white text-[12px] font-bold cursor-pointer hover:bg-violet-600 transition-colors border-none disabled:opacity-50 flex items-center gap-1.5"
                    >
                        {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                        Save
                    </button>
                </div>
            </div>
        </div>
    )
}
