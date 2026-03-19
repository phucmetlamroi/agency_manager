import { NextResponse } from 'next/server'
import { createScheduleException } from '@/actions/schedule-actions'

/**
 * Webhook Endpoint to receive push notifications from Google Calendar and Microsoft Graph.
 * Identifies "Busy" events and automatically creates ScheduleException (BLOCK) in the DB.
 */
export async function POST(req: Request) {
  try {
    // 1. Verify Webhook Validity (Google uses pre-registered UUIDs or JWTs, Microsoft uses validationTokens)
    // const authHeader = req.headers.get('authorization')
    
    // For Microsoft Graph Setup Validation
    const url = new URL(req.url)
    const validationToken = url.searchParams.get('validationToken')
    if (validationToken) {
      return new NextResponse(validationToken, { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }

    const body = await req.json()
    console.log("[Calendar Webhook] Payload received:", body)

    // TODO: Map remote calendar resource ID to internal userId
    const dummyUserId = "find-user-id-by-remote-resource"

    // TODO: Parse the event details (startTime, endTime, showAs)
    /*
      if (remoteEvent.showAs === 'busy' || remoteEvent.showAs === 'oof') {
         await createScheduleException(
            workspaceId, 
            profileId, 
            dummyUserId, 
            new Date(remoteEvent.start.dateTime), 
            format(remoteEvent.start.dateTime, 'HH:mm'), 
            format(remoteEvent.end.dateTime, 'HH:mm'), 
            'BLOCK', 
            `Symced from ${body.provider || 'Calendar'}`
         )
      }
    */

    return NextResponse.json({ success: true, message: 'Webhook processed' })
  } catch (error: any) {
    console.error("[Calendar Webhook] Error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
