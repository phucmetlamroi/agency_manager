// [Review module P4.5] Lightweight emoji picker for the comment composer (PRD FR-E07).
// A curated set (no external emoji dependency) grouped into a few rows; clicking one
// inserts it at the textarea caret. Kept intentionally small — this is for garnishing a
// comment body, not a full unicode browser.

'use client'

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
    {
        label: 'Hay dùng',
        emojis: ['👍', '👎', '❤️', '🎉', '🔥', '👀', '🙏', '👏', '💯', '✅', '❌', '⭐'],
    },
    {
        label: 'Cảm xúc',
        emojis: ['😀', '😂', '🙂', '😍', '😎', '🤔', '😅', '😉', '😭', '😤', '😱', '🥳'],
    },
    {
        label: 'Ký hiệu',
        emojis: ['💡', '⚠️', '🚀', '🎬', '🎥', '✂️', '🎯', '📌', '⏱️', '🔊', '🔇', '✏️'],
    },
]

export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
    return (
        <>
            <div className="fixed inset-0 z-10" onClick={onClose} />
            <div className="absolute bottom-10 right-0 z-20 w-60 rounded-xl border border-white/10 bg-zinc-900/95 p-2 shadow-2xl backdrop-blur">
                {EMOJI_GROUPS.map((g) => (
                    <div key={g.label} className="mb-1.5 last:mb-0">
                        <div className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wide text-white/35">{g.label}</div>
                        <div className="grid grid-cols-6 gap-0.5">
                            {g.emojis.map((e) => (
                                <button
                                    key={e}
                                    type="button"
                                    onClick={() => onPick(e)}
                                    className="grid h-8 w-8 place-items-center rounded-lg text-lg hover:bg-white/10"
                                >
                                    {e}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </>
    )
}
