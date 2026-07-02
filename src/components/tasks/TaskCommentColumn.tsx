'use client'

/**
 * [Trial P1] Self-fetching admin comment column — the right side of the task
 * drawer. Loads the merged comment+activity feed and wires create/edit/delete to
 * the session-gated task-comment actions. Dark skin.
 */

import { useCallback, useEffect, useState } from 'react'
import TaskCommentThread, { type ThreadItem } from './TaskCommentThread'
import { getTaskActivityFeed, createTaskComment, editTaskComment, deleteTaskComment } from '@/actions/task-comment-actions'

export default function TaskCommentColumn({ taskId, workspaceId }: { taskId: string; workspaceId: string }) {
    const [items, setItems] = useState<ThreadItem[]>([])
    const [loading, setLoading] = useState(true)

    const load = useCallback(() => {
        setLoading(true)
        getTaskActivityFeed(taskId, workspaceId)
            .then((f) => setItems(f as ThreadItem[]))
            .catch(() => { /* keep prior feed */ })
            .finally(() => setLoading(false))
    }, [taskId, workspaceId])

    useEffect(() => { load() }, [load])

    return (
        <TaskCommentThread
            items={items}
            skin="dark"
            canInternalToggle
            loading={loading}
            onPost={(body, visibility) => createTaskComment(taskId, workspaceId, { body, visibility })}
            onEdit={(id, body) => editTaskComment(id, workspaceId, body)}
            onDelete={(id) => deleteTaskComment(id, workspaceId)}
            onRefresh={load}
        />
    )
}
