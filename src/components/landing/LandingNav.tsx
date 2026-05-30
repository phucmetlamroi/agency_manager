'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useLang } from './i18n'
import { scrollToId } from './Reveal'

export function LandingNav() {
    const { lang, setLang, t } = useLang()
    const [scrolled, setScrolled] = useState(false)

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 24)
        onScroll()
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [])

    return (
        <div className="nav-wrap">
            <nav
                className="nav glass g1"
                style={{
                    boxShadow: scrolled
                        ? 'var(--shadow-contact), 0 18px 50px -24px rgba(0,0,0,.7)'
                        : 'var(--shadow-contact), var(--shadow-ambient)',
                }}
            >
                <button type="button" className="brand" onClick={() => scrollToId('top')} aria-label="HustlyTasker">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="mark" src="/logo.svg" alt="HustlyTasker" width={32} height={32} />
                    <span className="word">
                        Hustly<b>Tasker</b>
                    </span>
                </button>

                <div className="nav-links">
                    <a href="#velox" onClick={(e) => { e.preventDefault(); scrollToId('velox') }}>{t.nav.velox}</a>
                    <a href="#features" onClick={(e) => { e.preventDefault(); scrollToId('features') }}>{t.nav.platform}</a>
                    <a href="#how" onClick={(e) => { e.preventDefault(); scrollToId('how') }}>{t.nav.how}</a>
                    <a href="#stats" onClick={(e) => { e.preventDefault(); scrollToId('stats') }}>{t.nav.customers}</a>
                </div>

                <div className="nav-right">
                    <div className="lang" role="group" aria-label="Language">
                        <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>
                            EN
                        </button>
                        <button type="button" className={lang === 'vi' ? 'on' : ''} onClick={() => setLang('vi')}>
                            VI
                        </button>
                    </div>
                    <Link className="nav-login" href="/login">
                        {t.nav.login}
                    </Link>
                    <Link className="btn btn-primary btn-sm" href="/signup">
                        {t.nav.tryFree}
                    </Link>
                </div>
            </nav>
        </div>
    )
}
