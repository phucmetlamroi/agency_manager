'use client'

// [Review module P1.10] React binding for the out-of-tree upload store. The
// engine writes; components read via useSyncExternalStore. getSnapshot returns a
// referentially-stable value between mutations, so a component only re-renders
// when the item set actually changes — the filtered/derived hooks below memoize
// on that stable reference.

import { useMemo, useSyncExternalStore } from 'react'
import { uploadStore, type UploadItem, type UploadStoreState } from './upload-store'

/** The whole store snapshot (stable ref between mutations). */
export function useUploadState(): UploadStoreState {
    return useSyncExternalStore(uploadStore.subscribe, uploadStore.getSnapshot, uploadStore.getServerSnapshot)
}

/** All items, newest last. */
export function useUploadItems(): UploadItem[] {
    return useUploadState().items
}

/** Items destined for a specific task's BÀN GIAO block. */
export function useTaskUploads(taskId: string): UploadItem[] {
    const { items } = useUploadState()
    return useMemo(
        () => items.filter((it) => it.target.kind === 'task' && it.target.taskId === taskId),
        [items, taskId],
    )
}
