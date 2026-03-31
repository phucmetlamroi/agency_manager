'use client'

import { adminResetPassword } from '@/actions/user-actions'
import { useState } from 'react'
import { KeyRound } from 'lucide-react'

export default function ResetPasswordButton({ userId, username, workspaceId }: { userId: string, username: string, workspaceId: string }) {
    const [loading, setLoading] = useState(false)

    const handleReset = async () => {
        const newPass = prompt(`Nhập mật khẩu mới cho user "${username}":`)
        if (!newPass) return
        if (newPass.length < 6) return alert('Mật khẩu phải có ít nhất 6 ký tự!')

        setLoading(true)
        const res = await adminResetPassword(userId, newPass, workspaceId)
        setLoading(false)

        if (res.success) {
            alert('Đổi mật khẩu thành công!')
        } else {
            alert(res.error || 'Lỗi!')
        }
    }

    return (
        <button
            onClick={handleReset}
            disabled={loading}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/20 transition-all disabled:opacity-50"
            title="Đổi mật khẩu"
        >
            {loading ? (
                <div className="w-3.5 h-3.5 border-2 border-amber-500/40 border-t-amber-500 rounded-full animate-spin" />
            ) : (
                <KeyRound className="w-4 h-4" strokeWidth={1.5} />
            )}
        </button>
    )
}
