'use server'

/**
 * [Quick Create] Server actions for managing OAuth integrations (Dropbox + Google Drive).
 *
 * Handles listing connected integrations, disconnecting (with provider-side
 * token revocation), and refreshing expired tokens transparently.
 */

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { encryptToken, decryptToken } from '@/lib/token-encryption'
import { verifyWorkspaceAccess } from '@/lib/security'

/* ──────────────────────────────────────────────────────────────────── */
/*  Provider OAuth endpoints                                           */
/* ──────────────────────────────────────────────────────────────────── */

const DROPBOX_REVOKE_URL = 'https://api.dropboxapi.com/2/auth/token/revoke'
const DROPBOX_TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token'
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

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

/**
 * Check if an OAuth access token is expired (or about to expire within 5 minutes)
 * and refresh it if needed. Called internally by scan-folder API with an
 * already-fetched token row — does NOT need session verification.
 *
 * @param tokenRow - The IntegrationToken row (with encrypted tokens).
 * @returns The decrypted, valid access token string.
 * @throws If the token is expired and cannot be refreshed.
 */
export async function refreshTokenIfNeeded(tokenRow: {
  id: string
  provider: string
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
}): Promise<string> {
  const FIVE_MINUTES_MS = 5 * 60 * 1000
  const isExpiredOrSoon =
    tokenRow.expiresAt && tokenRow.expiresAt <= new Date(Date.now() + FIVE_MINUTES_MS)

  // Token still valid — decrypt and return directly
  if (!isExpiredOrSoon) {
    return decryptToken(tokenRow.accessToken)
  }

  // Token expired but no refresh token available
  if (!tokenRow.refreshToken) {
    throw new Error('Token expired and no refresh token available')
  }

  const decryptedRefreshToken = decryptToken(tokenRow.refreshToken)

  let tokenEndpoint: string
  let clientId: string
  let clientSecret: string

  if (tokenRow.provider === 'dropbox') {
    tokenEndpoint = DROPBOX_TOKEN_URL
    clientId = process.env.DROPBOX_CLIENT_ID ?? ''
    clientSecret = process.env.DROPBOX_CLIENT_SECRET ?? ''
  } else if (tokenRow.provider === 'google_drive') {
    tokenEndpoint = GOOGLE_TOKEN_URL
    clientId = process.env.GOOGLE_CLIENT_ID ?? ''
    clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? ''
  } else {
    throw new Error(`Unsupported provider for token refresh: ${tokenRow.provider}`)
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: decryptedRefreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown')
    throw new Error(
      `Token refresh failed for ${tokenRow.provider}: ${response.status} — ${errorText}`,
    )
  }

  const data = await response.json()
  const newAccessToken: string = data.access_token
  const expiresIn: number = data.expires_in // seconds

  if (!newAccessToken) {
    throw new Error(`Token refresh response missing access_token for ${tokenRow.provider}`)
  }

  // Encrypt the new access token and persist
  const encryptedNewToken = encryptToken(newAccessToken)

  await prisma.integrationToken.update({
    where: { id: tokenRow.id },
    data: {
      accessToken: encryptedNewToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    },
  })

  return newAccessToken
}
