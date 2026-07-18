import { notFound } from 'next/navigation'
import { Fraunces, Hanken_Grotesk, Space_Mono } from 'next/font/google'
import '@/styles/portal-desk.css'
import DeskHarness from './DeskHarness'

/* DEV-ONLY preview of The Desk client portal with mock data. Gated out of
   production so it never ships as a public route. */

const fraunces = Fraunces({ variable: '--font-fraunces', subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600', '700'], display: 'swap' })
const hanken = Hanken_Grotesk({ variable: '--font-hanken', subsets: ['latin', 'vietnamese'], weight: ['300', '400', '500', '600', '700', '800'], display: 'swap' })
const spaceMono = Space_Mono({ variable: '--font-space-mono', subsets: ['latin'], weight: ['400', '700'], display: 'swap' })

export const dynamic = 'force-dynamic'

export default function DeskPreviewPage() {
    // Visible in local dev and on Vercel PREVIEW deploys (mock data only, no auth
    // bypass), but 404 on the real production domain.
    if (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview') notFound()
    return (
        <div
            lang="en"
            className={`portal-desk ${fraunces.variable} ${hanken.variable} ${spaceMono.variable}`}
            style={{ height: '100vh', width: '100%', overflow: 'hidden' }}
        >
            <DeskHarness />
        </div>
    )
}
