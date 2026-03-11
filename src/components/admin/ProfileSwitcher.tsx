'use client'

import { useState } from 'react'
import { changeUserProfile } from '@/actions/admin-profile-actions'
import { toast } from 'sonner'
import { useConfirm } from '@/components/ui/ConfirmModal'

export default function ProfileSwitcher({ 
    userId, 
    currentProfileId, 
    profiles, 
    workspaceId 
}: { 
    userId: string
    currentProfileId: string | null
    profiles: any[]
    workspaceId: string 
}) {
    const { confirm } = useConfirm()
    const [loading, setLoading] = useState(false)

    const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newProfileId = e.target.value
        
        const ok = await confirm({
            title: 'Chuyển Team',
            message: 'Bạn có chắc chắn muốn chuyển thành viên này sang Team khác? Họ sẽ mất quyền truy cập vào Workspace và Data của Team hiện tại.',
            confirmText: 'Chuyển',
            cancelText: 'Hủy',
            type: 'warning'
        })

        if (!ok) {
            e.target.value = currentProfileId || ''
            return
        }

        setLoading(true)
        const res = await changeUserProfile(userId, newProfileId || null, workspaceId)
        if (res.error) {
            toast.error(res.error)
            e.target.value = currentProfileId || ''
        } else {
            toast.success('Đã chuyển Team thành công')
        }
        setLoading(false)
    }

    return (
        <select 
            disabled={loading}
            value={currentProfileId || ''} 
            onChange={handleChange}
            className="text-xs py-1.5 px-2 rounded-md bg-neutral-900 border border-neutral-700 text-neutral-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 min-w-[120px]"
        >
            <option value="">-- Chưa gán Team --</option>
            {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
            ))}
        </select>
    )
}
