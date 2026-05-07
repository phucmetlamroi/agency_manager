
import { Resend } from 'resend'

// Initialize with API Key (from env)
const API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'notification@agencymanager.com'

const resend = API_KEY ? new Resend(API_KEY) : null

interface EmailPayload {
    to: string
    subject: string
    html: string
}

/**
 * Sends an email using Resend.
 * Designed to be "Fire-and-Forget" (non-blocking) if awaited without return value,
 * but for reliability we will log errors.
 */
export async function sendEmail({ to, subject, html }: EmailPayload) {
    if (!resend || !API_KEY) {
        console.warn('⚠️ RESEND_API_KEY is missing. Email not sent.')
        return
    }

    try {
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to,
            subject,
            html,
        })

        if (error) {
            console.error('❌ Error sending email:', error)
            return
        }

        console.log(`✅ Email sent to ${to} (id: ${data?.id})`)
    } catch (error: any) {
        console.error('❌ Error sending email:', error)
    }
}
