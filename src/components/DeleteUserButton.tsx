'use client'

import { deleteUser } from '@/actions/user-actions'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DeleteUserButton({ userId }: { userId: string }) {
    const [isDeleting, setIsDeleting] = useState(false)
    const router = useRouter()

    const handleDelete = async () => {
        if (!confirm('CHÚ Ý: Xóa user sẽ khiến họ mất quyền truy cập NGAY LẬP TỨC. Bạn có chắc không?')) return

        setIsDeleting(true)
        try {
            await deleteUser(userId)
            // router.refresh() is redundant if action revalidates, but good for safety
        } catch (error) {
            alert('Lỗi khi xóa.')
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
