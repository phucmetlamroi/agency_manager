'use client'

// [Bảo trì 31/10→01/11/2026] Dải thông báo bảo trì ghim trên cùng viewport, cho cả admin lẫn editor
// (gắn ở [workspaceId]/layout nên phủ mọi trang trong workspace). Presentational only.
// Gated bởi src/lib/maintenance-notice.ts — layout chỉ mount khi còn hạn; ở đây thêm hẹn giờ để
// người đang mở sẵn tab cũng thấy banner tự tắt đúng 3:00 sáng.
import { useEffect, useRef, useState } from 'react'
import { Wrench } from 'lucide-react'
import { MAINTENANCE_NOTICE_END, isMaintenanceNoticeActive } from '@/lib/maintenance-notice'

// Chiều cao một dòng trên desktop — dùng làm giá trị khởi tạo cho spacer trước khi đo được.
const FALLBACK_BAR_HEIGHT = 36
const BANNER_HEIGHT_VAR = '--maint-banner-h'

export default function MaintenanceBanner() {
    const [visible, setVisible] = useState(true)
    const [barHeight, setBarHeight] = useState(FALLBACK_BAR_HEIGHT)
    const barRef = useRef<HTMLDivElement>(null)

    // Hẹn giờ tự ẩn đúng mốc kết thúc (setTimeout tối đa ~24 ngày — dư cho thời hạn 1 ngày này).
    useEffect(() => {
        const msLeft = Date.parse(MAINTENANCE_NOTICE_END) - Date.now()
        if (msLeft <= 0) { setVisible(false); return }
        const t = setTimeout(() => setVisible(isMaintenanceNoticeActive()), Math.min(msLeft, 2_000_000_000))
        return () => clearTimeout(t)
    }, [])

    // Banner fixed bị nhấc khỏi luồng: đo chiều cao → (1) spacer giữ nội dung không bị che,
    // (2) đặt biến CSS để sidebar cố định / header mobile dịch xuống dưới banner thay vì chui dưới nó.
    useEffect(() => {
        if (!visible) return
        const el = barRef.current
        if (!el) return
        const root = document.documentElement
        const update = () => {
            const h = el.offsetHeight
            setBarHeight(h)
            root.style.setProperty(BANNER_HEIGHT_VAR, `${h}px`)
        }
        update()
        const ro = new ResizeObserver(update)
        ro.observe(el)
        return () => {
            ro.disconnect()
            root.style.removeProperty(BANNER_HEIGHT_VAR)
        }
    }, [visible])

    if (!visible) return null

    return (
        <>
            <div
                ref={barRef}
                role="status"
                aria-live="polite"
                className="fixed inset-x-0 top-0 z-[60] w-full border-b border-amber-600/40 bg-amber-400 text-zinc-950 shadow-md shadow-black/30"
            >
                <div className="mx-auto flex max-w-7xl items-center justify-center gap-2.5 px-4 py-2 text-center">
                    <Wrench size={16} className="shrink-0" aria-hidden />
                    <p className="text-[13.5px] font-medium leading-snug tracking-tight">
                        <span className="font-bold">Bảo trì hệ thống: 22:00 → 3:00 sáng ngày 01/11.</span>{' '}
                        Đây là bản cập nhật lớn, trong thời gian này web sẽ tạm ngưng truy cập. Cảm ơn các bạn đã kiên nhẫn chờ đợi!
                    </p>
                </div>
            </div>

            {/* Spacer giữ chỗ trong luồng = chiều cao banner */}
            <div aria-hidden style={{ height: barHeight }} className="shrink-0" />
        </>
    )
}
