'use server'

/**
 * [Quick Create] Server actions for managing OAuth integrations (Dropbox + Google Drive).
 *
 * Handles listing connected integrations, disconnecting (with provider-side
 * token revocation), and refreshing expired tokens transparently.
 */

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { decryptToken } from '@/lib/token-encryption'
import { verifyWorkspaceAccess } from '@/lib/security'

/* ──────────────────────────────────────────────────────────────────── */
/*  Provider OAuth endpoints                                           */
/* ──────────────────────────────────────────────────────────────────── */

const DROPBOX_REVOKE_URL = 'https://api.dropboxapi.com/2/auth/token/revoke'
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
// [AUDIT R4 — fix] The OAuth *token* endpoints + refreshTokenIfNeeded moved to the
// server-only module src/lib/integration-tokens.ts so they are never exposed as a
// callable Server Action. Only the *revoke* endpoints (used by disconnect below) stay.

/* ──────────────────────────────────────────────────────────────────── */
/*  1. getConnectedIntegrations                                        */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * List all OAuth integrations the current user has connected in a workspace.
 * Returns provider metadata only — tokens are NEVER exposed to the client.
 *
 * No admin gate: users see their own connections only.
 */
export async function getConnectedIntegrations(workspaceId: string) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Unauthorized. No valid session.' }
    }

    const tokens = await prisma.integrationToken.findMany({
      where: { workspaceId, userId: session.user.id },
      select: {
        provider: true,
        accountEmail: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return tokens.map((t) => ({
      provider: t.provider,
      accountEmail: t.accountEmail,
      connectedAt: t.createdAt,
      updatedAt: t.updatedAt,
    }))
  } catch (err) {
    console.error('[integration-actions] getConnectedIntegrations error:', err)
    return { error: err instanceof Error ? err.message : 'Failed to fetch integrations.' }
  }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  2. disconnectIntegration                                           */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Disconnect an OAuth integration: revoke the token at the provider (best-effort),
 * then delete the IntegrationToken row from the database.
 *
 * Requires MEMBER role — users can disconnect their own integrations.
 */
export async function disconnectIntegration(workspaceId: string, provider: string) {
  try {
    const { userId } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')

    const tokenRow = await prisma.integrationToken.findUnique({
      where: {
        userId_workspaceId_provider: { userId, workspaceId, provider },
      },
    })

    if (!tokenRow) {
      return { error: 'Integration not found.' }
    }

    // Best-effort token revocation at the provider — don't fail if revoke errors
    try {
      const decryptedToken = decryptToken(tokenRow.accessToken)

      if (provider === 'dropbox') {
        await fetch(DROPBOX_REVOKE_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${decryptedToken}` },
        })
      } else if (provider === 'google_drive') {
        await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(decryptedToken)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      }
    } catch (revokeErr) {
      // Log but don't fail — token may already be invalid
      console.warn(`[integration-actions] Best-effort revoke failed for ${provider}:`, revokeErr)
    }

    // Delete the row regardless of revocation result
    await prisma.integrationToken.delete({ where: { id: tokenRow.id } })

    return { success: true }
  } catch (err) {
    console.error('[integration-actions] disconnectIntegration error:', err)
    return { error: err instanceof Error ? err.message : 'Failed to disconnect integration.' }
  }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  3. refreshTokenIfNeeded                                            */
/* ──────────────────────────────────────────────────────────────────── */

// [AUDIT R4 — fix] refreshTokenIfNeeded moved to src/lib/integration-tokens.ts
// (a 'server-only' module, NOT a 'use server' action file) so it can no longer be
// invoked as a public Server Action with attacker-supplied token ciphertext. The
// scan-folder route imports it from there.
