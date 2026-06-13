import { ReactNode } from 'react'
import type { Metadata } from 'next'
// Calm-Dark theme shared with the (former) account portal — lives in
// src/styles so it survives the portal removal.
import '@/styles/portal-calm.css'

/**
 * [Canonical Clients] PUBLIC layout for tokenized share links.
 * The token is in the URL → two non-negotiable protections:
 *   - robots noindex/nofollow: links must never land in a search index.
 *   - referrer-policy no-referrer (meta): outbound clicks (Frame.io, Drive…)
 *     must not leak the tokenized URL via the Referer header.
 */
export const metadata: Metadata = {
    title: 'Project Progress',
    robots: { index: false, follow: false },
}

export default function ShareLayout({ children }: { children: ReactNode }) {
    return (
        <>
            <meta name="referrer" content="no-referrer" />
            <div className="portal-calm" style={{ height: '100vh', width: '100%', overflow: 'hidden' }}>
                {children}
            </div>
        </>
    )
}
