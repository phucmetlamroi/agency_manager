/**
 * Google OAuth Sign-In helpers.
 *
 * Reuses the same GOOGLE_CLIENT_ID/SECRET as the Google Drive integration.
 * The sign-in flow (src/app/api/auth/google/*) exchanges the auth code for an
 * access token, reads the user's verified email/profile, then finds/links/creates
 * a User and hands off to login()/loginWithProfile() in src/lib/auth.ts.
 *
 * Account model:
 *   - returning Google user  → matched by googleId
 *   - existing email account → LINKED (set googleId, authProvider, emailVerified)
 *   - brand-new              → create Profile + User + Workspace + OWNER memberships
 *     (mirrors signup-actions.ts), no password, emailVerified=true, a temporary
 *     username handle + usernameSetByUser=false so the existing
 *     UsernameMigrationModal forces the user to pick a real handle on first load.
 */

import { prisma } from '@/lib/db'
import { randomBytes } from 'crypto'
import { findUserByEmailOrUsername } from '@/lib/user-lookup'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

export interface GoogleUserInfo {
    googleId: string
    email: string
    verifiedEmail: boolean
    name: string | null
    picture: string | null
}

export interface GoogleAuthUser {
    id: string
    username: string
    role: string
    profileId: string | null
    sessionVersion: number
    email: string | null
    displayName: string | null
    hasCompletedEmailMigration: boolean
    isNew: boolean
}

/** Canonical redirect URI — must be registered in Google Cloud Console. */
export function getGoogleRedirectUri(): string {
    const base = process.env.NEXT_PUBLIC_APP_URL || 'https://hustlytasker.xyz'
    return `${base}/api/auth/google/callback`
}

/** Exchange the OAuth `code` for an access token. Returns null on failure. */
export async function exchangeCodeForToken(code: string): Promise<string | null> {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    if (!clientId || !clientSecret) {
        console.error('[google-auth] missing GOOGLE_CLIENT_ID/SECRET')
        return null
    }

    try {
        const res = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                grant_type: 'authorization_code',
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: getGoogleRedirectUri(),
            }),
        })
        if (!res.ok) {
            console.error('[google-auth] token exchange failed:', res.status, await res.text().catch(() => ''))
            return null
        }
        const data = (await res.json()) as { access_token?: string }
        return data.access_token ?? null
    } catch (e) {
        console.error('[google-auth] token exchange error:', e)
        return null
    }
}

/** Fetch the Google profile (email + name + picture) using the access token. */
export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo | null> {
    try {
        const res = await fetch(GOOGLE_USERINFO_URL, {
            headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) {
            console.error('[google-auth] userinfo failed:', res.status)
            return null
        }
        const u = (await res.json()) as {
            id?: string
            email?: string
            verified_email?: boolean
            name?: string
            picture?: string
        }
        if (!u.id || !u.email) return null
        return {
            googleId: u.id,
            email: u.email.trim().toLowerCase(),
            verifiedEmail: u.verified_email === true,
            name: u.name?.trim() || null,
            picture: u.picture || null,
        }
    } catch (e) {
        console.error('[google-auth] userinfo error:', e)
        return null
    }
}

function generateTempHandle(): string {
    // e.g. "g_a1b2c3d4e5f6" — only a placeholder; usernameSetByUser=false forces
    // the migration modal so the user picks a real handle on first dashboard load.
    return `g_${randomBytes(6).toString('hex')}`
}

function toAuthUser(u: {
    id: string
    username: string
    role: string
    profileId: string | null
    sessionVersion: number
    email: string | null
    displayName: string | null
    hasCompletedEmailMigration: boolean
}, isNew: boolean): GoogleAuthUser {
    return {
        id: u.id,
        username: u.username,
        role: u.role,
        profileId: u.profileId ?? null,
        sessionVersion: u.sessionVersion ?? 0,
        email: u.email ?? null,
        displayName: u.displayName ?? null,
        hasCompletedEmailMigration: u.hasCompletedEmailMigration ?? true,
        isNew,
    }
}

/**
 * Find by googleId → else link by verified email → else create a fresh
 * account (Profile + User + Workspace + OWNER). Caller MUST ensure the email
 * is verified by Google before calling.
 */
export async function findOrCreateGoogleUser(info: GoogleUserInfo): Promise<GoogleAuthUser> {
    // 1) Returning Google user
    const byGoogle = await prisma.user.findFirst({ where: { googleId: info.googleId } })
    if (byGoogle) return toAuthUser(byGoogle as any, false)

    // 2) Existing account with the same (verified) email → link.
    // [AUDIT OAUTH-LINK-001 — fix HIGH] User.email is NOT @unique (duplicate rows exist on prod);
    // a raw findFirst({where:{email}}) returned a NON-DETERMINISTIC row and could burn the unique
    // googleId onto an arbitrary duplicate — a LOCKED/CLIENT row (permanent OAuth lock-out) or a
    // foreign-tenant row (silent wrong-account login). Route through the deterministic R1 helper,
    // REFUSE on ambiguity (matchCount>1), and NEVER write googleId onto a LOCKED/CLIENT row.
    const lookup = await findUserByEmailOrUsername<{
        id: string; role: string; username: string; profileId: string | null;
        sessionVersion: number; email: string | null; displayName: string | null;
        hasCompletedEmailMigration: boolean; emailVerifiedAt: Date | null; avatarUrl: string | null;
    }>(info.email, {
        id: true, role: true, username: true, profileId: true, sessionVersion: true,
        email: true, displayName: true, hasCompletedEmailMigration: true,
        emailVerifiedAt: true, avatarUrl: true,
    })
    if (lookup.matchCount > 1) {
        // Ambiguous: >1 account shares this email. Refuse to bind the Google identity rather than
        // pick non-deterministically (callback catches → /login?error=google). Consolidate dupes first.
        throw new Error('[google-auth] ambiguous email — multiple accounts share it; refusing to link')
    }
    const byEmail = lookup.user
    if (byEmail) {
        // Never burn the unique googleId onto a banned (LOCKED) or view-only (CLIENT) row — that
        // permanently locks the identity to a dead account. Return as-is so the callback role gate
        // redirects (account_locked / client_account) WITHOUT having mutated anything.
        if (byEmail.role === 'LOCKED' || byEmail.role === 'CLIENT') {
            return toAuthUser(byEmail as any, false)
        }
        const linked = await prisma.user.update({
            where: { id: byEmail.id },
            data: {
                googleId: info.googleId,
                authProvider: 'google',
                emailVerified: true,
                emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
                avatarUrl: byEmail.avatarUrl ?? info.picture,
            },
        })
        return toAuthUser(linked as any, false)
    }

    // 3) Brand-new → mirror signup-actions.ts account bootstrap (no password)
    const displayName = info.name || info.email.split('@')[0]
    for (let attempt = 0; attempt < 3; attempt++) {
        const handle = generateTempHandle()
        try {
            const created = await prisma.$transaction(async (tx) => {
                const profile = await tx.profile.create({
                    data: { name: `${displayName}'s Profile` },
                    select: { id: true },
                })
                const user = await tx.user.create({
                    data: {
                        username: handle,
                        usernameSetByUser: false, // → triggers UsernameMigrationModal
                        password: null,
                        googleId: info.googleId,
                        authProvider: 'google',
                        email: info.email,
                        avatarUrl: info.picture,
                        role: 'USER',
                        profileId: profile.id,
                        displayName,
                        emailVerified: true,
                        emailVerifiedAt: new Date(),
                        hasCompletedEmailMigration: true,
                        sessionVersion: 0,
                    },
                })
                const workspace = await tx.workspace.create({
                    data: { name: `${displayName}'s Workspace`, profileId: profile.id, status: 'ACTIVE' },
                    select: { id: true },
                })
                await tx.workspaceMember.create({
                    data: { userId: user.id, workspaceId: workspace.id, role: 'OWNER' },
                })
                await tx.profileAccess.create({
                    data: { userId: user.id, profileId: profile.id, role: 'OWNER' },
                })
                return user
            })
            return toAuthUser(created as any, true)
        } catch (e: any) {
            if (e?.code === 'P2002') {
                // Concurrent sign-in created the same googleId → use that record.
                const racer = await prisma.user.findFirst({ where: { googleId: info.googleId } })
                if (racer) return toAuthUser(racer as any, false)
                // Otherwise it was a temp-handle collision → retry with a new handle.
                if (attempt < 2) continue
            }
            throw e
        }
    }
    throw new Error('[google-auth] failed to create user after retries')
}
