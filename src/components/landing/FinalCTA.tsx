'use client'

import Link from 'next/link'
import { useLang } from './i18n'
import { Reveal, scrollToId } from './Reveal'

export function FinalCTA() {
    const { t } = useLang()

    return (
        <section className="final" id="cta">
            <div className="container">
                <Reveal className="cta-card glass g3">
                    <div className="glow-orb" />
                    <h2>{t.cta.h2}</h2>
                    <p>{t.cta.p}</p>
                    <div className="hero-cta">
                        <Link className="btn btn-primary btn-lg" href="/signup">
                            {t.cta.primary}
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 12h14M13 6l6 6-6 6" />
                            </svg>
                        </Link>
                        <button type="button" className="btn btn-ghost btn-lg" onClick={() => scrollToId('velox')}>
                            {t.cta.secondary}
                        </button>
                    </div>
                </Reveal>
            </div>
        </section>
    )
}
