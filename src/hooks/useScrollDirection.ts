'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * [Mobile P1 §3.5] Header "partially persistent": ẩn khi cuộn XUỐNG quá `threshold`,
 * hiện NGAY khi cuộn LÊN. Chỉ animate transform → không reflow. Trả `hidden` (boolean).
 */
export function useScrollDirection(threshold = 80): boolean {
    const [hidden, setHidden] = useState(false)
    const lastY = useRef(0)

    useEffect(() => {
        lastY.current = window.scrollY
        const onScroll = () => {
            const y = window.scrollY
            // Trên cùng trang → luôn hiện header.
            if (y < threshold) {
                setHidden(false)
                lastY.current = y
                return
            }
            const delta = y - lastY.current
            // Ngưỡng 4px chống rung khi cuộn nhỏ.
            if (delta > 4) setHidden(true)
            else if (delta < -4) setHidden(false)
            lastY.current = y
        }
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [threshold])

    return hidden
}
