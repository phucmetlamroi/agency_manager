import 'server-only'

import { prisma } from '@/lib/db'
import { encryptToken, decryptToken } from '@/lib/token-encryption'

/**
 * [AUDIT R4 — fix] Moved here OUT of the 'use server' integration-actions module.
 *
 * As an exported function in a 'use server' file, refreshTokenIfNeeded was registered
 * as a publicly-callable Server Action: any client could POST attacker-controlled
 * `tokenRow` ciphertext and have the server decrypt it (and even mint provider tokens)
 * with NO session/authz check. It must only be reachable from trusted server code (the
 * scan-folder route, which does its own auth + fetches the token row from the DB).
 * `import 'server-only'` turns any accidental client import into a build error.
 */

const DROPBOX_TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

/**
 * Check if an OAuth access token is expired (or about to expire within 5 minutes)
 * and refresh it if needed. Called by the scan-folder API with an already-fetched,
 * already-authorized token row.
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
