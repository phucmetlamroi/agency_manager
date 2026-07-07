// [review-fixes P4/FR-11] Client confirm for the unsubscribe page. The write happens ONLY on an
// explicit button click (POST /api/r/unsubscribe) — never on render — so email-security scanners /
// link prefetchers that GET the footer link can't silently unsubscribe the recipient (RFC 8058:
// one-click unsubscribe is POST-only). Idempotent + always neutral on the server side.
'use client'

import { useState } from 'react'

const card: React.CSSProperties = {
    maxWidth: 440,
    width: '100%',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 16,
    padding: '32px 28px',
    textAlign: 'center',
}

export function UnsubscribeConfirm({ token }: { token: string | null }) {
    const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')

    if (!token) {
        return (
            <div style={card}>
                <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 12 }}>—</div>
                <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>Nothing to do</h1>
                <p style={{ fontSize: 15, lineHeight: 1.6, color: '#374151', margin: 0 }}>
                    This unsubscribe link is missing its token.
                </p>
            </div>
        )
    }

    if (state === 'done') {
        return (
            <div style={card}>
                <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 12 }}>✓</div>
                <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>Unsubscribed</h1>
                <p style={{ fontSize: 15, lineHeight: 1.6, color: '#374151', margin: 0 }}>
                    You won&apos;t receive any more email updates for this review. You can re-enable them anytime from
                    the review page.
                </p>
            </div>
        )
    }

    const submit = async () => {
        setState('busy')
        try {
            const res = await fetch(`/api/r/unsubscribe?token=${encodeURIComponent(token)}`, {
                method: 'POST',
                headers: { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
            })
            setState(res.ok ? 'done' : 'error')
        } catch {
            setState('error')
        }
    }

    return (
        <div style={card}>
            <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 12 }}>✉︎</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>
                Turn off email updates?
            </h1>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: '#374151', margin: '0 0 20px' }}>
                Confirm below to stop receiving email updates for this review.
            </p>
            <button
                onClick={submit}
                disabled={state === 'busy'}
                style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 12,
                    border: 'none',
                    background: '#111827',
                    color: '#fff',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: state === 'busy' ? 'default' : 'pointer',
                    opacity: state === 'busy' ? 0.6 : 1,
                }}
            >
                {state === 'busy' ? 'Unsubscribing…' : 'Unsubscribe'}
            </button>
            {state === 'error' && (
                <p style={{ fontSize: 13, color: '#b91c1c', margin: '12px 0 0' }}>
                    Something went wrong. Please try again.
                </p>
            )}
        </div>
    )
}
