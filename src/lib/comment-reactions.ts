/**
 * [Trial P3] Allowlist of emoji reactions for TASK comments (ClickUp-style).
 * Kept tiny + shared so the server actions and both skins (admin dark / client
 * light) validate against the same set — an unknown emoji is silently ignored.
 */
export const COMMENT_REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '🙏'] as const
export type CommentReaction = (typeof COMMENT_REACTIONS)[number]

export function isValidReaction(e: unknown): e is CommentReaction {
    return typeof e === 'string' && (COMMENT_REACTIONS as readonly string[]).includes(e)
}
