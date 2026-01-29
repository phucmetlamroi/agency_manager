
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
        // FIX: Removed unnecessary backslash escape before template literal
        const link = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard`

        const content = `
            <p>Xin chào <strong>${userName}</strong>,</p>
            <p>Bạn vừa được giao một công việc mới trên hệ thống.</p>
            
            <div class="card">
                <p><strong>Dự án/Task:</strong> ${taskTitle}</p>
                <p><strong>Deadline:</strong> ${deadlineStr}</p>
            </div>

            <p>Vui lòng kiểm tra và bắt đầu công việc sớm nhất có thể.</p>
            
            <div style="text-align: center;">
                <a href="${link}" class="btn">Xem chi tiết Task</a>
            </div>
        `
        return wrapTemplate(content, '🚀 New Task Assigned')
    },

    // 2. Task Started (To Admin)
    taskStarted: (adminName: string, userName: string, taskTitle: string, startTime: Date) => {
        const timeStr = new Date(startTime).toLocaleString('vi-VN')

        const content = `
            <p>Xin chào Admin,</p>
            <p>Nhân viên <span class="highlight">${userName}</span> đã bắt đầu làm việc.</p>
            
            <div class="card">
                <p><strong>Task:</strong> ${taskTitle}</p>
                <p><strong>Thời gian bắt đầu:</strong> ${timeStr}</p>
            </div>
        `
        return wrapTemplate(content, '▶️ Work Started')
    },

    // 3. Admin Feedback (To User)
    taskFeedback: (userName: string, taskTitle: string, feedback: string) => {
        // FIX: Removed unnecessary backslash escape before template literal
        const link = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard`

        const content = `
            <p>Xin chào <strong>${userName}</strong>,</p>
            <p>Admin vừa gửi yêu cầu chỉnh sửa (Feedback) cho task <span class="highlight">${taskTitle}</span>.</p>
            
            <div class="card" style="border-left-color: #f59e0b; background-color: #fffbeb;">
                <p><strong>Nội dung Feedback:</strong></p>
                <p style="font-style: italic;">"${feedback}"</p>
            </div>

            <p>Vui lòng sửa lại theo yêu cầu.</p>
            
            <div style="text-align: center;">
                <a href="${link}" class="btn" style="background-color: #f59e0b;">Vào sửa ngay</a>
            </div>
         `
        return wrapTemplate(content, '⚠️ Action Required: Feedback')
    },

    // 4. Task Completed / Approved (To User)
    taskCompleted: (userName: string, taskTitle: string, revenue: number) => {
        const content = `
            <p>Xin chào <strong>${userName}</strong>,</p>
            <p>Chúc mừng! Task <span class="highlight">${taskTitle}</span> đã được duyệt hoàn tất.</p>
            
            <div class="card" style="border-left-color: #10b981; background-color: #ecfdf5;">
                <p><strong>Trạng thái:</strong> ✅ Hoàn thành</p>
                ${revenue > 0 ? `<p><strong>Ghi nhận doanh thu:</strong> ${formatCurrency(revenue)}</p>` : ''}
            </div>

            <p>Làm tốt lắm! Hệ thống đã ghi nhận kết quả của bạn.</p>
        `
        return wrapTemplate(content, '✅ Task Approved')
    }
}
