'use client'

import { useLang } from './i18n'
import { Reveal } from './Reveal'

const hairline = 'var(--hairline)'

export function BentoPlatform() {
    const { t } = useLang()

    return (
        <section className="sec" id="features">
            <div className="container">
                <Reveal className="sec-head">
                    <div className="sec-eyebrow">{t.bento.eyebrow}</div>
                    <h2>
                        {t.bento.h2a}
                        <br />
                        {t.bento.h2b}
                    </h2>
                    <p>{t.bento.p}</p>
                </Reveal>

                <div className="bento">
                    {/* Task ops (wide) */}
                    <Reveal className="bento-card glass g2 span-3">
                        <div className="ic">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                                <path d="M14 17h7M17.5 14v7" />
                            </svg>
                        </div>
                        <h3>{t.bento.opsTitle}</h3>
                        <p>{t.bento.opsDesc}</p>
                        <div className="lifecycle">
                            <span className="lc-pill" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: hairline }}>
                                <span className="d" style={{ background: 'var(--accent)' }} />
                                Nhận task
                            </span>
                            <span className="lc-pill" style={{ background: 'rgba(255,184,76,.12)', color: 'var(--amber)', borderColor: hairline }}>
                                <span className="d" style={{ background: 'var(--amber)' }} />
                                Đang thực hiện
                            </span>
                            <span className="lc-pill" style={{ background: 'rgba(34,211,238,.12)', color: 'var(--cyan)', borderColor: hairline }}>
                                <span className="d" style={{ background: 'var(--cyan)' }} />
                                Review
                            </span>
                            <span className="lc-pill" style={{ background: 'rgba(168,85,247,.12)', color: 'var(--accent-2)', borderColor: hairline }}>
                                <span className="d" style={{ background: 'var(--accent-2)' }} />
                                Revision
                            </span>
                            <span className="lc-pill" style={{ background: 'rgba(48,209,88,.12)', color: 'var(--emerald)', borderColor: hairline }}>
                                <span className="d" style={{ background: 'var(--emerald)' }} />
                                Hoàn tất
                            </span>
                        </div>
                    </Reveal>

                    {/* CRM */}
                    <Reveal delay={0.08} className="bento-card glass g2 span-3">
                        <div className="ic">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" />
                            </svg>
                        </div>
                        <h3>{t.bento.crmTitle}</h3>
                        <p>{t.bento.crmDesc}</p>
                        <div className="lifecycle">
                            {['EN', 'VI', 'RU', 'IT', '中文'].map((l) => (
                                <span key={l} className="lc-pill" style={{ background: 'var(--glass-fill-thin)', color: 'var(--fg-2)', borderColor: hairline }}>
                                    {l}
                                </span>
                            ))}
                        </div>
                    </Reveal>

                    {/* Finance dual currency (wide) */}
                    <Reveal className="bento-card glass g2 span-4">
                        <div className="ic">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                            </svg>
                        </div>
                        <h3>{t.bento.finTitle}</h3>
                        <p>{t.bento.finDesc}</p>
                        <div className="fin-rows">
                            <div className="fin-row">
                                <span className="fc-name">{t.bento.finRow1}</span>
                                <span className="fc-amt">$4,200</span>
                                <span className="fc-cur cur-usd">USD</span>
                            </div>
                            <div className="fin-row">
                                <span className="fc-name">{t.bento.finRow2}</span>
                                <span className="fc-amt">18.500.000 đ</span>
                                <span className="fc-cur cur-vnd">VND</span>
                            </div>
                        </div>
                    </Reveal>

                    {/* KPI */}
                    <Reveal delay={0.16} className="bento-card glass g2 span-2">
                        <div className="ic">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 3v18h18" />
                                <path d="M7 14l3-4 3 3 4-6" />
                            </svg>
                        </div>
                        <h3>{t.bento.kpiTitle}</h3>
                        <p>{t.bento.kpiDesc}</p>
                        <div className="kpi-strip">
                            <div className="k">
                                <div className="n" style={{ color: '#FACC15' }}>
                                    S
                                </div>
                                <div className="l">{t.bento.kpiTopRank}</div>
                            </div>
                            <div className="k">
                                <div className="n">+12%</div>
                                <div className="l">{t.bento.kpiDelta}</div>
                            </div>
                        </div>
                    </Reveal>
                </div>
            </div>
        </section>
    )
}
