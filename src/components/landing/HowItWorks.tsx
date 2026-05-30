'use client'

import { useLang } from './i18n'
import { Reveal } from './Reveal'

export function HowItWorks() {
    const { t } = useLang()

    return (
        <section className="sec" id="how">
            <div className="container">
                <Reveal className="sec-head">
                    <div className="sec-eyebrow">{t.how.eyebrow}</div>
                    <h2>
                        {t.how.h2a}
                        <br />
                        {t.how.h2b}
                    </h2>
                </Reveal>

                <div className="steps">
                    <Reveal className="step glass g2">
                        <div className="num">01</div>
                        <div className="sic">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M7 18a4.6 4.6 0 0 1-.3-9.2 6 6 0 0 1 11.5 1.5A4 4 0 0 1 18 18Z" />
                                <path d="M12 12v6M9 15l3-3 3 3" />
                            </svg>
                        </div>
                        <h3>{t.how.s1Title}</h3>
                        <p>{t.how.s1Desc}</p>
                    </Reveal>

                    <Reveal delay={0.08} className="step glass g2">
                        <div className="num">02</div>
                        <div className="sic">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="7" />
                                <path d="m20 20-3.5-3.5" />
                            </svg>
                        </div>
                        <h3>{t.how.s2Title}</h3>
                        <p>{t.how.s2Desc}</p>
                    </Reveal>

                    <Reveal delay={0.16} className="step glass g2">
                        <div className="num">03</div>
                        <div className="sic">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 11l3 3L22 4" />
                                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                            </svg>
                        </div>
                        <h3>{t.how.s3Title}</h3>
                        <p>{t.how.s3Desc}</p>
                    </Reveal>
                </div>
            </div>
        </section>
    )
}
