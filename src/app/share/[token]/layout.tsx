import { ReactNode } from 'react'
import type { Metadata } from 'next'
import { Fraunces, Hanken_Grotesk, Space_Mono } from 'next/font/google'
// [The Desk 2026-07] Editorial Atelier · Print Edition — the light paper-and-ink
// studio room that replaces the former dark "calm" theme. Scoped under
// `.portal-desk` in src/styles so it never touches the staff app.
import '@/styles/portal-desk.css'

/**
 * The Desk gives the client room its OWN print identity — distinct from the
 * staff app — so it reads like a studio, not the admin tool: Fraunces (editorial
 * serif) carries headlines + figures, Hanken Grotesk the working text, Space
 * Mono the numerics / kickers / timecodes. All scoped via CSS variables consumed
 * in portal-desk.css.
 */
// [Vietnamese subset] Client/task names + portal copy can be Vietnamese, so the
// text faces must ship the `vietnamese` subset — otherwise next/font omits those
// glyphs and the browser falls back to a serif that detaches the dấu sắc/huyền
// on ô ă ê (ố→ô´). 'latin' alone was the bug. (Space Mono has no vi subset —
// it only ever renders ASCII numerics/kickers, so latin is correct there.)
const fraunces = Fraunces({
    variable: '--font-fraunces',
    subsets: ['latin', 'vietnamese'],
    weight: ['400', '500', '600', '700'],
    style: ['normal'],
    display: 'swap',
})
const hanken = Hanken_Grotesk({
    variable: '--font-hanken',
    subsets: ['latin', 'vietnamese'],
    weight: ['300', '400', '500', '600', '700', '800'],
    display: 'swap',
})
const spaceMono = Space_Mono({
    variable: '--font-space-mono',
    subsets: ['latin'],
    weight: ['400', '700'],
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
                lang="en"
                className={`portal-desk ${fraunces.variable} ${hanken.variable} ${spaceMono.variable}`}
                style={{ height: '100vh', width: '100%', overflow: 'hidden' }}
            >
                {children}
            </div>
        </>
    )
}
