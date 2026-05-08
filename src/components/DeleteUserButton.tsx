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
            title: 'Deactivate User?',
            message: 'User sẽ bị KHÓA — không thể đăng nhập, mọi session đang active sẽ bị logout.\n\nLƯU Ý: Data của user (tasks, comments, lịch sử) ĐƯỢC GIỮ NGUYÊN. Bạn có thể reactivate sau.\n\nĐể chỉ remove user khỏi workspace này (không khóa account), dùng trang Members.',
            type: 'danger',
            confirmText: 'Deactivate',
            cancelText: 'Hủy'
        }))) return

        setIsDeactivating(true)
        try {
            const result = await deactivateUser(userId, workspaceId)
            if (result.success) {
                toast.success(result.message ?? 'Đã deactivate user.')
            } else {
                toast.error(result.error ?? 'Lỗi khi deactivate user.')
            }
        } catch {
            toast.error('Lỗi khi deactivate user.')
        } finally {
            setIsDeactivating(false)
        }
    }

    return (
        <button
            onClick={handleDeactivate}
            disabled={isDeactivating}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all disabled:opacity-50"
            title="Deactivate User (khóa account, giữ data)"
        >
            {isDeactivating ? (
                <div className="w-3.5 h-3.5 border-2 border-red-500/40 border-t-red-500 rounded-full animate-spin" />
            ) : (
                <UserX className="w-4 h-4" strokeWidth={1.5} />
            )}
        </button>
    )
}
