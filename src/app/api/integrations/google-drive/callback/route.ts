/**
 * [Quick Create] Google Drive OAuth2 Callback Route
 *
 * Handles the redirect from Google's OAuth consent screen after the user
 * grants (or denies) access to their Google Drive.
 *
 * Flow:
 *   1. Google redirects here with `?code=...&state=...`
 *   2. Decode `state` (base64url JSON: { userId, workspaceId, nonce })
 *   3. Verify the current session matches state.userId (CSRF protection)
 *   4. Exchange the authorization code for access + refresh tokens
 *   5. Fetch the user's Google email for display purposes
 *   6. Encrypt tokens at rest (AES-256-GCM) and upsert IntegrationToken
 *   7. Redirect back to connector settings with success/error indicator
 */

import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { encryptToken } from '@/lib/token-encryption'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')

  // ---------------------------------------------------------------------------
  // 1. Parse and validate state parameter
  // ---------------------------------------------------------------------------
  if (!code || !stateParam) {
    // User denied consent or missing params — redirect with error
    return NextResponse.redirect(
      new URL('/admin/settings?tab=connectors&error=google_drive_failed', req.url),
    )
  }

  let state: { userId: string; workspaceId: string; nonce: string }
  try {
    const decoded = Buffer.from(stateParam, 'base64url').toString('utf8')
    state = JSON.parse(decoded)
  } catch {
    return NextResponse.redirect(
      new URL('/admin/settings?tab=connectors&error=google_drive_failed', req.url),
    )
  }

  const { userId, workspaceId } = state

  if (!userId || !workspaceId) {
    return NextResponse.redirect(
      new URL('/admin/settings?tab=connectors&error=google_drive_failed', req.url),
    )
  }

  // Error redirect helper — always routes to the workspace settings page
  const errorUrl = `/${workspaceId}/admin/settings?tab=connectors&error=google_drive_failed`

  try {
    // -------------------------------------------------------------------------
    // 2. Verify session — the logged-in user must match the state.userId
    // -------------------------------------------------------------------------
    const session = await getSession()
    if (!session?.user?.id || session.user.id !== userId) {
      return redirect(errorUrl)
    }

    // -------------------------------------------------------------------------
    // 3. Exchange authorization code for tokens
    // -------------------------------------------------------------------------
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google-drive/callback`

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenRes.ok) {
      console.error(
        '[google-drive/callback] Token exchange failed:',
        tokenRes.status,
        await tokenRes.text(),
      )
      return redirect(errorUrl)
    }

    const tokenData = await tokenRes.json() as {
      access_token: string
      refresh_token?: string
      expires_in: number
      token_type: string
    }

    // -------------------------------------------------------------------------
    // 4. Fetch the user's Google email for display
    // -------------------------------------------------------------------------
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })

    let accountEmail: string | null = null
    if (userInfoRes.ok) {
      const userInfo = await userInfoRes.json() as { email?: string }
      accountEmail = userInfo.email ?? null
    }

    // -------------------------------------------------------------------------
    // 5. Encrypt tokens at rest and calculate expiry
    // -------------------------------------------------------------------------
    const encryptedAccess = encryptToken(tokenData.access_token)
    const encryptedRefresh = tokenData.refresh_token
      ? encryptToken(tokenData.refresh_token)
      : null
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000)

    // -------------------------------------------------------------------------
    // 6. Upsert IntegrationToken (one Google Drive connection per user per workspace)
    // -------------------------------------------------------------------------
    await prisma.integrationToken.upsert({
      where: {
        userId_workspaceId_provider: {
          userId,
          workspaceId,
          provider: 'google_drive',
        },
      },
      create: {
        userId,
        workspaceId,
        provider: 'google_drive',
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        expiresAt,
        accountEmail,
      },
      update: {
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        expiresAt,
        accountEmail,
        updatedAt: new Date(),
      },
    })

    // -------------------------------------------------------------------------
    // 7. Success — redirect back to connector settings
    // -------------------------------------------------------------------------
    return redirect(
      `/${workspaceId}/admin/settings?tab=connectors&connected=google_drive`,
    )
  } catch (error) {
    console.error('[google-drive/callback] Unexpected error:', error)
    return redirect(errorUrl)
  }
}
