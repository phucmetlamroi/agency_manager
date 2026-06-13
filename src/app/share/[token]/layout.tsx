import { ReactNode } from 'react'
import type { Metadata } from 'next'
import { Fraunces, Hanken_Grotesk } from 'next/font/google'
// Calm-Dark theme shared with the (former) account portal — lives in
// src/styles so it survives the portal removal.
import '@/styles/portal-calm.css'

/**
 * [Atelier redesign 2026-06] The share portal gets its OWN typographic
 * identity — distinct from the staff app's Plus Jakarta Sans — so the client
 * room reads like a studio, not the admin tool: Fraunces (an editorial serif
 * with optical sizing) carries headlines + figures, Hanken Grotesk does the
 * working text. Both are scoped via CSS variables consumed in portal-calm.css.
 */
const fraunces = Fraunces({
    variable: '--font-fraunces',
    subsets: ['latin'],
    weight: ['400', '500', '600', '700'],
    style: ['normal'],
    display: 'swap',
})
const hanken = Hanken_Grotesk({
    variable: '--font-hanken',
    subsets: ['latin'],
    weight: ['400', '500', '600', '700', '800'],
    display: 'swap',
})

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
            <div
                className={`portal-calm ${fraunces.variable} ${hanken.variable}`}
                style={{ height: '100vh', width: '100%', overflow: 'hidden' }}
            >
                {children}
            </div>
        </>
    )
}
