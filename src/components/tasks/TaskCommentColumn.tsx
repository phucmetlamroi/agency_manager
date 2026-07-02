'use client'

/**
 * [Trial P1 · Chat GĐ3] Self-fetching admin comment column — the right side of
 * the task drawer. Loads the merged comment+activity feed, wires create/edit/
 * delete/react + the GĐ3 assign→resolve action-item controls, subscribes to the
 * task's realtime channel so other users' comments appear live, and marks the
 * task read while it's open. Dark skin.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import TaskCommentThread, { type ThreadItem } from './TaskCommentThread'
import {
    getTaskActivityFeed, createTaskComment, editTaskComment, deleteTaskComment, toggleTaskCommentReaction,
    assignTaskComment, resolveTaskComment, reopenTaskComment, markTaskCommentsRead, getTaskMentionTargets,
} from '@/actions/task-comment-actions'
import { useSupabaseChannel } from '@/hooks/useSupabaseChannel'
import { getTaskCommentChannel, TASK_COMMENT_EVENTS } from '@/lib/notification-channels'

export default function TaskCommentColumn({ taskId, workspaceId }: { taskId: string; workspaceId: string }) {
    const [items, setItems] = useState<ThreadItem[]>([])
    const [loading, setLoading] = useState(true)
    const firstLoad = useRef(true)

    const load = useCallback(() => {
        if (firstLoad.current) setLoading(true)
        getTaskActivityFeed(taskId, workspaceId)
            .then((f) => setItems(f as ThreadItem[]))
            .catch(() => { /* keep prior feed */ })
            .finally(() => {
                setLoading(false)
                firstLoad.current = false
                // Viewing the open feed = reading it.
                void markTaskCommentsRead(taskId, workspaceId).catch(() => { /* best-effort */ })
            })
    }, [taskId, workspaceId])

    useEffect(() => { firstLoad.current = true; load() }, [load])

    // [E1] Live feed: refetch when the server broadcasts a change on this task.
    const onRealtime = useCallback((event: string) => {
        if (event === TASK_COMMENT_EVENTS.FEED_CHANGED) load()
    }, [load])
    useSupabaseChannel(getTaskCommentChannel(taskId), onRealtime, true)

    return (
        <TaskCommentThread
            items={items}
            skin="dark"
            canInternalToggle
            canAssign
            loading={loading}
            onPost={(body, visibility, parentId) => createTaskComment(taskId, workspaceId, { body, visibility, parentId })}
            onEdit={(id, body) => editTaskComment(id, workspaceId, body)}
            onDelete={(id) => deleteTaskComment(id, workspaceId)}
            onReact={(id, emoji) => toggleTaskCommentReaction(id, workspaceId, emoji)}
            onSearchMembers={(q) => getTaskMentionTargets(taskId, workspaceId, q)}
            onAssign={(id, assigneeUserId) => assignTaskComment(id, workspaceId, assigneeUserId)}
            onResolve={(id) => resolveTaskComment(id, workspaceId)}
            onReopen={(id) => reopenTaskComment(id, workspaceId)}
            onRefresh={load}
        />
    )
}
