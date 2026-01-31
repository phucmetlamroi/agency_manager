'use client'

import { deleteUser } from '@/actions/user-actions'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { toast } from 'sonner'

export default function DeleteUserButton({ userId }: { userId: string }) {
    const { confirm } = useConfirm()
    const [isDeleting, setIsDeleting] = useState(false)
    const router = useRouter()

    const handleDelete = async () => {
        if (!(await confirm({
            title: 'Xóa User?',
            message: 'CHÚ Ý: Xóa user sẽ khiến họ mất quyền truy cập NGAY LẬP TỨC. Bạn có chắc không?',
            type: 'danger',
            confirmText: 'Xóa ngay',
            cancelText: 'Hủy'
        }))) return

        setIsDeleting(true)
        try {
            await deleteUser(userId)
            toast.success('Đã xóa user thành công')
        } catch (error) {
            toast.error('Lỗi khi xóa user')
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <button
            onClick={handleDelete}
            disabled={isDeleting}
            style={{
                background: 'transparent',
                border: 'none',
                color: '#ef4444',
                cursor: 'pointer',
                fontSize: '1.2rem',
                opacity: isDeleting ? 0.5 : 1
            }}
            title="Xóa User"
        >
            {isDeleting ? '...' : '×'}
        </button>
    )
}
