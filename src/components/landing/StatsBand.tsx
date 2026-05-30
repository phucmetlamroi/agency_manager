'use client'

import { useLang } from './i18n'
import { Reveal } from './Reveal'

export function StatsBand() {
    const { t } = useLang()

    return (
        <section className="sec" id="stats" style={{ paddingTop: 20 }}>
            <div className="container">
                <Reveal className="stats-band glass g2">
                    <div className="stats-grid">
                        <div className="stat">
                            <div className="n">
                                <span className="accent">12</span>k+
                            </div>
                            <div className="l">{t.stats.s1}</div>
                        </div>
                        <div className="stat">
                            <div className="n">
                                98<span className="accent">%</span>
                            </div>
                            <div className="l">{t.stats.s2}</div>
                        </div>
                        <div className="stat">
                            <div className="n">
                                320<span className="accent">+</span>
                            </div>
                            <div className="l">{t.stats.s3}</div>
                        </div>
                        <div className="stat">
                            <div className="n">5</div>
                            <div className="l">{t.stats.s4}</div>
                        </div>
                    </div>
                </Reveal>
            </div>
        </section>
    )
}
