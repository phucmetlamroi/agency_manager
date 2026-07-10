'use client'

import { triggerForcePasswordReset } from '@/actions/user-actions'
import { useState } from 'react'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { toast } from 'sonner'
import { KeyRound } from 'lucide-react'

/**
 * Force Password Reset Button.
 *
 * Behavior thay đổi từ "admin nhập password mới" sang "admin trigger email OTP":
 * - Trước: admin có thể đăng nhập làm user → impersonation không log
 * - Sau: server gửi email OTP → user TỰ đặt password mới qua /forgot-password
 *
 * Lý do: vi phạm bảo mật + best practice (Microsoft, Google, Slack đều dùng pattern này).
 * Reuse public flow → consistent với `/forgot-password`.
 */
export default function ResetPasswordButton({ userId, username, workspaceId }: { userId: string, username: string, workspaceId: string }) {
    const { confirm } = useConfirm()
    const [loading, setLoading] = useState(false)

    const handleTrigger = async () => {
        if (!(await confirm({
            title: 'Đặt lại mật khẩu?',
            message: `Hệ thống sẽ gửi email OTP tới nhân viên "${username}" để họ TỰ đặt mật khẩu mới.\n\nBạn KHÔNG nhìn thấy mật khẩu mới — đây là quy trình bảo mật chuẩn (tránh quản trị viên mạo danh).\n\nNếu nhân viên chưa có email trong hệ thống, hãy yêu cầu họ thiết lập email trước.`,
            type: 'warning',
            confirmText: 'Gửi email OTP',
            cancelText: 'Hủy'
        }))) return

        setLoading(true)
        try {
            const res = await triggerForcePasswordReset(userId, workspaceId)
            if (res.success) {
                toast.success(res.message ?? 'Đã gửi email đặt lại mật khẩu.')
            } else {
                toast.error(res.error ?? 'Không thể gửi email.')
            }
        } catch {
            toast.error('Lỗi khi gửi email đặt lại mật khẩu.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <button
            onClick={handleTrigger}
            disabled={loading}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/20 transition-all disabled:opacity-50"
            title="Đặt lại mật khẩu (gửi email OTP)"
        >
            {loading ? (
                <div className="w-3.5 h-3.5 border-2 border-amber-500/40 border-t-amber-500 rounded-full animate-spin" />
            ) : (
                <KeyRound className="w-4 h-4" strokeWidth={1.5} />
            )}
        </button>
    )
}
