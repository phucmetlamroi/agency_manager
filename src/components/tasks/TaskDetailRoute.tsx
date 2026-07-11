"use client"

// [P2-D3/D4] Client wrapper that adapts task detail to a ROUTE, branching by device:
//  - mobile → TaskDetailMobile (M5 full-screen page: 3 tabs + composer-above-keyboard)
//  - desktop → TaskDetailModal (existing drawer; unchanged)
// The route's presence IS the "open" state; closing navigates back (router.back
// falls back to the workspace root when there's no history — e.g. a fresh deep-link).

import { useCallback } from "react"
import { useRouter } from "next/navigation"
import type { TaskWithUser } from "@/types/admin"
import type { DeviceType } from "@/lib/device"
import { TaskDetailModal } from "./TaskDetailModal"
import { TaskDetailMobile } from "./TaskDetailMobile"

export function TaskDetailRoute({
    task,
    isAdmin,
    currentUserId,
    workspaceId,
    deviceType,
}: {
    task: TaskWithUser
    isAdmin: boolean
    currentUserId: string
    workspaceId: string
    deviceType: DeviceType
}) {
    const router = useRouter()

    const handleClose = useCallback(() => {
        // Prefer going back (intercepted modal / soft-nav from the list). On a fresh
        // deep-link load there may be no in-app history, so fall back to the workspace.
        if (typeof window !== 'undefined' && window.history.length > 1) {
            router.back()
        } else {
            router.push(`/${workspaceId}`)
        }
    }, [router, workspaceId])

    if (deviceType === 'mobile') {
        return (
            <TaskDetailMobile
                task={task}
                isAdmin={isAdmin}
                currentUserId={currentUserId}
                workspaceId={workspaceId}
                onClose={handleClose}
            />
        )
    }

    return (
        <TaskDetailModal
            task={task}
            isOpen
            onClose={handleClose}
            isAdmin={isAdmin}
            workspaceId={workspaceId}
            currentUserId={currentUserId}
        />
    )
}
