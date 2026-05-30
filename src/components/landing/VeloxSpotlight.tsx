'use client'

import { useLang } from './i18n'
import { Reveal } from './Reveal'

const FileGlyph = () => (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path d="M5 8a2 2 0 0 1 2-2h7l5 5v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" />
    </svg>
)
const Check = () => (
    <svg className="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
        <path d="M5 13l4 4L19 7" />
    </svg>
)

export function VeloxSpotlight() {
    const { t } = useLang()

    return (
        <section className="sec velox-spot" id="velox">
            <div className="container">
                <Reveal className="sec-head">
                    <div className="sec-eyebrow">{t.spot.eyebrow}</div>
                    <h2>
                        {t.spot.h2a}
                        <br />
                        {t.spot.h2b}
                    </h2>
                    <p>{t.spot.p}</p>
                </Reveal>

                <div className="spot-grid">
                    {/* LEFT: cloud + folder */}
                    <Reveal className="spot-panel glass g2">
                        <div className="spot-cloud-head">
                            <div className="cloud-chip on">
                                <span className="dot" />
                                Google Drive
                            </div>
                            <div className="cloud-chip">Dropbox</div>
                            <div className="cloud-chip">OneDrive</div>
                        </div>
                        <div className="vd-tree" style={{ background: 'var(--glass-fill-thin)', border: '1px solid var(--hairline)' }}>
                            <div className="file folder">
                                <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                                </svg>
                                <span className="name">Acme_Q3_Launch</span>
                                <span className="sz">6 files</span>
                            </div>
                            {[
                                { n: 'Acme_Launch_v3.prproj', s: '2.4 GB' },
                                { n: 'VO_script_FINAL.docx', s: '38 KB' },
                                { n: 'thumb_options.psd', s: '142 MB' },
                            ].map((f) => (
                                <div className="file indent done" key={f.n}>
                                    <FileGlyph />
                                    <span className="name">{f.n}</span>
                                    <span className="sz">{f.s}</span>
                                    <Check />
                                </div>
                            ))}
                        </div>
                        <div className="spot-stat-row">
                            <div className="spot-stat">
                                <div className="n">7</div>
                                <div className="l">{t.spot.statPatterns}</div>
                            </div>
                            <div className="spot-stat">
                                <div className="n">9</div>
                                <div className="l">{t.spot.statColumns}</div>
                            </div>
                            <div className="spot-stat">
                                <div className="n">0</div>
                                <div className="l">{t.spot.statManual}</div>
                            </div>
                        </div>
                    </Reveal>

                    {/* RIGHT: reasoning */}
                    <Reveal delay={0.16} className="spot-panel glass g2">
                        <div className="vd-col-label" style={{ marginBottom: 6 }}>
                            {t.spot.why}
                        </div>
                        {t.spot.reasons.map((r) => (
                            <div className="reason-row" key={r.code}>
                                <div className="pcode">{r.code}</div>
                                <div className="rtext">
                                    <div className="rtitle">{r.title}</div>
                                    <div className="rdesc" dangerouslySetInnerHTML={{ __html: r.desc }} />
                                </div>
                                <div className="rconf">{r.conf}</div>
                            </div>
                        ))}
                    </Reveal>
                </div>
            </div>
        </section>
    )
}
