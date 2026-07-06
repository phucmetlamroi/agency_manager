// [Review module P4.3] Comment feed for one version. SWR polls every 5s (FR-E11);
// SWR pauses the interval automatically while the tab is hidden (refreshWhenHidden
// defaults false) → satisfies "tab ẩn → polling dừng". Mutations update the local
// cache optimistically then revalidate. Sort/filter/search are applied server-side
// via the query so the poll returns the already-shaped list.

'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import type { CommentDto, ListCommentsResponse, ListCommentsQuery } from '@/lib/review/comment-client'
import { usePlayerEnv } from './player-env'

export interface CommentsFeed {
    comments: CommentDto[]
    otherVersions: ListCommentsResponse['otherVersions']
    total: number
    isLoading: boolean
    error: string | null
    refresh: () => void
    /** Update the cached list without a network round-trip (optimistic UI). */
    patch: (updater: (list: CommentDto[]) => CommentDto[]) => void
}

export function useComments(versionId: string | null, query: ListCommentsQuery = {}): CommentsFeed {
    const env = usePlayerEnv() // P5.3: internal vs guest endpoint set
    const key = versionId ? ['review-comments', env.mode, versionId, JSON.stringify(query)] : null
    const { data, error, isLoading, mutate } = useSWR<ListCommentsResponse>(
        key,
        () => env.api.listComments(versionId as string, query),
        {
            refreshInterval: 5000,
            revalidateOnFocus: true,
            dedupingInterval: 1500,
            keepPreviousData: true,
        },
    )

    const refresh = useCallback(() => {
        void mutate()
    }, [mutate])

    const patch = useCallback(
        (updater: (list: CommentDto[]) => CommentDto[]) => {
            void mutate(
                (cur) =>
                    cur
                        ? { ...cur, items: updater(cur.items) }
                        : { items: updater([]), otherVersions: [], nextCursor: null, total: 0 },
                { revalidate: false },
            )
        },
        [mutate],
    )

    return {
        comments: data?.items ?? [],
        otherVersions: data?.otherVersions ?? [],
        total: data?.total ?? 0,
        isLoading,
        error: error instanceof Error ? error.message : null,
        refresh,
        patch,
    }
}
