"use client"

// [P2-01] Right-column comment + activity feed panel (ClickUp-style). Extracted
// verbatim from TaskDetailModal — thin wrapper around TaskCommentColumn so the
// mobile full-screen route (P2-PR3) can reuse the same feed as its "Bình luận" tab.
// The 400px panel chrome is desktop-modal-specific and lives here.

import React from "react"
import TaskCommentColumn from "../TaskCommentColumn"

export function TaskCommentsSection({
    taskId,
    workspaceId,
}: {
    taskId: string
    workspaceId: string
}) {
    return (
        <div style={{ width: 400, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', zIndex: 1, background: 'rgba(0,0,0,0.22)' }}>
            <TaskCommentColumn taskId={taskId} workspaceId={workspaceId} />
        </div>
    )
}
