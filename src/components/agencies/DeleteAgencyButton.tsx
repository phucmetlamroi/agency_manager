'use client'

import { deleteAgency } from '@/actions/agency-actions'
import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

export default function DeleteAgencyButton({ id, name }: { id: string, name: string }) {
    const [isPending, startTransition] = useTransition()
    const router = useRouter()

    const handleDelete = async (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()

        if (!confirm(`Bạn có chắc muốn xóa đại lý "${name}" không?\n\n- Tất cả thành viên sẽ trở về tài khoản thường.\n- Hành động này không thể hoàn tác.`)) {
            return
        }

        startTransition(async () => {
            const res = await deleteAgency(id)
            if (res.success) {
                toast.success(`Đã xóa đại lý ${name}`)
                router.refresh()
            } else {
                toast.error(res.error || 'Lỗi khi xóa đại lý')
            }
        })
    }

    return (
        <button
            onClick={handleDelete}
            disabled={isPending}
            className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
            title="Xóa đại lý"
        >
            {isPending ? <span className="animate-spin">⏳</span> : <Trash2 size={16} />}
        </button>
    )
}
