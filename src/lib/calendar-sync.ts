/**
 * Scaffolding for Calendar Sync with Google & Microsoft Outlook
 *
 * Required Scopes:
 * Google: 'https://www.googleapis.com/auth/calendar'
 * Outlook: 'Calendars.ReadWrite'
 */

export async function generateAuthUrl(provider: 'google' | 'outlook', userId: string) {
    if (provider === 'google') {
        const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
        url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID || 'dummy_id')
        url.searchParams.set('redirect_uri', process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/callback/google')
        url.searchParams.set('response_type', 'code')
        url.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.events')
        url.searchParams.set('access_type', 'offline')
        url.searchParams.set('state', userId)
        return url.toString()
    }
  
    // Microsoft Graph
    const outlookUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
    outlookUrl.searchParams.set('client_id', process.env.MICROSOFT_CLIENT_ID || 'dummy_id')
    outlookUrl.searchParams.set('redirect_uri', process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3000/api/auth/callback/outlook')
    outlookUrl.searchParams.set('response_type', 'code')
    outlookUrl.searchParams.set('scope', 'Calendars.ReadWrite offline_access')
    outlookUrl.searchParams.set('state', userId)
    return outlookUrl.toString()
}

/**
 * Pushes a Task timeline down to the synced Calendar.
 */
export async function pushTaskToCalendar(
    userId: string, 
    taskId: string, 
    start: Date, 
    end: Date, 
    title: string,
    description?: string
) {
    console.log(`[Scaffold] Pushing Task ${taskId} "${title}" to synced calendar for user ${userId}.`)
    // TODO: 
    // 1. Fetch user's Calendar Credentials from DB
    // 2. Refresh Token if needed
    // 3. POST https://www.googleapis.com/calendar/v3/calendars/primary/events OR https://graph.microsoft.com/v1.0/me/events
    return true
}

/**
 * Create a subcription for webhooks so Google/MS pushes their updates to our API
 */
export async function subscribeToCalendarWebhooks(provider: 'google' | 'outlook', accessToken: string, calendarId: string = 'primary') {
    console.log(`[Scaffold] Subscribing to ${provider} webhooks on calendar ${calendarId}`)
    // POST /subscriptions etc.
}
