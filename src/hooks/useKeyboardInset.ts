'use client'

import { useEffect, useState } from 'react'

/**
 * [Mobile §6.4] Theo dõi `visualViewport` để biết bàn phím ảo (iOS/Android) đang che
 * bao nhiêu px + có đang mở không. Dùng để: ẩn BottomNav khi gõ, ghim composer trên
 * bàn phím. Self-contained — không cần CSS var/global provider.
 */
export function useKeyboardInset(): { inset: number; open: boolean } {
    const [inset, setInset] = useState(0)

    useEffect(() => {
        const vv = window.visualViewport
        if (!vv) return
        const update = () => {
            // Phần layout viewport bị visual viewport (đã trừ bàn phím) che ở đáy.
            const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
            setInset(kb)
        }
        update()
        vv.addEventListener('resize', update)
        vv.addEventListener('scroll', update)
        return () => {
            vv.removeEventListener('resize', update)
            vv.removeEventListener('scroll', update)
        }
    }, [])

    // Ngưỡng 80px: URL bar co/giãn (~40-60px) KHÔNG tính là mở bàn phím.
    return { inset, open: inset > 80 }
}
