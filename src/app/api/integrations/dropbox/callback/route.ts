/**
 * [Quick Create] Dropbox OAuth2 Callback Route
 *
 * Handles the redirect from Dropbox after user authorizes the app.
 * Exchanges the authorization code for access/refresh tokens, encrypts
 * them at rest (AES-256-GCM), and upserts the IntegrationToken record.
 *
 * Flow: Dropbox redirects here with ?code=...&state=... after user consent.
 * The `state` param is base64url-encoded JSON containing { userId, workspaceId, nonce }
 * set during the /authorize step.
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { encryptToken } from '@/lib/token-encryption'
import { redirect } from 'next/navigation'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')

  // ---------------------------------------------------------------------------
  // 1. Validate required query params
  // ---------------------------------------------------------------------------
  if (!code || !stateParam) {
    // Missing code or state — cannot proceed with token exchange
    return NextResponse.json(
      { error: 'Missing code or state parameter' },
      { status: 400 },
    )
  }

  // ---------------------------------------------------------------------------
  // 2. Decode the state payload (base64url-encoded JSON)
  // ---------------------------------------------------------------------------
  let state: { userId: string; workspaceId: string; nonce: string }
  try {
    const decoded = Buffer.from(stateParam, 'base64url').toString('utf8')
    state = JSON.parse(decoded)
  } catch {
    return NextResponse.json(
      { error: 'Invalid state parameter' },
      { status: 400 },
    )
  }

  const { userId, workspaceId } = state

  if (!userId || !workspaceId) {
    return NextResponse.json(
      { error: 'Malformed state: missing userId or workspaceId' },
      { status: 400 },
    )
  }

  // ---------------------------------------------------------------------------
  // 3. Verify the session — ensure the current user matches the state
  // ---------------------------------------------------------------------------
  const session = await getSession()
  if (!session?.user?.id || session.user.id !== userId) {
    return NextResponse.json(
      { error: 'Unauthorized: session mismatch' },
      { status: 401 },
    )
  }

  // ---------------------------------------------------------------------------
  // 4–8. Token exchange, encryption, DB upsert, and redirect
  // ---------------------------------------------------------------------------
  try {
    // 4. Exchange authorization code for tokens
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/dropbox/callback`

    const tokenRes = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: process.env.DROPBOX_CLIENT_ID!,
        client_secret: process.env.DROPBOX_CLIENT_SECRET!,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text()
      console.error('[dropbox/callback] Token exchange failed:', tokenRes.status, errBody)
      redirect(`/${workspaceId}/admin/settings?tab=connectors&error=dropbox_failed`)
    }

    const tokenData = await tokenRes.json()
    const { access_token, refresh_token, expires_in } = tokenData

    // 5. Fetch the user's Dropbox email for display purposes
    let accountEmail: string | null = null
    try {
      const accountRes = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(null),
      })
      if (accountRes.ok) {
        const accountData = await accountRes.json()
        accountEmail = accountData.email ?? null
      }
    } catch (e) {
      // Non-fatal: we can still save the integration without the email
      console.warn('[dropbox/callback] Failed to fetch account email:', e)
    }

    // 6. Encrypt tokens at rest
    const encryptedAccess = encryptToken(access_token)
    const encryptedRefresh = refresh_token ? encryptToken(refresh_token) : null

    // Calculate token expiry
    const expiresAt = expires_in
      ? new Date(Date.now() + expires_in * 1000)
      : null

    // 7. Upsert the IntegrationToken record
    await prisma.integrationToken.upsert({
      where: {
        userId_workspaceId_provider: {
          userId,
          workspaceId,
          provider: 'dropbox',
        },
      },
      create: {
        userId,
        workspaceId,
        provider: 'dropbox',
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

    // 8. Redirect to settings page with success indicator
    redirect(`/${workspaceId}/admin/settings?tab=connectors&connected=dropbox`)
  } catch (error) {
    // Re-throw Next.js redirect errors (they use a special thrown object)
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      throw error
    }

    console.error('[dropbox/callback] Unexpected error:', error)
    redirect(`/${workspaceId}/admin/settings?tab=connectors&error=dropbox_failed`)
  }
}
