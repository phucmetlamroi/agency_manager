'use client'

import { useEffect } from 'react'

/**
 * [Mobile §4.5] Back gesture / nút Back của trình duyệt ĐÓNG overlay (state) thay vì
 * rời trang. Khi `open` → push 1 history entry; `popstate` (Back) → gọi `onClose`.
 * Khi đóng chủ động (nút X / tap scrim → open=false → unmount effect) mà entry còn →
 * `history.back()` dọn nó đi (không để lại rác trong back-stack).
 */
export function useHistoryBackClose(open: boolean, onClose: () => void) {
    useEffect(() => {
        if (!open) return
        window.history.pushState({ __overlay: true }, '')
        const onPop = () => onClose()
        window.addEventListener('popstate', onPop)
        return () => {
            window.removeEventListener('popstate', onPop)
            if (window.history.state?.__overlay) window.history.back()
        }
    }, [open, onClose])
}
