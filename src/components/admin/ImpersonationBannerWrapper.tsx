'use client'

/**
 * Wrapper around ImpersonationBanner — handles server action call to stop.
 *
 * Tách thành component riêng vì ImpersonationBanner là pure UI (props),
 * còn wrapper biết về server action.
 */

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { stopImpersonation } from '@/actions/impersonation-actions'
import { toast } from 'sonner'
import ImpersonationBanner from './ImpersonationBanner'

interface Props {
    impersonatedUsername: string
    expiresAtIso: string
    workspaceId: string
}

export default function ImpersonationBannerWrapper({
    impersonatedUsername,
    expiresAtIso,
    workspaceId,
}: Props) {
    const router = useRouter()
    const [, startTransition] = useTransition()

    const handleStop = () => {
        startTransition(async () => {
            try {
                const result = await stopImpersonation(workspaceId)
                if ((result as any)?.error) {
                    toast.error((result as any).error)
                } else {
                    toast.success('Đã thoát impersonation.')
                    router.push(`/${workspaceId}/admin`)
                    router.refresh()
                }
            } catch {
                toast.error('Không thể thoát impersonation.')
            }
        })
    }

    return (
        <ImpersonationBanner
            impersonatedUsername={impersonatedUsername}
            expiresAtIso={expiresAtIso}
            onStop={handleStop}
        />
    )
}
