
import { escapeHtml, formatVietnamDateTime } from '@/lib/notification-emails/shared/format'

// Helper to format currency
const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
}

// [AUDIT HT-035] Only allow http(s) links in emails and escape them for safe attribute embedding,
// so a crafted productLink cannot break out of the href and inject markup. Returns '' if not http(s).
const safeEmailUrl = (raw: string | null | undefined): string => {
    const s = (raw || '').trim()
    return /^https?:\/\//i.test(s) ? escapeHtml(s) : ''
}

// Base Template Wrapper — HustlyTasker branded shell (operational/admin emails)
// User-facing notifications use src/lib/notification-emails/ instead.
//
// [AUDIT HT-035 fix] `title` được escape NGAY TẠI ĐÂY, không giao cho từng nơi gọi.
// Mọi template đều nhét tiêu đề task / tên người vào tham số này rồi nó chảy thẳng vào <h1>, nên
// đây là điểm nghẽn: bịt một chỗ là phủ cả 9 template hiện có lẫn template viết sau. Bắt từng nơi
// gọi tự nhớ escape chính là cách lỗ hổng này sinh ra — 1 trong 9 template nhớ, 8 cái quên.
// ⚠️ `content` thì KHÔNG escape: nó đã là HTML do chính ta dựng. Trách nhiệm escape biến trong
// thân email nằm ở từng template, ngay chỗ nội suy.
const wrapTemplate = (content: string, title: string) => `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>HustlyTasker</title>
</head>
<body style="margin:0;padding:0;background:#F4F4F4;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#111827;line-height:1.6;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F4F4F4;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#6D28D9,#7C3AED);padding:24px 32px;">
<div style="display:inline-block;background:rgba(255,255,255,0.18);border-radius:10px;padding:8px 14px;">
<span style="font-size:18px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">⚡ HustlyTasker</span>
</div>
<h1 style="margin:14px 0 0 0;font-size:20px;font-weight:700;color:#ffffff;line-height:1.4;">${escapeHtml(title)}</h1>
</td></tr>
<tr><td style="padding:32px 32px 28px 32px;">${content}</td></tr>
<tr><td style="padding:0 32px 28px 32px;">
<div style="border-top:1px solid #e5e7eb;padding-top:16px;font-size:11px;color:#9ca3af;text-align:center;">
© ${new Date().getFullYear()} HustlyTasker. All rights reserved.
</div>
</td></tr>
</table>
</td></tr>
</table>
<style>
.btn{display:inline-block;padding:12px 24px;background:#7C3AED;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;border:2px solid #7C3AED;}
.highlight{font-weight:700;color:#7C3AED;}
.card{background:#fafafa;padding:16px 18px;border-radius:8px;margin:14px 0;border-left:4px solid #7C3AED;}
</style>
</body>
</html>`

export const emailTemplates = {
    // 1. Task Assigned (To User)
    taskAssigned: (userName: string, taskTitle: string, deadline: Date | null, taskId: string) => {
        // [video-fix ①] toLocaleString('vi-VN') without a timeZone renders in the SERVER zone
        // (UTC on Vercel) → shows +7h off. formatVietnamDateTime pins Asia/Ho_Chi_Minh.
        const deadlineStr = deadline ? formatVietnamDateTime(deadline) : 'Không có hạn chót'
        const link = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard`
        // [AUDIT HT-035 fix] Tiêu đề task do editor tự đặt → escape trước khi nhúng vào HTML email.
        const safeUser = escapeHtml(userName)
        const safeTitle = escapeHtml(taskTitle)
        // Scenario 1
        const content = `
            <p>Chào <strong>${safeUser}</strong>,</p>
            <p>Admin vừa giao cho bạn một task mới trong dự án.</p>

            <div class="card">
                <p><strong>Nhiệm vụ:</strong> ${safeTitle}</p>
                <p><strong>Deadline:</strong> ${deadlineStr}</p>
            </div>

            <p>Vui lòng truy cập hệ thống để xem chi tiết và bấm "Start" khi bắt đầu làm việc.</p>
            
            <div style="text-align: center;">
                <a href="${link}" class="btn">NHẬN VIỆC NGAY</a>
            </div>
        `
        return wrapTemplate(content, `[New Task] Bạn được giao nhiệm vụ mới: ${taskTitle}`)
    },

    // 2. Task Started (To Admin who assigned the task)
    // [Sprint P] Spec yêu cầu format mới:
    //   Title: "[HustlyTasker] {Tên user} đã bắt đầu task"
    //   Body: "{Tên user} đã bắt đầu thực hiện task {Tên task} của khách hàng
    //          {Tên khách hàng} vào lúc {thời gian}."
    // Signature changed: (userName, taskTitle, clientName, startTime).
    // Recipient: ONLY admin who created/assigned the task (task.assignedBy.email).
    // User KHÔNG nhận email này (bug cũ — task-actions.ts:164 hardcode env).
    taskStarted: (userName: string, taskTitle: string, clientName: string, startTime: Date) => {
        // [video-fix ①] Render the start time in Vietnam time, not the server's UTC zone.
        const timeStr = formatVietnamDateTime(startTime)
        const link = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin`
        // [AUDIT HT-035 fix] escape mọi giá trị do người dùng kiểm soát.
        const safeUser = escapeHtml(userName)
        const safeTitle = escapeHtml(taskTitle)
        const safeClient = escapeHtml(clientName)

        const content = `
            <p>Xin chào,</p>
            <p><strong>${safeUser}</strong> đã bắt đầu thực hiện task <strong>${safeTitle}</strong> của khách hàng <strong>${safeClient}</strong> vào lúc ${timeStr}.</p>

            <div class="card">
                <p><strong>Nhân viên:</strong> ${safeUser}</p>
                <p><strong>Task:</strong> ${safeTitle}</p>
                <p><strong>Khách hàng:</strong> ${safeClient}</p>
                <p><strong>Thời gian bắt đầu:</strong> ${timeStr}</p>
            </div>

            <div style="text-align: center;">
                <a href="${link}" class="btn">VÀO HỆ THỐNG XEM CHI TIẾT</a>
            </div>
        `
        return wrapTemplate(content, `[HustlyTasker] ${userName} đã bắt đầu task`)
    },

    // 3. Task Delivered (To Admin who assigned the task)
    // [Sprint P] User submitted productLink — task moved Đang thực hiện → Revision,
    // deadline cleared. Admin được thông báo để review.
    //   Title: "[HustlyTasker] {Tên user} đã nộp video cho task"
    //   Body: "{Tên user} vừa nộp video cho task {Tên task} của khách hàng
    //          {Tên khách hàng}. Link delivery: {link}. Vui lòng vào hệ thống để review."
    // Recipient: ONLY admin assignedBy. User KHÔNG nhận.
    taskDelivered: (userName: string, taskTitle: string, clientName: string, productLink: string) => {
        const link = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin`
        // [AUDIT HT-035 fix] Escape every user-controlled value before embedding in the email HTML,
        // and only emit productLink as an href when it is a real http(s) URL (escaped). A crafted
        // value like `http://x">…<img src=…>` would otherwise break out of the attribute + inject.
        const safeUser = escapeHtml(userName)
        const safeTitle = escapeHtml(taskTitle)
        const safeClient = escapeHtml(clientName)
        const safeLink = safeEmailUrl(productLink)

        const content = `
            <p>Xin chào,</p>
            <p><strong>${safeUser}</strong> vừa nộp video cho task <strong>${safeTitle}</strong> của khách hàng <strong>${safeClient}</strong>.</p>

            <div class="card" style="border-left-color: #f59e0b; background-color: #fffbeb;">
                <p><strong>Nhân viên:</strong> ${safeUser}</p>
                <p><strong>Task:</strong> ${safeTitle}</p>
                <p><strong>Khách hàng:</strong> ${safeClient}</p>
                <p><strong>Link delivery:</strong> ${safeLink
                    ? `<a href="${safeLink}" target="_blank" rel="noopener">${safeLink}</a>`
                    : '(Không có link)'}</p>
            </div>

            <p>Vui lòng vào hệ thống để review.</p>

            <div style="text-align: center;">
                <a href="${link}" class="btn" style="background-color: #f59e0b;">VÀO REVIEW NGAY</a>
            </div>
        `
        // ⚠️ Truyền chuỗi THÔ cho wrapTemplate, không phải `safeUser`: wrapTemplate nay tự escape
        // `title`, nên đưa giá trị đã escape vào sẽ escape HAI LẦN và người nhận thấy `&amp;lt;`.
        return wrapTemplate(content, `[HustlyTasker] ${userName} đã nộp video cho task`)
    },

    // 4. Task Status Bulk Digest — [Sprint Q]
    // Gửi 1 email duy nhất cho mỗi recipient với danh sách N task đã thay đổi
    // status. Tránh spam khi admin bulk-edit nhiều task cùng lúc.
    taskStatusBulkDigest: (
        recipientName: string,
        actorName: string,
        newStatus: string,
        items: Array<{ title: string; clientName: string; oldStatus: string }>,
    ) => {
        const link = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin`
        // [AUDIT HT-035 fix] Mỗi hàng mang tiêu đề task + tên khách do người dùng nhập; email này
        // gửi cho NHIỀU người nhận cùng lúc, nên một task độc hại phát tán tới cả nhóm.
        const safeStatus = escapeHtml(newStatus)
        const rows = items.map((item) => `
            <tr>
                <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px;">
                    <strong style="color: #111827;">${escapeHtml(item.title)}</strong>
                    <div style="color: #6b7280; font-size: 11px; margin-top: 2px;">${escapeHtml(item.clientName)}</div>
                </td>
                <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; white-space: nowrap;">
                    ${escapeHtml(item.oldStatus)} → <strong style="color: #7C3AED;">${safeStatus}</strong>
                </td>
            </tr>
        `).join('')

        const content = `
            <p>Xin chào <strong>${escapeHtml(recipientName)}</strong>,</p>
            <p><strong>${escapeHtml(actorName)}</strong> vừa cập nhật status cho <strong>${items.length} task</strong> sang
            <span class="highlight">${safeStatus}</span>:</p>

            <table style="width: 100%; border-collapse: collapse; margin: 16px 0; background: #fafafa; border-radius: 8px; overflow: hidden;">
                <thead>
                    <tr style="background: #f3f4f6;">
                        <th style="padding: 10px 12px; text-align: left; font-size: 11px; color: #6b7280; text-transform: uppercase;">Task</th>
                        <th style="padding: 10px 12px; text-align: left; font-size: 11px; color: #6b7280; text-transform: uppercase;">Status</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>

            <p style="font-size: 13px; color: #4b5563;">Vui lòng vào hệ thống để review chi tiết.</p>

            <div style="text-align: center;">
                <a href="${link}" class="btn">VÀO HỆ THỐNG REVIEW</a>
            </div>
        `
        return wrapTemplate(content, `[HustlyTasker] ${actorName} cập nhật status ${items.length} task`)
    },

    // [Sprint A removed] taskSubmitted (sent khi → 'Review') — status Review đã bỏ.

    // Admin Feedback (To User)
    taskFeedback: (userName: string, taskTitle: string, feedback: string) => {
        const link = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard`
        // [AUDIT HT-035 fix] feedback là văn bản tự do dài nhất trong mọi email ở đây.
        const content = `
            <p>Chào <strong>${escapeHtml(userName)}</strong>,</p>
            <p>Admin đã xem bài làm của bạn và có một số yêu cầu chỉnh sửa (Feedback).</p>

            <div class="card" style="border-left-color: #f59e0b; background-color: #fffbeb;">
                <p><strong>👉 Lời nhắn từ Admin:</strong></p>
                <p style="font-style: italic;">"${escapeHtml(feedback)}"</p>
            </div>

            <p>Bạn hãy vào xem chi tiết và thực hiện chỉnh sửa sớm nhé.</p>
            
            <div style="text-align: center;">
                <a href="${link}" class="btn" style="background-color: #f59e0b;">XEM FEEDBACK & SỬA BÀI</a>
            </div>
         `
        return wrapTemplate(content, `[Action Required] Admin đã gửi Feedback cho task: ${taskTitle}`)
    },

    // 4. Task Completed / Approved (To User)
    taskCompleted: (userName: string, taskTitle: string, revenue: number) => {
        const link = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard`
        const content = `
            <p>Tuyệt vời! Admin đã nghiệm thu task của bạn.</p>
            
            <div class="card" style="border-left-color: #10b981; background-color: #ecfdf5;">
                <p><strong>Dự án/Task:</strong> ${escapeHtml(taskTitle)}</p>
                <p><strong>Trạng thái:</strong> ✅ Đã hoàn thành</p>
                ${revenue > 0 ? `<p><strong>Ghi nhận doanh thu:</strong> ${formatCurrency(revenue)}</p>` : ''}
            </div>

            <p>Cảm ơn sự đóng góp của bạn. Hãy giữ vững phong độ nhé!</p>
            
            <div style="text-align: center;">
                 <a href="${link}" class="btn" style="background-color: #10b981;">XEM LỊCH SỬ TASK</a>
            </div>
        `
        return wrapTemplate(content, `[Success] Chúc mừng! Task "${taskTitle}" đã hoàn thành 🎉`)
    },
    // 5. Invoice Created (To Admin/Treasurer)
    invoiceCreated: (userName: string, invoiceNumber: string, clientName: string, amount: string, link: string) => {
        // [AUDIT HT-035 fix] `link` ở template này là THAM SỐ do nơi gọi truyền vào (khác các
        // template trên, nơi link được dựng từ biến môi trường) — nên phải qua safeEmailUrl.
        const safeCta = safeEmailUrl(link)
        const content = `
            <p>Xin chào <strong>${escapeHtml(userName)}</strong>,</p>
            <p>Hệ thống xác nhận bạn vừa tạo thành công hóa đơn mới.</p>

            <div class="card" style="border-left-color: #3b82f6; background-color: #eff6ff;">
                <p><strong>Mã hóa đơn:</strong> ${escapeHtml(invoiceNumber)}</p>
                <p><strong>Khách hàng:</strong> ${escapeHtml(clientName)}</p>
                <p><strong>Tổng tiền:</strong> ${escapeHtml(amount)}</p>
            </div>

            <p>Hóa đơn đã được lưu vào hệ thống và gửi yêu cầu thanh toán (nếu có cấu hình tự động).</p>
            ${safeCta ? '<p>Bạn có thể xem chi tiết tại đường dẫn bên dưới:</p>' : ''}

            ${safeCta ? `<div style="text-align: center;">
                 <a href="${safeCta}" class="btn">XEM CHI TIẾT KHÁCH HÀNG</a>
            </div>` : ''}
        `
        return wrapTemplate(content, `[Invoice] Đã tạo hóa đơn mới #${invoiceNumber}`)
    },

    // ─── Notification Email Templates ───────────────────────────────────────

    // 6. Single realtime notification email (for REALTIME digest mode)
    notificationRealtime: (
        userName: string,
        notification: {
            type: string
            title: string
            body: string
            taskId: string | null
        },
        appUrl: string,
    ) => {
        const typeEmoji: Record<string, string> = {
            TASK_DEADLINE_APPROACHING: '⏰',
            TASK_OVERDUE: '🚨',
        }
        const emoji = typeEmoji[notification.type] || '🔔'

        // Build CTA link
        // [AUDIT HT-035 fix] `appUrl` là THAM SỐ do nơi gọi truyền vào, y hệt `link` của
        // invoiceCreated — không phải hằng số dựng từ biến môi trường như các template khác. Nên
        // nó phải qua safeEmailUrl (chỉ http/https, rồi escape) trước khi vào href, và CTA bị bỏ
        // hẳn nếu không đạt. Hai template cuối file này hiện CHƯA CÓ NƠI GỌI NÀO; vá luôn chính
        // vì thế — người đấu dây chúng sau này không có cách nào biết phải tự nhớ escape, mà
        // "mỗi nơi gọi tự nhớ" đúng là cách lỗ hổng HT-035 sinh ra (8/9 template quên).
        const safeAppUrl = safeEmailUrl(`${appUrl}/dashboard`)
        const ctaLabel = notification.taskId ? 'XEM TASK' : 'MỞ AGENCYMANAGER'

        const content = `
            <p>Xin chào <strong>${escapeHtml(userName)}</strong>,</p>
            <p>Bạn có một thông báo mới:</p>

            <div class="card">
                <p><strong>${emoji} ${escapeHtml(notification.title)}</strong></p>
                <p style="color: #4b5563; margin-top: 8px;">${escapeHtml(notification.body)}</p>
            </div>

            ${safeAppUrl ? `
            <div style="text-align: center;">
                <a href="${safeAppUrl}" class="btn">${ctaLabel}</a>
            </div>
            ` : ''}

            <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">
                Bạn nhận email này vì đã bật thông báo qua email.
                Thay đổi tùy chọn trong Settings &gt; Notification Preferences.
            </p>
        `
        return wrapTemplate(content, notification.title)
    },

    // 7. Digest email — batched notifications (for HOURLY / DAILY mode)
    notificationDigest: (
        userName: string,
        notifications: Array<{
            type: string
            title: string
            body: string
            createdAt: string
        }>,
        appUrl: string,
    ) => {
        const typeEmoji: Record<string, string> = {
            TASK_DEADLINE_APPROACHING: '⏰',
            TASK_OVERDUE: '🚨',
        }

        const formatRelativeTime = (iso: string) => {
            const diff = Date.now() - new Date(iso).getTime()
            const min = Math.floor(diff / 60000)
            if (min < 1) return 'vừa xong'
            if (min < 60) return `${min} phút trước`
            const hr = Math.floor(min / 60)
            if (hr < 24) return `${hr} giờ trước`
            const day = Math.floor(hr / 24)
            return `${day} ngày trước`
        }

        const truncate = (text: string, maxLen = 80) =>
            text.length > maxLen ? text.slice(0, maxLen) + '...' : text

        // [AUDIT HT-035 fix] escape SAU khi cắt: cắt trước rồi escape thì một thực thể HTML có thể
        // bị cắt đôi; escape sau cắt luôn cho chuỗi hợp lệ.
        const rows = notifications.map(n => {
            const emoji = typeEmoji[n.type] || '🔔'
            return `
                <tr>
                    <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; font-size: 14px; width: 30px; text-align: center;">${emoji}</td>
                    <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb;">
                        <div style="font-weight: 600; font-size: 13px; color: #111827;">${escapeHtml(n.title)}</div>
                        <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">${escapeHtml(truncate(n.body))}</div>
                    </td>
                    <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; white-space: nowrap; text-align: right;">${formatRelativeTime(n.createdAt)}</td>
                </tr>
            `
        }).join('')

        // [AUDIT HT-035 fix] `appUrl` do nơi gọi truyền vào — cùng lý do như notificationRealtime.
        const safeAppUrl = safeEmailUrl(`${appUrl}/dashboard`)

        const content = `
            <p>Xin chào <strong>${escapeHtml(userName)}</strong>,</p>
            <p>Bạn có <strong>${notifications.length}</strong> thông báo mới:</p>

            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tbody>
                    ${rows}
                </tbody>
            </table>

            ${safeAppUrl ? `
            <div style="text-align: center;">
                <a href="${safeAppUrl}" class="btn">XEM TẤT CẢ THÔNG BÁO</a>
            </div>
            ` : ''}

            <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">
                Bạn nhận email này vì đã bật thông báo tổng hợp.
                Thay đổi tùy chọn trong Settings &gt; Notification Preferences.
            </p>
        `
        return wrapTemplate(content, `[HustlyTasker] Bạn có ${notifications.length} thông báo mới`)
    },
}
