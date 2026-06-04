'use client'

import dynamic from 'next/dynamic'
import data from '@emoji-mart/data'

// emoji-mart is heavy → load it only when a picker actually opens (keeps it out of the
// main chat bundle, mirroring the LiveKit lazy-load).
const Picker = dynamic(() => import('@emoji-mart/react'), {
    ssr: false,
    loading: () => (
        <div className="w-[352px] h-[260px] grid place-items-center rounded-xl border border-white/10 bg-zinc-900 text-xs text-zinc-500">
            Đang tải…
        </div>
    ),
})

/**
 * [Chat] Full emoji picker (emoji-mart) rendered as a popover. The caller places this
 * inside a `relative` container; the full-screen backdrop catches outside clicks.
 */
export default function EmojiPicker({
    onPick,
    onClose,
    align = 'left',
}: {
    onPick: (native: string) => void
    onClose: () => void
    align?: 'left' | 'right'
}) {
    return (
        <>
            <div className="fixed inset-0 z-40" onClick={onClose} />
            <div
                className={`absolute bottom-full mb-2 z-50 ${align === 'right' ? 'right-0' : 'left-0'}`}
                onClick={(e) => e.stopPropagation()}
            >
                <Picker
                    data={data}
                    theme="dark"
                    previewPosition="none"
                    skinTonePosition="none"
                    onEmojiSelect={(e: { native: string }) => {
                        onPick(e.native)
                        onClose()
                    }}
                />
            </div>
        </>
    )
}
