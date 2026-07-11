import { headers } from 'next/headers'

export type DeviceType = 'mobile' | 'desktop'

/**
 * [Mobile P1 §2.3] Đọc device type do middleware set (header `x-device-type`).
 * Middleware đã gộp cookie `view-mode` + userAgent() thành 1 NGUỒN CHÂN LÝ —
 * KHÔNG đọc lại cookie/UA ở đây để không tái sinh detect lệch pha (bug cũ:
 * layout desktop bọc content mobile). Fallback 'desktop' khi header vắng
 * (route không qua middleware matcher). `headers()` là Dynamic API — không gọi
 * từ trang public/landing/portal.
 */
export async function getDeviceType(): Promise<DeviceType> {
    const h = await headers()
    return h.get('x-device-type') === 'mobile' ? 'mobile' : 'desktop'
}

/** Giữ nguyên chữ ký cũ — mọi call-site hiện có (admin/page.tsx, admin/queue/page.tsx…) không phải đổi. */
export async function isMobileDevice(): Promise<boolean> {
    return (await getDeviceType()) === 'mobile'
}
