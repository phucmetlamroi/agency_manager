'use client'

import { useState, useEffect } from 'react'
import { MessageSquare, X, Minus } from 'lucide-react'
import { useChatContext } from './ChatProvider'
import { ChatSidebar } from './ChatSidebar'
import { ChatWindow } from './ChatWindow'
import { NewChatDialog } from './NewChatDialog'

interface ChatFloatingPanelProps {
    workspaceId: string
    profileId?: string
}

export function ChatFloatingPanel({ workspaceId, profileId }: ChatFloatingPanelProps) {
    const { isPanelOpen, setIsPanelOpen, unreadTotal, pendingConversationId, pendingConversationName, clearPendingConversation } = useChatContext()
    const [selectedConversation, setSelectedConversation] = useState<{ id: string; name: string } | null>(null)
    const [showNewChat, setShowNewChat] = useState(false)
    const [minimized, setMinimized] = useState(false)

    useEffect(() => {
        if (!isPanelOpen) {
            setMinimized(false)
        }
    }, [isPanelOpen])

    useEffect(() => {
        if (pendingConversationId && isPanelOpen) {
            setSelectedConversation({ id: pendingConversationId, name: pendingConversationName || 'Chat' })
            setMinimized(false)
            clearPendingConversation()
        }
    }, [pendingConversationId, pendingConversationName, isPanelOpen, clearPendingConversation])

    if (!isPanelOpen) {
        return (
            <button
                onClick={() => setIsPanelOpen(true)}
                className="fixed bottom-6 right-6 w-[52px] h-[52px] rounded-full bg-violet-500 border-none cursor-pointer flex items-center justify-center shadow-[0_4px_24px_rgba(139,92,246,0.4),0_0_0_4px_rgba(139,92,246,0.10)] z-[90] transition-[transform,box-shadow] duration-200 hover:scale-110 active:scale-95"
            >
                <MessageSquare className="w-[22px] h-[22px] text-white" />
                {unreadTotal > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full px-1.5 bg-red-500 text-white text-[11px] font-bold flex items-center justify-center border-2 border-zinc-950">
                        {unreadTotal > 99 ? '99+' : unreadTotal}
                    </span>
                )}
            </button>
        )
    }

    return (
        <>
            <div
                className={`fixed bottom-6 right-6 w-[400px] max-h-[calc(100vh-48px)] bg-zinc-950/95 backdrop-blur-xl border border-violet-500/20 shadow-[0_24px_60px_rgba(0,0,0,0.6),0_0_0_1px_rgba(139,92,246,0.08)] z-[91] flex flex-col overflow-hidden transition-[height,border-radius] duration-200 ease-out ${minimized ? 'h-12 rounded-[14px]' : 'h-[600px] rounded-2xl'}`}
            >
                <div
                    className={`flex items-center justify-between px-3.5 h-12 shrink-0 bg-violet-500/[0.06] cursor-pointer ${minimized ? '' : 'border-b border-violet-500/10'}`}
                    onClick={() => minimized && setMinimized(false)}
                >
                    <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-violet-500" />
                        <span className="text-[13px] font-bold text-white">
                            {selectedConversation ? selectedConversation.name : 'Chat'}
                        </span>
                        {unreadTotal > 0 && (
                            <span className="min-w-[18px] h-[18px] rounded-full px-[5px] bg-violet-500 text-white text-[10px] font-bold flex items-center justify-center">
                                {unreadTotal}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-0.5">
                        {selectedConversation && !minimized && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setSelectedConversation(null) }}
                                className="bg-transparent border-none cursor-pointer p-1 rounded-md hover:bg-white/10 transition-colors"
                            >
                                <span className="text-[11px] text-zinc-400 font-semibold">&larr; Back</span>
                            </button>
                        )}
                        <button
                            onClick={(e) => { e.stopPropagation(); setMinimized(!minimized) }}
                            className="bg-transparent border-none cursor-pointer p-1 rounded-md hover:bg-white/10 transition-colors"
                        >
                            <Minus className="w-3.5 h-3.5 text-zinc-500" />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsPanelOpen(false); setSelectedConversation(null) }}
                            className="bg-transparent border-none cursor-pointer p-1 rounded-md hover:bg-white/10 transition-colors"
                        >
                            <X className="w-3.5 h-3.5 text-zinc-500" />
                        </button>
                    </div>
                </div>

                {!minimized && (
                    <div className="flex-1 overflow-hidden">
                        {selectedConversation ? (
                            <ChatWindow
                                conversationId={selectedConversation.id}
                                conversationName={selectedConversation.name}
                            />
                        ) : (
                            <ChatSidebar
                                onSelectConversation={(id, name) => setSelectedConversation({ id, name })}
                                onNewChat={() => setShowNewChat(true)}
                                selectedId={selectedConversation ? (selectedConversation as any).id : null}
                            />
                        )}
                    </div>
                )}
            </div>

            <NewChatDialog
                isOpen={showNewChat}
                onClose={() => setShowNewChat(false)}
                onConversationCreated={(id, name) => {
                    setSelectedConversation({ id, name })
                    setShowNewChat(false)
                }}
                workspaceId={workspaceId}
                profileId={profileId}
            />
        </>
    )
}
