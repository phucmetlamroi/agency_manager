'use server'

/**
 * [Username Handle] Server actions for username operations.
 *
 *   - checkUsernameAvailable: debounced uniqueness check (called as user types)
 *   - completeUsernameMigration: complete the forced migration for legacy user
 *   - updateMyUsername: change username from settings (post-migration)
 *   - searchInviteCandidates: autocomplete search for invite modal
 *
 * All exposed actions revalidate appropriate paths + emit audit log entries.
 */

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { audit } from '@/lib/audit-log'
import { validateUsername, USERNAME_REGEX } from '@/lib/username-validation'
import { revalidatePath } from 'next/cache'

/* ──────────────────────────────────────────────────────────────────── */
/*  1. checkUsernameAvailable                                          */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Check if a username is available (not taken by another user).
 * Public action — no auth required (called from signup form).
 * Validates format first (cheap), then DB lookup.
 *
 * Returns:
 *   - { available: true }
 *   - { available: false, reason: 'invalid' | 'taken' }
 */
export async function checkUsernameAvailable(
    rawUsername: string,
): Promise<{ available: boolean; reason?: 'invalid' | 'taken'; error?: string }> {
    const username = (rawUsername ?? '').trim()
    if (!username) return { available: false, reason: 'invalid', error: 'Username trống' }

    // Format validation
    const validation = validateUsername(username)
    if (!validation.valid) {
        return { available: false, reason: 'invalid', error: validation.error }
    }

    // DB uniqueness (case-insensitive — DB column has @unique)
    const existing = await prisma.user.findUnique({
        where: { username },
        select: { id: true },
    })
    if (existing) {
        return { available: false, reason: 'taken', error: 'Username đã có người dùng — chọn tên khác.' }
    }

    return { available: true }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  2. completeUsernameMigration (legacy user → new handle)             */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Complete the forced username migration for an existing user.
 * Called from UsernameMigrationModal submit. Auth-required.
 *
 * Steps:
 *   1. Validate session
 *   2. Re-validate username pattern (server-side)
 *   3. Check uniqueness (cannot conflict with another user)
 *   4. Update user.username + set usernameSetByUser=true
 *   5. Audit log
 */
export async function completeUsernameMigration(
    newUsername: string,
): Promise<{ success: true } | { error: string }> {
    try {
        const session = await getSession()
        if (!session?.user?.id) return { error: 'Chưa đăng nhập.' }

        const username = (newUsername ?? '').trim()
        const validation = validateUsername(username)
        if (!validation.valid) return { error: validation.error ?? 'Username không hợp lệ.' }

        // Check uniqueness — exclude the user themselves (edge case: they
        // re-submit same username, which shouldn't happen since legacy is invalid,
        // but defensive guard).
        const existing = await prisma.user.findUnique({
            where: { username },
            select: { id: true },
        })
        if (existing && existing.id !== session.user.id) {
            return { error: 'Username đã có người dùng khác — chọn tên khác.' }
        }

        // Fetch current user to capture old username for audit
        const currentUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { username: true, usernameSetByUser: true },
        })
        if (!currentUser) return { error: 'User không tồn tại.' }

        // No-op if already correctly migrated (idempotency)
        if (currentUser.usernameSetByUser && currentUser.username === username) {
            return { success: true }
        }

        await prisma.user.update({
            where: { id: session.user.id },
            data: { username, usernameSetByUser: true },
        })

        // Best-effort audit log
        void audit({
            workspaceId: 'SYSTEM',
            actorUserId: session.user.id,
            action: 'user.username_migrated',
            targetType: 'User',
            targetId: session.user.id,
            before: { username: currentUser.username, usernameSetByUser: currentUser.usernameSetByUser },
            after: { username, usernameSetByUser: true },
        })

        // Revalidate any path that displays username
        revalidatePath('/', 'layout')
        return { success: true }
    } catch (err: any) {
        console.error('[completeUsernameMigration]', err)
        // Handle Prisma unique constraint as final fallback
        if (err?.code === 'P2002') return { error: 'Username đã có người dùng khác — chọn tên khác.' }
        return { error: err?.message ?? 'Lỗi khi cập nhật username.' }
    }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  3. updateMyUsername (settings change)                              */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Allow user to change their username from settings (post-migration).
 * Same validation rules as migration. Sets usernameSetByUser=true.
 */
export async function updateMyUsername(
    newUsername: string,
): Promise<{ success: true } | { error: string }> {
    // Same logic as migration — username field is already a clean handle
    return completeUsernameMigration(newUsername)
}

/* ──────────────────────────────────────────────────────────────────── */
/*  4. searchInviteCandidates (autocomplete)                            */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Search users by query string. Matches against username, email, displayName.
 * Excludes users already in the workspace + the calling user themselves.
 * Returns top 10 results.
 */
export async function searchInviteCandidates(
    workspaceId: string,
    query: string,
): Promise<Array<{
    id: string
    username: string
    displayName: string | null
    email: string | null
    avatarUrl: string | null
    role: string
}>> {
    try {
        const session = await getSession()
        if (!session?.user?.id || !workspaceId) return []

        const q = (query ?? '').trim()
        if (q.length < 1) return []

        // Get workspace's profile + existing members to exclude
        const ws = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { profileId: true },
        })
        if (!ws?.profileId) return []

        const existingMembers = await prisma.workspaceMember.findMany({
            where: { workspaceId },
            select: { userId: true },
        })
        const excludeIds = new Set([
            ...existingMembers.map((m) => m.userId),
            session.user.id,
        ])

        // Search in profile scope: home profile members OR users with ProfileAccess
        const candidates = await prisma.user.findMany({
            where: {
                OR: [
                    { profileId: ws.profileId },
                    { profileAccesses: { some: { profileId: ws.profileId } } },
                ],
                AND: [
                    {
                        OR: [
                            { username: { contains: q, mode: 'insensitive' } },
                            { displayName: { contains: q, mode: 'insensitive' } },
                            { email: { contains: q, mode: 'insensitive' } },
                        ],
                    },
                ],
                NOT: { id: { in: Array.from(excludeIds) } },
            },
            select: {
                id: true,
                username: true,
                displayName: true,
                email: true,
                avatarUrl: true,
                role: true,
            },
            take: 10,
            orderBy: [{ displayName: 'asc' }, { username: 'asc' }],
        })

        return candidates
    } catch (err) {
        console.error('[searchInviteCandidates]', err)
        return []
    }
}
