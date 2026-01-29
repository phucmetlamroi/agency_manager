
import sgMail from '@sendgrid/mail'

// Initialize with API Key (from env)
const API_KEY = process.env.SENDGRID_API_KEY
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'notification@agencymanager.com'

if (API_KEY) {
    sgMail.setApiKey(API_KEY)
}

interface EmailPayload {
    to: string
    subject: string
    html: string
}

/**
 * Sends an email using SendGrid.
 * Designed to be "Fire-and-Forget" (non-blocking) if awaited without return value,
 * but for reliability we will log errors.
 */
export async function sendEmail({ to, subject, html }: EmailPayload) {
    if (!API_KEY) {
        console.warn('⚠️ SENDGRID_API_KEY is missing. Email not sent.')
        return
    }

    const msg = {
        to,
        from: FROM_EMAIL,
        subject,
        html,
    }

    try {
        await sgMail.send(msg)
        console.log(`✅ Email sent to ${to}`)
    } catch (error: any) {
        console.error('❌ Error sending email:', error)
        if (error.response) {
            console.error(error.response.body)
        }
    }
}
