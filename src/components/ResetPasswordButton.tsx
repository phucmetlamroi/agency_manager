'use client'

import { adminResetPassword } from '@/actions/user-actions'
import { useState } from 'react'

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
            style={{
                background: 'transparent',
                border: '1px solid #3b82f6',
                color: '#3b82f6',
                borderRadius: '6px',
                padding: '0.2rem 0.6rem',
                fontSize: '0.8rem',
                cursor: 'pointer',
                marginRight: '0.5rem'
            }}
            title="Đổi mật khẩu"
        >
            {loading ? '...' : '🔑 Pass'}
        </button>
    )
}
