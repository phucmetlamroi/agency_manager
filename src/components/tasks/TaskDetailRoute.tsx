"use client"

// [P2-D3] Client wrapper that adapts the existing TaskDetailModal to a ROUTE.
// The route's presence IS the "open" state; closing navigates back (router.back
// falls back to the workspace root when there's no history — e.g. a fresh
// deep-link load). Reuses TaskDetailModal verbatim so behavior + edit/save flows
// are identical to the desktop modal (the polished M5 mobile layout comes in PR3).

import { useCallback } from "react"
import { useRouter } from "next/navigation"
import type { TaskWithUser } from "@/types/admin"
import { TaskDetailModal } from "./TaskDetailModal"

export function TaskDetailRoute({
    task,
    isAdmin,
    currentUserId,
    workspaceId,
}: {
    task: TaskWithUser
    isAdmin: boolean
    currentUserId: string
    workspaceId: string
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
