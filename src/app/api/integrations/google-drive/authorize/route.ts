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

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'Google Drive integration not configured' }, { status: 500 })
  }

  const statePayload = JSON.stringify({
    userId: session.user.id,
    workspaceId,
    nonce: crypto.randomBytes(16).toString('hex'),
  })
  const state = Buffer.from(statePayload).toString('base64url')

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://hustlytasker.xyz'}/api/integrations/google-drive/callback`

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email')
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent') // force consent to always get refresh_token
  authUrl.searchParams.set('state', state)

  return NextResponse.redirect(authUrl.toString())
}
