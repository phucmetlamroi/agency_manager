'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { ChatWindow } from '@/components/chat/ChatWindow'
import { NewChatDialog } from '@/components/chat/NewChatDialog'
import { MessageSquare } from 'lucide-react'

export default function UserChatPage() {
    const params = useParams()
    const workspaceId = params.workspaceId as string
    const [selected, setSelected] = useState<{ id: string; name: string } | null>(null)
    const [showNewChat, setShowNewChat] = useState(false)

    return (
        <div className="flex bg-zinc-950 h-[calc(100vh-64px)] -m-4 -mb-24 md:!-m-8 md:!-mb-24 md:!h-screen">
            {/* Desktop sidebar */}
            <div className="hidden md:flex flex-col flex-shrink-0 w-80 border-r border-violet-500/10">
                <ChatSidebar
                    onSelectConversation={(id, name) => setSelected({ id, name })}
                    onNewChat={() => setShowNewChat(true)}
                    selectedId={selected?.id ?? null}
                />
            </div>

            {/* Mobile: full-width sidebar or chat */}
            <div className="md:hidden flex-1 flex flex-col">
                {selected ? (
                    <>
                        <button
                            onClick={() => setSelected(null)}
                            className="px-3.5 py-2.5 bg-zinc-950 border-none border-b border-violet-500/10 cursor-pointer text-left text-violet-500 text-[13px] font-semibold"
                        >
                            &larr; Back
                        </button>
                        <div className="flex-1">
                            <ChatWindow conversationId={selected.id} conversationName={selected.name} />
                        </div>
                    </>
                ) : (
                    <ChatSidebar
                        onSelectConversation={(id, name) => setSelected({ id, name })}
                        onNewChat={() => setShowNewChat(true)}
                        selectedId={null}
                    />
                )}
            </div>

            {/* Desktop: chat window or empty state */}
            <div className="hidden md:flex flex-1 flex-col">
                {selected ? (
                    <ChatWindow conversationId={selected.id} conversationName={selected.name} />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-zinc-700">
                        <div className="w-16 h-16 rounded-full bg-violet-500/[0.08] flex items-center justify-center">
                            <MessageSquare className="w-7 h-7 text-zinc-600" />
                        </div>
                        <p className="text-sm font-semibold">Select a conversation</p>
                        <p className="text-xs">Or start a new conversation</p>
                    </div>
                )}
            </div>

            <NewChatDialog
                isOpen={showNewChat}
                onClose={() => setShowNewChat(false)}
                onConversationCreated={(id, name) => {
                    setSelected({ id, name })
                    setShowNewChat(false)
                }}
                workspaceId={workspaceId}
            />
        </div>
    )
}
