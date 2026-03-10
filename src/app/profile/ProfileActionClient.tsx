'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
    profileId: string
    isAllowed: boolean
    role: string
    sessionToken: string
    children: React.ReactNode
}

export default function ProfileActionClient({ profileId, isAllowed, role, sessionToken, children }: Props) {
    const router = useRouter()
    const [isPending, setIsPending] = useState(false)

    const handleClick = async () => {
        if (!isAllowed || isPending) return
        setIsPending(true)

        try {
            const res = await fetch('/api/profile/select', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ profileId, sessionToken })
            })
            
            const data = await res.json()
            if (data.success) {
                if (data.role === 'CLIENT') {
                    window.location.href = '/portal'
                } else {
                    window.location.href = '/workspace'
                }
            } else {
                alert(data.error || 'Failed to select profile')
                setIsPending(false)
            }
        } catch (e) {
            alert('Lỗi kết nối đến máy chủ. Định dạng phản hồi không hợp lệ.')
            setIsPending(false)
        }
    }

    return (
        <div onClick={handleClick} className="w-full relative">
            {isPending && (
                <div className="absolute inset-0 z-50 bg-neutral-900/50 backdrop-blur-sm flex justify-center items-center rounded-2xl">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}
            {children}
        </div>
    )
}
