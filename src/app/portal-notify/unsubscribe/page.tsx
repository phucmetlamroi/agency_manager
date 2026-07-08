'use client'

// [Phase C] Confirm page for portal notify-email unsubscribe. GET renders a button (never
// mutates); the button calls the server action to clear the email. English (client-facing).
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { unsubscribePortalNotify } from '@/actions/share-portal-actions'

function UnsubscribeInner() {
    const token = useSearchParams().get('token') || ''
    const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')

    async function run() {
        if (state === 'busy') return
        setState('busy')
        try {
            const res = await unsubscribePortalNotify(token)
            setState(res.success ? 'done' : 'error')
        } catch {
            setState('error')
        }
    }

    return (
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
            {state === 'done' ? (
                <>
                    <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 10px' }}>You&apos;re unsubscribed</h1>
                    <p style={{ fontSize: 14, lineHeight: 1.6, color: '#a1a1aa', margin: 0 }}>
                        You&apos;ll no longer receive review update emails. You can re-add your email anytime from your client portal.
                    </p>
                </>
            ) : (
                <>
                    <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 10px' }}>Unsubscribe from updates</h1>
                    <p style={{ fontSize: 14, lineHeight: 1.6, color: '#a1a1aa', margin: '0 0 20px' }}>
                        Stop receiving email updates about your video reviews.
                    </p>
                    {state === 'error' && (
                        <p style={{ fontSize: 13, color: '#f87171', margin: '0 0 14px' }}>
                            This link is invalid or already used.
                        </p>
                    )}
                    <button
                        onClick={run}
                        disabled={state === 'busy' || !token}
                        style={{
                            padding: '10px 22px', borderRadius: 10, border: 'none', cursor: 'pointer',
                            background: '#7C3AED', color: '#fff', fontWeight: 700, fontSize: 14, opacity: state === 'busy' ? 0.6 : 1,
                        }}
                    >
                        {state === 'busy' ? 'Unsubscribing…' : 'Unsubscribe'}
                    </button>
                </>
            )}
        </div>
    )
}

export default function PortalNotifyUnsubscribePage() {
    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#0e0e11', color: '#e4e4e7', fontFamily: 'system-ui, sans-serif', padding: 24,
        }}>
            <Suspense fallback={null}>
                <UnsubscribeInner />
            </Suspense>
        </div>
    )
}
