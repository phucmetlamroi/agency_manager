// [review-fixes P4/FR-11] Human-facing unsubscribe confirmation for review-update emails.
// The email footer links here (?token=). Server-renders the unsubscribe (idempotent) + a small
// EN confirmation card. Self-contained styling — does not depend on the /r/[slug] share layout.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { unsubscribeGuestByToken } from '@/lib/review/guest-subscribe'

export default async function UnsubscribePage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string }>
}) {
    const { token } = await searchParams
    const done = !!token
    if (token) await unsubscribeGuestByToken(token)

    return (
        <main
            style={{
                minHeight: '100dvh',
                display: 'grid',
                placeItems: 'center',
                background: '#f3f4f6',
                padding: 24,
                fontFamily:
                    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
            }}
        >
            <div
                style={{
                    maxWidth: 440,
                    width: '100%',
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 16,
                    padding: '32px 28px',
                    textAlign: 'center',
                }}
            >
                <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 12 }}>{done ? '✓' : '—'}</div>
                <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>
                    {done ? 'Unsubscribed' : 'Nothing to do'}
                </h1>
                <p style={{ fontSize: 15, lineHeight: 1.6, color: '#374151', margin: 0 }}>
                    {done
                        ? "You won't receive any more email updates for this review. You can re-enable them anytime from the review page."
                        : 'This unsubscribe link is missing its token.'}
                </p>
            </div>
        </main>
    )
}
