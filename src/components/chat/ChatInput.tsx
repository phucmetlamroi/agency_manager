'use client'

import { useState, useRef, useCallback } from 'react'
import { Send, Paperclip, X, SmilePlus, Eye } from 'lucide-react'
import type { ChatMessage } from '@/hooks/useChatMessages'
import { ACCEPT_ATTRIBUTE, validateChatFile, MAX_BYTES } from '@/lib/chat-file-types'
import { toast } from 'sonner'

const EMOJI_LIST = ['😀', '😂', '🥰', '😎', '🤔', '😢', '😡', '🤯', '🥳', '😴', '👍', '👎', '❤️', '🔥', '💯', '✅', '🎉', '⭐', '💪', '🙏']

interface ChatInputProps {
    onSend: (content: string, replyToId?: string) => void
    onFileUpload: (file: File, viewOnce?: boolean) => void
    replyTo: ChatMessage | null
    onCancelReply: () => void
    disabled?: boolean
}

export function ChatInput({ onSend, onFileUpload, replyTo, onCancelReply, disabled }: ChatInputProps) {
    const [text, setText] = useState('')
    const [showEmoji, setShowEmoji] = useState(false)
    const [viewOnceMode, setViewOnceMode] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const fileRef = useRef<HTMLInputElement>(null)

    const handleSend = useCallback(() => {
        const trimmed = text.trim()
        if (!trimmed || disabled) return
        onSend(trimmed, replyTo?.id)
        setText('')
        onCancelReply()
        if (textareaRef.current) textareaRef.current.style.height = '38px'
    }, [text, replyTo, onSend, onCancelReply, disabled])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setText(e.target.value)
        const el = e.target
        el.style.height = '38px'
        el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            // Client-side validation (mirrors server-side rules) for fast feedback.
            const validation = validateChatFile({ name: file.name, type: file.type, size: file.size })
            if (!validation.ok) {
                toast.error(validation.error || 'File rejected')
                e.target.value = ''
                return
            }
            onFileUpload(file, viewOnceMode)
            // Reset view-once after each upload
            setViewOnceMode(false)
        }
        e.target.value = ''
    }

    return (
        <div className="border-t border-violet-500/10 bg-zinc-950">
            {/* Reply preview */}
            {replyTo && (
                <div className="flex items-center gap-2 px-3.5 py-1.5 bg-violet-500/[0.06] border-b border-violet-500/10">
                    <div className="w-[3px] h-6 rounded-sm bg-violet-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-violet-500 font-semibold">
                            {replyTo.sender.nickname || replyTo.sender.username}
                        </div>
                        <div className="text-xs text-zinc-500 overflow-hidden text-ellipsis whitespace-nowrap">
                            {replyTo.content?.slice(0, 80)}
                        </div>
                    </div>
                    <button onClick={onCancelReply} className="bg-transparent border-none cursor-pointer p-0.5">
                        <X className="w-3.5 h-3.5 text-zinc-600" />
                    </button>
                </div>
            )}

            {/* View-once banner */}
            {viewOnceMode && (
                <div className="flex items-center gap-2 px-3.5 py-1.5 bg-violet-500/15 border-b border-violet-500/20">
                    <Eye className="w-3 h-3 text-violet-300" />
                    <div className="flex-1 text-[11px] text-violet-300 font-semibold">
                        View-once mode: next file you send will only be viewable once
                    </div>
                    <button onClick={() => setViewOnceMode(false)} className="bg-transparent border-none cursor-pointer p-0.5">
                        <X className="w-3.5 h-3.5 text-violet-300" />
                    </button>
                </div>
            )}

            {/* Input row */}
            <div className="flex items-end gap-1.5 p-2.5 px-2.5">
                {/* File attach */}
                <button
                    onClick={() => fileRef.current?.click()}
                    className="w-[34px] h-[34px] rounded-full border-none cursor-pointer bg-white/[0.06] flex items-center justify-center shrink-0 hover:bg-white/10 transition-colors"
                    title={`Attach file (max ${(MAX_BYTES / (1024 * 1024)).toFixed(0)} MB)`}
                >
                    <Paperclip className="w-4 h-4 text-zinc-400" />
                </button>
                <input ref={fileRef} type="file" hidden onChange={handleFile} accept={ACCEPT_ATTRIBUTE} />

                {/* View-once toggle */}
                <button
                    onClick={() => setViewOnceMode(v => !v)}
                    className={`w-[34px] h-[34px] rounded-full border-none cursor-pointer flex items-center justify-center shrink-0 transition-colors ${
                        viewOnceMode ? 'bg-violet-500/30 text-violet-300' : 'bg-white/[0.06] text-zinc-400 hover:bg-white/10'
                    }`}
                    title="View-once: next file is only viewable once"
                >
                    <Eye className="w-4 h-4" />
                </button>

                {/* Emoji picker */}
                <div className="relative shrink-0">
                    <button
                        onClick={() => setShowEmoji(!showEmoji)}
                        className={`w-[34px] h-[34px] rounded-full border-none cursor-pointer flex items-center justify-center hover:bg-white/10 transition-colors ${
                            showEmoji ? 'bg-violet-500/20' : 'bg-white/[0.06]'
                        }`}
                    >
                        <SmilePlus className={`w-4 h-4 ${showEmoji ? 'text-violet-500' : 'text-zinc-400'}`} />
                    </button>

                    {showEmoji && (
                        <div className="absolute bottom-[42px] left-0 bg-zinc-900 border border-violet-500/20 rounded-xl p-2 grid grid-cols-5 gap-1 z-50 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                            {EMOJI_LIST.map(e => (
                                <button
                                    key={e}
                                    onClick={() => { setText(prev => prev + e); setShowEmoji(false); textareaRef.current?.focus() }}
                                    className="text-lg cursor-pointer bg-transparent border-none p-1 rounded-md hover:bg-white/10 transition-colors"
                                >
                                    {e}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Textarea -- height is dynamic via JS, so we keep inline style for height/maxHeight */}
                <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    disabled={disabled}
                    rows={1}
                    className="flex-1 resize-none py-2 px-3.5 bg-white/5 border border-violet-500/15 rounded-[20px] text-zinc-200 text-[13px] leading-normal outline-none font-[inherit] placeholder:text-zinc-600"
                    style={{ height: 38, maxHeight: 120 }}
                />

                {/* Send button */}
                <button
                    onClick={handleSend}
                    disabled={!text.trim() || disabled}
                    className={`w-[34px] h-[34px] rounded-full border-none flex items-center justify-center shrink-0 transition-all duration-200 ${
                        text.trim()
                            ? 'cursor-pointer bg-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.4)]'
                            : 'cursor-default bg-white/[0.06]'
                    }`}
                >
                    <Send className={`w-[15px] h-[15px] ${text.trim() ? 'text-white' : 'text-zinc-600'}`} />
                </button>
            </div>

            {/* File size hint */}
            <div className="text-[10px] text-zinc-600 text-center pb-1.5">
                Max 100 MB · video, image, audio, docs
            </div>
        </div>
    )
}
