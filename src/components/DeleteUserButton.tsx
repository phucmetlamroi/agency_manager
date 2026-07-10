'use client'

import { deactivateUser } from '@/actions/user-actions'
import { useState } from 'react'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { toast } from 'sonner'
import { UserX } from 'lucide-react'

/**
 * @deprecated DeleteUserButton — đã đổi behavior từ HARD DELETE → DEACTIVATE.
 * - HARD DELETE vi phạm PDPL Việt Nam (Luật 91/2025/QH15)
 * - Cascade xóa tasks/comments/lịch sử nghiệp vụ
 *
 * Behavior mới:
 * - Set role=LOCKED → user không thể đăng nhập
 * - Bump sessionVersion → invalidate JWT đang active
 * - Audit log đầy đủ
 * - Data nguyên vẹn → có thể reactivate sau
 *
 * Component giữ tên cũ để không break call sites; sẽ rename ở Sprint 4.
 */
export default function DeleteUserButton({ userId, workspaceId }: { userId: string, workspaceId: string }) {
    const { confirm } = useConfirm()
    const [isDeactivating, setIsDeactivating] = useState(false)

    const handleDeactivate = async () => {
        if (!(await confirm({
            title: 'Vô hiệu hoá nhân viên?',
            message: 'Nhân viên sẽ bị KHOÁ — không thể đăng nhập, mọi phiên đang hoạt động sẽ bị đăng xuất.\n\nLƯU Ý: Dữ liệu của nhân viên (Task, bình luận, lịch sử) ĐƯỢC GIỮ NGUYÊN. Bạn có thể kích hoạt lại sau.\n\nĐể chỉ gỡ nhân viên khỏi Workspace này (không khoá tài khoản), dùng trang Thành viên.',
            type: 'danger',
            confirmText: 'Vô hiệu hoá',
            cancelText: 'Huỷ'
        }))) return

        setIsDeactivating(true)
        try {
            const result = await deactivateUser(userId, workspaceId)
            if (result.success) {
                toast.success(result.message ?? 'Đã vô hiệu hoá nhân viên.')
            } else {
                toast.error(result.error ?? 'Lỗi khi vô hiệu hoá nhân viên.')
            }
        } catch {
            toast.error('Lỗi khi vô hiệu hoá nhân viên.')
        } finally {
            setIsDeactivating(false)
        }
    }

    return (
        <button
            onClick={handleDeactivate}
            disabled={isDeactivating}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all disabled:opacity-50"
            title="Vô hiệu hoá nhân viên (khoá tài khoản, giữ dữ liệu)"
        >
            {isDeactivating ? (
                <div className="w-3.5 h-3.5 border-2 border-red-500/40 border-t-red-500 rounded-full animate-spin" />
            ) : (
                <UserX className="w-4 h-4" strokeWidth={1.5} />
            )}
        </button>
    )
}
