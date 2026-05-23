import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import crypto from 'crypto'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  if (!workspaceId) {
    return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 })
  }

  const clientId = process.env.DROPBOX_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'Dropbox integration not configured' }, { status: 500 })
  }

  // State parameter: JSON with userId + workspaceId, encrypted to prevent tampering
  const statePayload = JSON.stringify({
    userId: session.user.id,
    workspaceId,
    nonce: crypto.randomBytes(16).toString('hex'),
  })
  const state = Buffer.from(statePayload).toString('base64url')

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://hustlytasker.xyz'}/api/integrations/dropbox/callback`

  const authUrl = new URL('https://www.dropbox.com/oauth2/authorize')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('token_access_type', 'offline') // get refresh_token
  authUrl.searchParams.set('state', state)

  return NextResponse.redirect(authUrl.toString())
}
