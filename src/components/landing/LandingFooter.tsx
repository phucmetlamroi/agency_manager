'use client'

import { useLang } from './i18n'
import { scrollToId } from './Reveal'

export function LandingFooter() {
    const { t } = useLang()

    return (
        <footer className="footer">
            <div className="container foot-grid">
                <div className="foot-brand">
                    <button type="button" className="brand" onClick={() => scrollToId('top')} aria-label="HustlyTasker">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="mark" src="/logo.svg" alt="HustlyTasker" width={32} height={32} />
                        <span className="word">
                            Hustly<b>Tasker</b>
                        </span>
                    </button>
                    <p>{t.footer.tagline}</p>
                </div>

                <div className="foot-cols">
                    <div className="foot-col">
                        <h5>{t.footer.product}</h5>
                        <a href="#velox" onClick={(e) => { e.preventDefault(); scrollToId('velox') }}>Velox Deep Scan</a>
                        <a href="#features" onClick={(e) => { e.preventDefault(); scrollToId('features') }}>{t.footer.taskBoard}</a>
                        <a href="#features" onClick={(e) => { e.preventDefault(); scrollToId('features') }}>{t.footer.finance}</a>
                        <a href="#features" onClick={(e) => { e.preventDefault(); scrollToId('features') }}>{t.footer.clientPortal}</a>
                    </div>
                    <div className="foot-col">
                        <h5>{t.footer.company}</h5>
                        <a href="/signup">{t.footer.about}</a>
                        <a href="#stats" onClick={(e) => { e.preventDefault(); scrollToId('stats') }}>{t.nav.customers}</a>
                        <a href="/signup">{t.footer.careers}</a>
                    </div>
                    <div className="foot-col">
                        <h5>{t.footer.resources}</h5>
                        <a href="/signup">{t.footer.docs}</a>
                        <a href="/signup">{t.footer.pricing}</a>
                        <a href="/signup">{t.footer.support}</a>
                    </div>
                </div>
            </div>

            <div className="container foot-bottom">
                <span>{t.footer.copyright}</span>
                <span>{t.footer.built}</span>
            </div>
        </footer>
    )
}
