'use client'

/**
 * [Trial P1] Client-facing comment section inside the deliverable panel. Reuses
 * the shared TaskCommentThread (light skin) in a bounded box. The client sees
 * ONLY CLIENT-visibility comments (server hard-filters) and can post (forced
 * CLIENT). The editor is never surfaced — staff comments read as "The team".
 */

import { useCallback, useEffect, useState } from 'react'
import TaskCommentThread, { type ThreadItem } from '@/components/tasks/TaskCommentThread'
import type { DeliverableActions } from './types'

export default function PortalCommentSection({ taskId, actions }: { taskId: string; actions: DeliverableActions }) {
    const [items, setItems] = useState<ThreadItem[]>([])
    const [loading, setLoading] = useState(true)

    const load = useCallback(() => {
        if (!actions.getCommentFeed) { setLoading(false); return }
        setLoading(true)
        actions.getCommentFeed(taskId)
            .then((f) => setItems(f as ThreadItem[]))
            .catch(() => { /* keep prior */ })
            .finally(() => setLoading(false))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskId])

    useEffect(() => { load() }, [load])

    if (!actions.postComment) return null

    return (
        <div>
            <p className="eyebrow" style={{ fontSize: 10, marginBottom: 10 }}>Comments</p>
            <div style={{ height: 380, border: '1px solid var(--line-2)', borderRadius: 14, overflow: 'hidden', background: 'var(--surface)' }}>
                <TaskCommentThread
                    items={items}
                    skin="light"
                    canInternalToggle={false}
                    loading={loading}
                    onPost={(body) => actions.postComment!(taskId, body)}
                    onRefresh={load}
                />
            </div>
        </div>
    )
}
