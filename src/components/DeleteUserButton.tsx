'use client'

import { deleteUser } from '@/actions/user-actions'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'

export default function DeleteUserButton({ userId, workspaceId }: { userId: string, workspaceId: string }) {
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
            await deleteUser(userId, workspaceId)
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
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all disabled:opacity-50"
            title="Xóa User"
        >
            {isDeleting ? (
                <div className="w-3.5 h-3.5 border-2 border-red-500/40 border-t-red-500 rounded-full animate-spin" />
            ) : (
                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
            )}
        </button>
    )
}
