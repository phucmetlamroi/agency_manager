'use client'

import { selectProfile } from '@/actions/profile-actions'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

interface Props {
    profileId: string
    isAllowed: boolean
    role: string
    children: React.ReactNode
}

export default function ProfileActionClient({ profileId, isAllowed, role, children }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const handleClick = () => {
        if (!isAllowed || isPending) return

        startTransition(async () => {
            const res = await selectProfile(profileId)
            if (res && !(res as any).success) {
                alert((res as any).error || 'Failed to select profile')
            }
        })
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
