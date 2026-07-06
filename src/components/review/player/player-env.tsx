// [Review module P5.3] PlayerEnv — the ONE seam that lets the P4 player run in
// two worlds without forking 1,600 lines of comment UI:
//   internal (default, NO provider needed): /api/review/* endpoints, Vietnamese,
//     full capabilities — the in-app player is bit-for-bit unchanged.
//   guest (share page /r/{slug} wraps <PlayerEnvProvider value={guestEnv(slug)}>):
//     /api/r/{slug}/* endpoints, English, no internal toggle / no @mention /
//     no resolve; edit-delete only own comments (per session cookie).
// Components consume `usePlayerEnv()` instead of importing the API clients.

'use client'

import { createContext, useContext } from 'react'
import {
    addReaction,
    createComment,
    deleteComment,
    editComment,
    initiateAttachment,
    listComments,
    removeReaction,
    setCommentResolved,
    type CommentDto,
    type CreateCommentInput,
    type ListCommentsQuery,
    type ListCommentsResponse,
} from '@/lib/review/comment-client'
import { fetchDownloadUrl, fetchPlaybackToken, type PlaybackToken } from '@/lib/review/player-api'

export interface PlayerEnvApi {
    fetchPlaybackToken(versionId: string): Promise<PlaybackToken>
    /** presigned original — image display (and internal download). */
    fetchImageUrl(versionId: string): Promise<{ url: string }>
    listComments(versionId: string, q: ListCommentsQuery): Promise<ListCommentsResponse>
    createComment(versionId: string, input: CreateCommentInput): Promise<{ comment: CommentDto }>
    editComment(commentId: string, body: string): Promise<{ comment: CommentDto }>
    deleteComment(commentId: string): Promise<{ deleted: true }>
    setCommentResolved(commentId: string, resolved: boolean): Promise<{ comment: CommentDto }>
    addReaction(commentId: string, emoji: string): Promise<{ reactions: CommentDto['reactions'] }>
    removeReaction(commentId: string, emoji: string): Promise<{ reactions: CommentDto['reactions'] }>
    initiateAttachment(input: { fileName: string; sizeBytes: number; mimeType: string }): Promise<{
        attachmentId: string
        putUrl: string
        expiresAt: string
    }>
}

export interface PlayerEnv {
    mode: 'internal' | 'guest'
    lang: 'vi' | 'en'
    api: PlayerEnvApi
    can: {
        /** show the Công khai/Nội bộ selector (guests: everything is public) */
        internalToggle: boolean
        /** @mention autocomplete in the composer */
        mention: boolean
        /** Mark-as-complete toggle on comments (guests see the state, read-only) */
        resolve: boolean
        /** internal: author only · guest: own comments of the live session */
        editComment: (comment: CommentDto) => boolean
        /** internal: author or admin · guest: own comments of the live session */
        deleteComment: (comment: CommentDto) => boolean
    }
}

/** The internal environment — identical to the pre-P5 hard-wired behavior. */
export function internalPlayerEnv(opts: { currentUserId: string; isAdmin: boolean }): PlayerEnv {
    return {
        mode: 'internal',
        lang: 'vi',
        api: {
            fetchPlaybackToken,
            fetchImageUrl: fetchDownloadUrl,
            listComments,
            createComment,
            editComment,
            deleteComment,
            setCommentResolved,
            addReaction,
            removeReaction,
            initiateAttachment,
        },
        can: {
            internalToggle: true,
            mention: true,
            resolve: true,
            editComment: (c) => !!c.author && c.author.id === opts.currentUserId,
            deleteComment: (c) => opts.isAdmin || (!!c.author && c.author.id === opts.currentUserId),
        },
    }
}

const PlayerEnvContext = createContext<PlayerEnv | null>(null)

export function PlayerEnvProvider({ value, children }: { value: PlayerEnv; children: React.ReactNode }) {
    return <PlayerEnvContext.Provider value={value}>{children}</PlayerEnvContext.Provider>
}

/** Components require a provider — both shells (internal + guest) mount one. */
export function usePlayerEnv(): PlayerEnv {
    const env = useContext(PlayerEnvContext)
    if (!env) throw new Error('[review/player] usePlayerEnv called outside <PlayerEnvProvider>')
    return env
}
