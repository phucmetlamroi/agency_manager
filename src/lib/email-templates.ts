
// Helper to format currency
const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
}

// Base Template Wrapper for consistent styling
const wrapTemplate = (content: string, title: string) => `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #6d28d9, #7c3aed); padding: 20px; text-align: center; color: white; }
        .header h1 { margin: 0; font-size: 24px; font-weight: bold; }
        .body { padding: 30px; }
        .footer { background: #f9fafb; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; }
        .btn { display: inline-block; padding: 12px 24px; background-color: #6d28d9; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }
        .highlight { font-weight: bold; color: #6d28d9; }
        .card { background: #f3f4f6; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #6d28d9; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${title}</h1>
        </div>
        <div class="body">
            ${content}
        </div>
        <div class="footer">
            © ${new Date().getFullYear()} AgencyManager System. All rights reserved.
        </div>
    </div>
</body>
</html>
`

export const emailTemplates = {
    // 1. Task Assigned (To User)
    taskAssigned: (userName: string, taskTitle: string, deadline: Date | null, taskId: string) => {
        const deadlineStr = deadline ? new Date(deadline).toLocaleString('vi-VN') : 'Không có hạn chót'
        const link = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard`
        // Scenario 1
        const content = `
            <p>Chào <strong>${userName}</strong>,</p>
            <p>Admin vừa giao cho bạn một task mới trong dự án.</p>
            
            <div class="card">
                <p><strong>Nhiệm vụ:</strong> ${taskTitle}</p>
                <p><strong>Deadline:</strong> ${deadlineStr}</p>
            </div>

            <p>Vui lòng truy cập hệ thống để xem chi tiết và bấm "Start" khi bắt đầu làm việc.</p>
            
            <div style="text-align: center;">
                <a href="${link}" class="btn">NHẬN VIỆC NGAY</a>
            </div>
        `
        return wrapTemplate(content, `[New Task] Bạn được giao nhiệm vụ mới: ${taskTitle}`)
    },

    // 2. Task Started (To Admin) -- Keeping existing logic as user didn't explicitly ask to change this one's text, but implied "Kịch bản 2" is Reviewing. 
    // Wait, User Request Kich Ban 2 is "REVIEWING". Kich Ban 1 is Assign.
    // User DID NOT mention "Start Task" email content in this request, but I should keep it functional.
    // 2. Task Started (To Admin)
    taskStarted: (userName: string, taskTitle: string, startTime: Date, taskId: string) => {
        const timeStr = new Date(startTime).toLocaleString('vi-VN')
        const link = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard`

        const content = `
            <p>Admin lưu ý,</p>
            <p>Nhân viên <strong>${userName}</strong> vừa bấm bắt đầu làm việc vào lúc ${timeStr}.</p>
            
            <div class="card">
                <p><strong>Task:</strong> ${taskTitle}</p>
                <p><strong>Link:</strong> <a href="${link}">${link}</a></p>
            </div>
        `
        return wrapTemplate(content, `[STARTED] ${userName} đã bắt đầu task: ${taskTitle}`)
    },

    // 2. Task Submitted / Reviewing (To User & Admin) - NEW
    taskSubmitted: (userName: string, taskTitle: string) => {
        const content = `
            <p>Hệ thống xác nhận bạn đã nộp bài cho task <span class="highlight">${taskTitle}</span>.</p>
            
            <div class="card" style="border-left-color: #3b82f6; background-color: #eff6ff;">
                <p><strong>Trạng thái hiện tại:</strong> Đang chờ duyệt (Under Review)</p>
            </div>

            <p>Vui lòng chờ Admin kiểm tra và phản hồi (Feedback) trong thời gian sớm nhất. Bạn có thể nghỉ ngơi hoặc chuyển sang làm task khác trong lúc chờ đợi.</p>
        `
        return wrapTemplate(content, `[Submission] Task "${taskTitle}" đang chờ Admin phản hồi`)
    },

    // 3. Admin Feedback (To User)
    taskFeedback: (userName: string, taskTitle: string, feedback: string) => {
        const link = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard`
        const content = `
            <p>Chào <strong>${userName}</strong>,</p>
            <p>Admin đã xem bài làm của bạn và có một số yêu cầu chỉnh sửa (Feedback).</p>
            
            <div class="card" style="border-left-color: #f59e0b; background-color: #fffbeb;">
                <p><strong>👉 Lời nhắn từ Admin:</strong></p>
                <p style="font-style: italic;">"${feedback}"</p>
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
                <p><strong>Dự án/Task:</strong> ${taskTitle}</p>
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
        const content = `
            <p>Xin chào <strong>${userName}</strong>,</p>
            <p>Hệ thống xác nhận bạn vừa tạo thành công hóa đơn mới.</p>
            
            <div class="card" style="border-left-color: #3b82f6; background-color: #eff6ff;">
                <p><strong>Mã hóa đơn:</strong> ${invoiceNumber}</p>
                <p><strong>Khách hàng:</strong> ${clientName}</p>
                <p><strong>Tổng tiền:</strong> ${amount}</p>
            </div>

            <p>Hóa đơn đã được lưu vào hệ thống và gửi yêu cầu thanh toán (nếu có cấu hình tự động).</p>
            <p>Bạn có thể xem chi tiết tại đường dẫn bên dưới:</p>
            
            <div style="text-align: center;">
                 <a href="${link}" class="btn">XEM CHI TIẾT KHÁCH HÀNG</a>
            </div>
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
            conversationId: string | null
            taskId: string | null
        },
        appUrl: string,
    ) => {
        const typeEmoji: Record<string, string> = {
            NEW_MESSAGE: '💬',
            MENTION: '📢',
            GROUP_MEMBER_ADDED: '👥',
            GROUP_MEMBER_REMOVED: '👤',
            GROUP_MEMBER_LEFT: '🚪',
            GROUP_DELETED: '🗑️',
            TASK_DEADLINE_APPROACHING: '⏰',
            TASK_OVERDUE: '🚨',
        }
        const emoji = typeEmoji[notification.type] || '🔔'

        // Build CTA link
        let ctaLink = `${appUrl}/dashboard`
        let ctaLabel = 'MỞ AGENCYMANAGER'
        if (notification.conversationId) {
            ctaLink = `${appUrl}/dashboard` // chat opens via sidebar
            ctaLabel = 'MỞ TIN NHẮN'
        } else if (notification.taskId) {
            ctaLink = `${appUrl}/dashboard`
            ctaLabel = 'XEM TASK'
        }

        const content = `
            <p>Xin chào <strong>${userName}</strong>,</p>
            <p>Bạn có một thông báo mới:</p>

            <div class="card">
                <p><strong>${emoji} ${notification.title}</strong></p>
                <p style="color: #4b5563; margin-top: 8px;">${notification.body}</p>
            </div>

            <div style="text-align: center;">
                <a href="${ctaLink}" class="btn">${ctaLabel}</a>
            </div>

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
            NEW_MESSAGE: '💬',
            MENTION: '📢',
            GROUP_MEMBER_ADDED: '👥',
            GROUP_MEMBER_REMOVED: '👤',
            GROUP_MEMBER_LEFT: '🚪',
            GROUP_DELETED: '🗑️',
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

        const rows = notifications.map(n => {
            const emoji = typeEmoji[n.type] || '🔔'
            return `
                <tr>
                    <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; font-size: 14px; width: 30px; text-align: center;">${emoji}</td>
                    <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb;">
                        <div style="font-weight: 600; font-size: 13px; color: #111827;">${n.title}</div>
                        <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">${truncate(n.body)}</div>
                    </td>
                    <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; white-space: nowrap; text-align: right;">${formatRelativeTime(n.createdAt)}</td>
                </tr>
            `
        }).join('')

        const content = `
            <p>Xin chào <strong>${userName}</strong>,</p>
            <p>Bạn có <strong>${notifications.length}</strong> thông báo mới:</p>

            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tbody>
                    ${rows}
                </tbody>
            </table>

            <div style="text-align: center;">
                <a href="${appUrl}/dashboard" class="btn">XEM TẤT CẢ THÔNG BÁO</a>
            </div>

            <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">
                Bạn nhận email này vì đã bật thông báo tổng hợp.
                Thay đổi tùy chọn trong Settings &gt; Notification Preferences.
            </p>
        `
        return wrapTemplate(content, `[AgencyManager] Bạn có ${notifications.length} thông báo mới`)
    },
}
