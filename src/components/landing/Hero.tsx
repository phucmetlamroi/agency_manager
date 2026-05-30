'use client'

import Link from 'next/link'
import { useLang } from './i18n'
import { Reveal, scrollToId } from './Reveal'
import { VeloxDemo } from './VeloxDemo'

export function Hero() {
    const { t } = useLang()

    return (
        <section className="hero" id="top">
            <div className="container hero-grid">
                <div className="hero-copy">
                    <Reveal>
                        <div className="eyebrow-badge">
                            <span className="tag">
                                <span className="pulse-dot" />
                                {t.hero.badgeTag}
                            </span>
                            {t.hero.badgeText}
                        </div>
                    </Reveal>

                    <Reveal delay={0.08}>
                        <h1>
                            {t.hero.h1a}
                            <br />
                            <span className="grad">{t.hero.h1b}</span>
                        </h1>
                    </Reveal>

                    <Reveal delay={0.16}>
                        <p className="lede">{t.hero.lede}</p>
                    </Reveal>

                    <Reveal delay={0.24}>
                        <div className="hero-cta">
                            <Link className="btn btn-primary btn-lg" href="/signup">
                                {t.hero.ctaPrimary}
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M5 12h14M13 6l6 6-6 6" />
                                </svg>
                            </Link>
                            <button type="button" className="btn btn-ghost btn-lg" onClick={() => scrollToId('velox')}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                                {t.hero.ctaSecondary}
                            </button>
                        </div>
                    </Reveal>

                    <Reveal delay={0.32}>
                        <div className="hero-meta">
                            <div className="item">
                                <span className="n">12,400+</span>
                                <span className="l">{t.hero.metaTasks}</span>
                            </div>
                            <div className="sep" />
                            <div className="item">
                                <span className="n">98%</span>
                                <span className="l">{t.hero.metaAccuracy}</span>
                            </div>
                            <div className="sep" />
                            <div className="item">
                                <span className="n">~9 hrs</span>
                                <span className="l">{t.hero.metaSaved}</span>
                            </div>
                        </div>
                    </Reveal>
                </div>

                <Reveal delay={0.16} className="hero-demo">
                    <VeloxDemo />
                </Reveal>
            </div>
        </section>
    )
}
