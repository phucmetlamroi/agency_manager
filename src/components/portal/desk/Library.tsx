'use client'

/* THE DESK — Files & masters. Approved folders + delivered originals from the
   review module, via the token-scoped documents adapter. Multi-select →
   presigned download (15-min TTL, server re-checks scope every call). */

import { useEffect, useMemo, useState } from 'react'
import { Folder, ChevronRight, FileVideo, FileImage, FileArchive, Download, Play, Loader } from 'lucide-react'
import { Kicker, Empty, useToast } from './ui'
import { fmtDate } from '../calm/format'
import type { DeliverableActions, DocumentsSnapshot, DocumentFolder } from '../calm/types'

function fmtBytes(raw: string | number): string {
    const n = Number(raw || 0)
    if (!n) return '—'
    const u = ['B', 'KB', 'MB', 'GB', 'TB']
    let i = 0, v = n
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`
}

export default function Library({ actions }: { actions: DeliverableActions }) {
    const toast = useToast()
    const [snap, setSnap] = useState<DocumentsSnapshot | null>(null)
    const [loading, setLoading] = useState(true)
    const [folderId, setFolderId] = useState<string | null>(null)
    const [sel, setSel] = useState<Set<string>>(new Set())
    const [downloading, setDownloading] = useState(false)

    useEffect(() => {
        let alive = true
        if (!actions.documents) { setLoading(false); return }
        actions.documents().then(s => { if (alive) { setSnap(s); setLoading(false) } }).catch(() => { if (alive) setLoading(false) })
        return () => { alive = false }
        // eslint-disable-next-line
    }, [])

    const folders = useMemo(() => (snap?.folders || []).filter(f => f.parentId === folderId), [snap, folderId])
    const assets = useMemo(() => (snap?.assets || []).filter(a => a.folderId === folderId), [snap, folderId])
    const crumbs = useMemo(() => {
        const out: DocumentFolder[] = []
        let cur = folderId
        const map = new Map((snap?.folders || []).map(f => [f.id, f]))
        while (cur) { const f = map.get(cur); if (!f) break; out.unshift(f); cur = f.parentId }
        return out
    }, [snap, folderId])

    const toggle = (versionId: string) => {
        setSel(prev => { const n = new Set(prev); n.has(versionId) ? n.delete(versionId) : n.add(versionId); return n })
    }

    const download = async () => {
        if (!actions.downloadDocuments || sel.size === 0 || downloading) return
        setDownloading(true)
        const res = await actions.downloadDocuments(Array.from(sel))
        setDownloading(false)
        if (res.success && res.files) {
            for (const f of res.files) {
                const a = document.createElement('a')
                a.href = f.url; a.download = f.fileName; a.rel = 'noopener'
                document.body.appendChild(a); a.click(); a.remove()
            }
            toast('ok', `${res.files.length} file${res.files.length === 1 ? '' : 's'} downloading.`)
            setSel(new Set())
        } else toast('err', res.error || 'Could not prepare the download.')
    }

    if (loading) {
        return (
            <main style={{ padding: '26px 30px' }}>
                <h1 className="desk-display" style={{ fontSize: '1.6rem', margin: '0 0 20px' }}>Files &amp; masters</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-3)' }}>
                    <Loader size={16} className="desk-spin" /> <span style={{ fontSize: '0.86rem' }}>Opening the library…</span>
                </div>
            </main>
        )
    }

    const empty = !snap || (folders.length === 0 && assets.length === 0)

    return (
        <main style={{ padding: '26px 30px', minHeight: 'calc(100vh - 58px)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 4, flexWrap: 'wrap' }}>
                <h1 className="desk-display" style={{ fontSize: '1.6rem', margin: 0 }}>Files &amp; masters</h1>
                {snap && <span className="desk-mono" style={{ fontSize: '0.7rem', color: 'var(--ink-3)' }}>{snap.summary.assetCount} FILES · {fmtBytes(snap.summary.totalBytes)}</span>}
            </div>
            <p style={{ fontSize: '0.88rem', color: 'var(--ink-2)', margin: '0 0 20px' }}>Approved folders and delivered originals — download one file or a whole set.</p>

            {/* Breadcrumb */}
            {(crumbs.length > 0) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                    <button onClick={() => setFolderId(null)} className="desk-mono" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: '0.7rem', padding: 0, letterSpacing: '0.06em' }}>ALL</button>
                    {crumbs.map(c => (
                        <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <ChevronRight size={12} style={{ color: 'var(--ink-3)' }} />
                            <button onClick={() => setFolderId(c.id)} className="desk-mono" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-2)', fontSize: '0.7rem', padding: 0, letterSpacing: '0.06em' }}>{c.name.toUpperCase()}</button>
                        </span>
                    ))}
                </div>
            )}

            {empty ? (
                <Empty icon={Folder} title="Nothing here yet" sub="Files appear the moment a cut is approved — originals, not previews." />
            ) : (
                <>
                    {folders.length > 0 && (
                        <>
                            <Kicker style={{ marginBottom: 10 }}>Folders · {folders.length}</Kicker>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 26 }}>
                                {folders.map(f => (
                                    <button key={f.id} onClick={() => setFolderId(f.id)} style={{ border: '1px solid var(--hairline)', background: 'var(--paper-raised)', padding: '16px 18px', display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', textAlign: 'left', borderRadius: 4 }}>
                                        <Folder size={20} style={{ color: 'var(--ink-2)', flexShrink: 0 }} />
                                        <span style={{ minWidth: 0, flex: 1 }}>
                                            <p className="desk-truncate" style={{ margin: 0, fontWeight: 600, fontSize: '0.88rem' }}>{f.name}</p>
                                            <p className="desk-mono" style={{ fontSize: '0.6rem', color: 'var(--ink-3)', margin: '2px 0 0' }}>{f.itemCount} item{f.itemCount === 1 ? '' : 's'} · {fmtBytes(f.totalBytes)}</p>
                                        </span>
                                        <ChevronRight size={14} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    {assets.length > 0 && (
                        <>
                            <Kicker style={{ marginBottom: 10 }}>Files · {assets.length}</Kicker>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
                                {assets.map(a => {
                                    const on = sel.has(a.currentVersion.id)
                                    const Icon = a.mediaKind === 'video' ? FileVideo : a.mediaKind === 'image' ? FileImage : FileArchive
                                    return (
                                        <div key={a.id} onClick={() => toggle(a.currentVersion.id)} style={{ border: '1px solid ' + (on ? 'var(--accent)' : 'var(--hairline)'), background: on ? 'var(--accent-tint)' : 'var(--paper-raised)', cursor: 'pointer', borderRadius: 4, overflow: 'hidden' }}>
                                            <div style={{ position: 'relative', aspectRatio: '16/9', background: a.currentVersion.posterUrl ? '#09090b' : 'var(--paper-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {a.currentVersion.posterUrl
                                                    ? <span style={{ position: 'absolute', inset: 0, backgroundImage: `url(${a.currentVersion.posterUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.82 }} />
                                                    : <Icon size={22} style={{ color: 'var(--ink-3)' }} />}
                                                {a.reviewUrl && a.mediaKind === 'video' && (
                                                    <a href={a.reviewUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ position: 'relative', zIndex: 1, width: 34, height: 34, borderRadius: '50%', background: 'rgba(9,9,11,.62)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Watch">
                                                        <Play size={15} fill="#f7f2e9" color="#f7f2e9" style={{ marginLeft: 2 }} />
                                                    </a>
                                                )}
                                                <span style={{ position: 'absolute', left: 6, top: 6, width: 16, height: 16, borderRadius: 2, border: '1.5px solid ' + (on ? 'var(--accent)' : 'var(--hairline-strong)'), background: on ? 'var(--accent)' : 'rgba(247,242,233,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {on && <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#fff" strokeWidth={3}><path d="M5 13l4 4L19 7" /></svg>}
                                                </span>
                                            </div>
                                            <div style={{ padding: '11px 13px' }}>
                                                <p className="desk-truncate" style={{ margin: 0, fontWeight: 600, fontSize: '0.84rem' }}>{a.title}</p>
                                                <p className="desk-mono" style={{ fontSize: '0.58rem', color: 'var(--ink-3)', margin: '3px 0 0' }}>{fmtBytes(a.currentVersion.sizeBytes)} · {fmtDate(a.createdAt, false)}</p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </>
                    )}
                    <div style={{ height: 80 }} />
                </>
            )}

            {sel.size > 0 && (
                <div style={{ position: 'fixed', left: '50%', bottom: 20, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 14, background: 'var(--ink)', color: 'var(--ink-invert)', borderRadius: 999, padding: '10px 10px 10px 22px', boxShadow: 'var(--shadow-modal)', zIndex: 40 }} className="desk-rise">
                    <span style={{ fontSize: '0.84rem', fontWeight: 500 }}>{sel.size} selected</span>
                    <button onClick={download} disabled={downloading} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--paper)', color: 'var(--ink)', border: 'none', borderRadius: 999, padding: '7px 16px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                        <Download size={13} /> {downloading ? 'Preparing…' : 'Download selected'}
                    </button>
                    <button onClick={() => setSel(new Set())} style={{ background: 'none', border: 'none', fontSize: '0.78rem', color: 'rgba(247,242,233,.6)', cursor: 'pointer', paddingRight: 8 }}>Clear</button>
                </div>
            )}
        </main>
    )
}
