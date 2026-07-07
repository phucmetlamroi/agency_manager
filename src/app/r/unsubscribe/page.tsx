// [review-fixes P4/FR-11] Human-facing unsubscribe confirmation for review-update emails.
// The email footer links here (?token=). This page NEVER mutates on render — the unsubscribe write
// happens only when the user clicks Unsubscribe (POST via UnsubscribeConfirm) — so mail-security
// scanners / prefetchers that GET the footer link cannot silently unsubscribe the recipient.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { UnsubscribeConfirm } from './UnsubscribeConfirm'

export default async function UnsubscribePage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string }>
}) {
    const { token } = await searchParams

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
            <UnsubscribeConfirm token={token?.trim() || null} />
        </main>
    )
}
