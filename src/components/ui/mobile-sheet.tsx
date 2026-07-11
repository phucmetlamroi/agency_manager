'use client'

// [Mobile P2 — Pattern 6] MobileSheet — wrapper bottom-sheet vaul chuẩn, tái sử dụng.
// Gói vaul về một chỗ (repo vaul unmaintained) để mọi sheet đi chung 1 hành vi:
// glass-3 + z-sheet + safe-area-bottom + drag handle. Đóng bằng ≥2 cách: kéo xuống
// (vaul) · tap scrim · nút X 44px · Back gesture (useHistoryBackClose §4.5).
// Đây là component NỀN — P4 sẽ adopt; ở P2 chưa wire vào consumer nào.
import { Drawer } from 'vaul'
import { useCallback } from 'react'
import { X } from 'lucide-react'
import { useHistoryBackClose } from '@/hooks/useHistoryBackClose'
import { cn } from '@/lib/utils'

interface MobileSheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    title?: string
    children: React.ReactNode
    className?: string
}

export function MobileSheet({ open, onOpenChange, title, children, className }: MobileSheetProps) {
    // Đóng bằng UI (nút X / tap scrim / kéo xuống) → onOpenChange(false); cleanup của
    // useHistoryBackClose tự dọn history entry đã push, nên back gesture không bị double-fire.
    const close = useCallback(() => onOpenChange(false), [onOpenChange])
    useHistoryBackClose(open, close)

    return (
        <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
            <Drawer.Portal>
                {/* Backdrop luôn tồn tại — không overlay trong suốt lộ chữ nền (FR-G3.2) */}
                <Drawer.Overlay className="fixed inset-0 z-sheet bg-black/60 backdrop-blur-sm" />
                <Drawer.Content
                    aria-describedby={undefined}
                    className={cn(
                        'fixed inset-x-0 bottom-0 z-sheet flex max-h-[85svh] flex-col rounded-t-[20px] glass-3 border-t border-white/10 pb-[calc(1rem+env(safe-area-inset-bottom))] outline-none',
                        className,
                    )}
                >
                    {/* Drag handle */}
                    <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-zinc-700" />

                    <div className="flex items-center gap-2 px-4 pb-2 pt-3">
                        {/* Radix a11y yêu cầu Drawer.Title — ẩn (sr-only) khi không truyền title */}
                        <Drawer.Title
                            className={cn(
                                'min-w-0 flex-1 truncate text-base font-semibold text-zinc-100',
                                !title && 'sr-only',
                            )}
                        >
                            {title ?? 'Bảng thao tác'}
                        </Drawer.Title>
                        {/* Cách đóng thứ 2 ngoài swipe/scrim/back — nút X 44px (touch target) */}
                        <button
                            type="button"
                            aria-label="Đóng"
                            onClick={close}
                            className="ml-auto grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 active:bg-white/10"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Nội dung cuộn — chặn scroll chaining ra body */}
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2">
                        {children}
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    )
}
