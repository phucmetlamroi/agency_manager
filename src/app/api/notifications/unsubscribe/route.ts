/**
 * One-click unsubscribe endpoint (CAN-SPAM / Gmail bulk-sender compliance).
 *
 * GET /api/notifications/unsubscribe?token=<jwt>
 *
 * The token IS the auth — no session required. Verifies the JWT, sets the
 * user's `emailEnabled` preference to false, and renders an HTML confirmation page.
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyUnsubscribeToken } from '@/lib/notification-emails/shared/unsubscribe'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

function renderPage(opts: {
    ok: boolean
    title: string
    message: string
    settingsUrl?: string
    /** Khi có: render nút xác nhận POST thay vì chỉ thông báo (xem GET bên dưới). */
    confirmToken?: string
}): string {
    const { ok, title, message, settingsUrl, confirmToken } = opts
    const accent = ok ? '#10b981' : '#dc2626'
    const icon = confirmToken ? '✉️' : ok ? '✅' : '⚠️'
    const confirmForm = confirmToken
        ? `<form method="POST" action="/api/notifications/unsubscribe?token=${encodeURIComponent(confirmToken)}" style="margin:0 0 16px 0;">
<button type="submit" style="display:inline-block;padding:12px 24px;background:#dc2626;color:#fff;border:0;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;">Xác nhận tắt email thông báo</button>
</form>`
        : ''
    return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F4F4F4;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#111827;line-height:1.6;min-height:100dvh;display:flex;align-items:center;justify-content:center;">
<div style="background:#fff;max-width:480px;width:90%;margin:32px auto;padding:48px 40px;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.08);text-align:center;">
<div style="font-size:64px;line-height:1;margin-bottom:18px;">${icon}</div>
<h1 style="margin:0 0 12px 0;font-size:24px;font-weight:800;color:${accent};">${title}</h1>
<p style="margin:0 0 24px 0;color:#6b7280;font-size:15px;line-height:1.6;">${message}</p>
${confirmForm}
${settingsUrl ? `<a href="${settingsUrl}" style="display:inline-block;padding:12px 24px;background:#7C3AED;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">⚙️ Quản lý thông báo</a>` : ''}
<div style="margin-top:32px;border-top:1px solid #e5e7eb;padding-top:18px;font-size:11px;color:#9ca3af;">
⚡ HustlyTasker
</div>
</div>
</body>
</html>`
}

export async function GET(request: Request) {
    const url = new URL(request.url)
    const token = url.searchParams.get('token')

    if (!token) {
        return new NextResponse(
            renderPage({
                ok: false,
                title: 'Liên kết không hợp lệ',
                message: 'Liên kết unsubscribe thiếu thông tin xác thực. Vui lòng kiểm tra email hoặc đăng nhập để cài đặt thông báo.',
            }),
            { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        )
    }

    const payload = await verifyUnsubscribeToken(token)
    if (!payload) {
        return new NextResponse(
            renderPage({
                ok: false,
                title: 'Liên kết hết hạn',
                message: 'Liên kết unsubscribe đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập để cài đặt thông báo trực tiếp.',
            }),
            { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        )
    }

    // [AUDIT SWEEP-2026-07-30 fix · NEW-unsub-get-mutates] GET KHÔNG CÒN GHI GÌ.
    //
    // Trước đây chính handler GET này ghi `emailEnabled=false`. Link nằm ở footer MỌI email nội bộ đã
    // bọc, nên KHÔNG CẦN kẻ tấn công: cổng bảo mật thư của tổ chức (Defender Safe Links, Mimecast,
    // Proofpoint) và trình prefetch của client thư đều crawl mọi URL trong thư ⇒ nhân viên im lặng
    // ngừng nhận toàn bộ email thông báo mà không ai bấm gì. Đây là đường CHẮC CHẮN XẢY RA, không
    // phải kịch bản giả định. Ai đọc được URL (thư forward, ảnh chụp màn hình, access log — token
    // nằm trong query string) cũng tắt lại được ngay sau khi nạn nhân bật lên.
    //
    // ⚠️ CỐ Ý KHÔNG redirect sang một trang mới như bản vá được đề xuất: trang
    // `/notifications/unsubscribe` KHÔNG TỒN TẠI (chỉ có `src/app/r/unsubscribe/` cho luồng khách).
    // Redirect sang trang chưa có sẽ làm MỌI link unsubscribe đang nằm trong hộp thư trả 404 — tức
    // phá đúng nghĩa vụ CAN-SPAM / Gmail bulk-sender mà route này sinh ra để đáp ứng.
    // Giữ một file, GET render form, POST ghi. Zero trang mới, zero luồng chết.
    return new NextResponse(
        renderPage({
            ok: true,
            title: 'Tắt email thông báo?',
            message: 'Bấm xác nhận để ngừng nhận email từ HustlyTasker. Bạn vẫn nhận thông báo trong ứng dụng.',
            confirmToken: token,
        }),
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
}

/**
 * [AUDIT SWEEP-2026-07-30 fix] Thao tác GHI nay nằm ở POST — bộ quét thư không POST.
 * Cũng là hình dạng đúng để sau này thêm header `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
 * (Gmail/Yahoo yêu cầu POST cho one-click); `sendEmail` đã có tham số `headers` tuỳ chọn.
 */
export async function POST(request: Request) {
    const url = new URL(request.url)
    const token = url.searchParams.get('token')
    if (!token) {
        return new NextResponse(
            renderPage({
                ok: false,
                title: 'Liên kết không hợp lệ',
                message: 'Liên kết unsubscribe thiếu thông tin xác thực.',
            }),
            { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        )
    }
    const payload = await verifyUnsubscribeToken(token)
    if (!payload) {
        return new NextResponse(
            renderPage({
                ok: false,
                title: 'Liên kết hết hạn',
                message: 'Liên kết unsubscribe đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập để cài đặt thông báo trực tiếp.',
            }),
            { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        )
    }

    try {
        // v1: master toggle only (token.type reserved for future per-type unsub)
        await prisma.notificationPreference.upsert({
            where: { userId: payload.userId },
            create: {
                userId: payload.userId,
                emailEnabled: false,
                emailDigestMode: 'OFF',
            },
            update: {
                emailEnabled: false,
            },
        })

        // Resolve a workspace for the settings link
        const member = await prisma.workspaceMember.findFirst({
            where: { userId: payload.userId },
            select: { workspaceId: true },
            orderBy: { joinedAt: 'asc' },
        }).catch(() => null)
        const settingsUrl = member?.workspaceId
            ? `${APP_URL}/${member.workspaceId}/dashboard/profile`
            : APP_URL

        return new NextResponse(
            renderPage({
                ok: true,
                title: 'Đã tắt email thông báo',
                message: 'Bạn sẽ không nhận email từ HustlyTasker nữa. Bạn vẫn nhận thông báo trong ứng dụng. Có thể bật lại bất cứ lúc nào trong phần Cài đặt thông báo.',
                settingsUrl,
            }),
            { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        )
    } catch (err) {
        console.error('[unsubscribe] error:', err)
        return new NextResponse(
            renderPage({
                ok: false,
                title: 'Có lỗi xảy ra',
                message: 'Không thể cập nhật cài đặt. Vui lòng thử lại sau hoặc đăng nhập để cài đặt trực tiếp.',
            }),
            { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        )
    }
}
