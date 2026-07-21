'use client'

/* THE DESK — client portal shell (Editorial Atelier · Print Edition).
   A fresh presentational tree over the SAME token-bound DeliverableActions
   adapter + DTOs the calm portal used (src/components/portal/calm/types.ts).
   No money / review / auth plumbing changes here — only the room changes. */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
    Inbox, LayoutGrid, FolderOpen, CreditCard, Send, Bell, Search, ChevronDown, Menu,
} from 'lucide-react'
import { DeskMark, Button, Kicker, ToastProvider, useIsNarrow } from './ui'
import YourDesk from './YourDesk'
import Productions from './Productions'
import Statements from './Statements'
import Library from './Library'
import Requests from './Requests'
import DeliverableSheet from './DeliverableSheet'
import NewRequestPanel from './NewRequestPanel'
import SearchPalette from './SearchPalette'
import ScreeningRoom from './ScreeningRoom'
import {
    deriveBrands, scopeFilterDeliverables, scopeFilterInvoices,
    workspaceFilterDeliverables, workspaceFilterInvoices,
} from '../calm/types'
import { mapInvoiceStatus } from '../calm/format'
import type { Deliverable, Invoice, Workspace, DeliverableActions } from '../calm/types'

export type DeskSurface = 'tray' | 'productions' | 'files' | 'statements' | 'requests'

export default function DeskApp(props: {
    mode?: 'account' | 'share'
    actions: DeliverableActions
    locale?: string
    accountName: string
    contactName: string
    agencyName: string
    brandLogoUrl?: string | null
    brandAccent?: string | null
    initialDeliverables: Deliverable[]
    initialInvoices: Invoice[]
    workspaces?: Workspace[]
}) {
    const {
        actions, accountName, agencyName, brandLogoUrl = null, brandAccent = null,
        initialDeliverables, initialInvoices, workspaces = [],
    } = props

    return (
        <ToastProvider>
            <DeskInner
                actions={actions}
                accountName={accountName}
                agencyName={agencyName}
                brandLogoUrl={brandLogoUrl}
                brandAccent={brandAccent}
                initialDeliverables={initialDeliverables}
                initialInvoices={initialInvoices}
                workspaces={workspaces}
            />
        </ToastProvider>
    )
}

function DeskInner({
    actions, accountName, agencyName, brandLogoUrl, brandAccent,
    initialDeliverables, initialInvoices, workspaces,
}: {
    actions: DeliverableActions
    accountName: string
    agencyName: string
    brandLogoUrl: string | null
    brandAccent: string | null
    initialDeliverables: Deliverable[]
    initialInvoices: Invoice[]
    workspaces: Workspace[]
}) {
    const [surface, setSurface] = useState<DeskSurface>('tray')
    const [wsScope, setWsScope] = useState<string | 'all'>('all')
    const [scope, setScope] = useState<number | 'all'>('all')
    const [prodOpen, setProdOpen] = useState(false)
    const [deliverables, setDeliverables] = useState<Deliverable[]>(initialDeliverables)
    const [openDel, setOpenDel] = useState<string | null>(null)
    const [openInv, setOpenInv] = useState<string | null>(null)
    const [newReqOpen, setNewReqOpen] = useState(false)
    const [searchOpen, setSearchOpen] = useState(false)
    const [screening, setScreening] = useState<{ url: string; title: string; id: string } | null>(null)
    // Mirrored into a ref so the (mount-once) postMessage listener below reads the CURRENT room
    // instead of closing over the null it saw on mount.
    const screeningRef = useRef<typeof screening>(null)
    screeningRef.current = screening
    const [navOpen, setNavOpen] = useState(false)
    const narrow = useIsNarrow()

    const invoices = initialInvoices

    // Period → channel, the admin drill-down order.
    const periodDels = useMemo(() => workspaceFilterDeliverables(deliverables, wsScope), [deliverables, wsScope])
    const periodInvs = useMemo(() => workspaceFilterInvoices(invoices, wsScope), [invoices, wsScope])
    const brands = useMemo(() => deriveBrands(periodDels), [periodDels])
    const scopedDels = useMemo(() => scopeFilterDeliverables(periodDels, scope), [periodDels, scope])
    const scopedInvs = useMemo(() => scopeFilterInvoices(periodInvs, scope), [periodInvs, scope])

    // Counts driving the nav + tray badges (whole in-period book, not the channel view).
    const needsYouCount = useMemo(() => periodDels.filter(d => d.needsYou).length, [periodDels])
    const overdueCount = useMemo(() => periodInvs.filter(i => mapInvoiceStatus(i.status) === 'Overdue').length, [periodInvs])
    const trayCount = needsYouCount + overdueCount

    const updateDeliverable = (id: string, patch: Partial<Deliverable>) =>
        setDeliverables(prev => prev.map(d => (d.id === id ? { ...d, ...patch } : d)))

    const go = (s: DeskSurface) => { setSurface(s); setOpenInv(null); setNavOpen(false) }
    const changeWs = (v: string | 'all') => { setWsScope(v); setScope('all'); setOpenInv(null) }
    const openChannel = (id: number) => { setScope(id); setSurface('productions'); setOpenInv(null); setNavOpen(false) }
    const openDeliverable = (id: string) => setOpenDel(id)
    const openInvoice = (id: string) => { setSurface('statements'); setOpenInv(id) }
    // Open the in-portal screening room (same-origin iframe of the /r review player).
    // AWAIT the identity handshake first: it mints the review guest session from the
    // portal's already-verified notify email, so the client can approve/download the
    // moment the player loads instead of hitting a second name+email prompt. It must
    // finish BEFORE the iframe mounts, or the frame loads without the cookie. Failure
    // is non-fatal — the player then shows its own identity modal, as it always did.
    const openReview = async (url: string, title: string, deliverableId: string) => {
        try { await actions.prepareScreening?.(url) } catch { /* non-fatal */ }
        setScreening({ url, title, id: deliverableId })
    }

    // [Client escalation 2026-07-21] Adopt a decision the client made INSIDE the screening room.
    // The framed player writes the approval server-side and shows its own toast, but the Desk held
    // the pre-decision snapshot: closing the room left the card still reading "This video is ready
    // for your review" with a live Approve button — and pressing it answered "This deliverable has
    // already been approved." The client had approved, and the portal called them wrong.
    // The frame is same-origin, so it postMessages the outcome up; we patch the one card. Both the
    // origin AND the marker are checked — a message from any other frame or origin is ignored.
    useEffect(() => {
        const onMessage = (e: MessageEvent) => {
            if (e.origin !== window.location.origin) return
            const d = e.data as { source?: string; type?: string; decision?: string } | null
            if (!d || d.source !== 'velox-review' || d.type !== 'decision') return
            const id = screeningRef.current?.id
            if (!id) return
            if (d.decision === 'approve') {
                updateDeliverable(id, { clientStatus: 'Completed', needsYou: false, clientReview: 'APPROVED' })
            } else if (d.decision === 'request_changes') {
                updateDeliverable(id, { clientStatus: 'In revision', needsYou: false, clientReview: 'CHANGES' })
            }
        }
        window.addEventListener('message', onMessage)
        return () => window.removeEventListener('message', onMessage)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ⌘K / Ctrl-K opens the search palette.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true) }
            if (e.key === 'Escape') { setSearchOpen(false) }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    const delObj = openDel ? deliverables.find(d => d.id === openDel) || null : null

    // [white-label] Override the terracotta accent with the agency's brand hue.
    const accentStyle: CSSProperties = brandAccent
        ? ({
            ['--accent' as any]: brandAccent,
            ['--accent-hover' as any]: `color-mix(in srgb, ${brandAccent} 82%, black)`,
            ['--accent-tint' as any]: `color-mix(in srgb, ${brandAccent} 10%, transparent)`,
            ['--accent-line' as any]: `color-mix(in srgb, ${brandAccent} 32%, transparent)`,
        })
        : {}

    const periodLabel = wsScope === 'all' ? 'All periods' : (workspaces.find(w => w.id === wsScope)?.name ?? 'Period')

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1, ...accentStyle }}>
            {/* ── Masthead ─────────────────────────────────────────────── */}
            <header className="desk-masthead" style={{
                display: 'flex', alignItems: 'center', gap: 14, height: 58, padding: '0 22px', flexShrink: 0,
                borderBottom: '1px solid var(--hairline-strong)', background: 'var(--paper)', position: 'relative', zIndex: 20,
            }}>
                {narrow && (
                    <button className="desk-iconbtn" aria-label="Menu" onClick={() => setNavOpen(o => !o)} style={{ marginLeft: -8 }}>
                        <Menu size={19} />
                    </button>
                )}
                {brandLogoUrl
                    ? <img src={brandLogoUrl} alt="" width={22} height={22} style={{ objectFit: 'contain', borderRadius: 3 }} />
                    : <DeskMark size={22} />}
                <span style={{ width: 1, height: 24, background: 'var(--hairline)' }} />
                <span style={{ minWidth: 0 }}>
                    <p className="desk-serif desk-truncate" style={{ margin: 0, fontWeight: 600, fontSize: '1rem', lineHeight: 1.1, color: 'var(--ink)', maxWidth: 220 }}>{accountName}</p>
                    <Kicker style={{ fontSize: '0.56rem' }}>Production desk</Kicker>
                </span>

                <button className="desk-search" onClick={() => setSearchOpen(true)} style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: 380, height: 36, marginLeft: 26, padding: '0 12px',
                    background: 'var(--paper-raised)', border: '1px solid var(--hairline)', borderRadius: 3,
                    color: 'var(--ink-3)', cursor: 'pointer', fontFamily: 'var(--font-body)',
                }}>
                    <Search size={14} style={{ flexShrink: 0 }} />
                    <span className="desk-search__label desk-truncate" style={{ fontSize: '0.84rem' }}>Search videos, statements, requests…</span>
                    <span className="desk-mono desk-search__kbd" style={{ marginLeft: 'auto', fontSize: '0.6rem', border: '1px solid var(--hairline)', borderRadius: 2, padding: '1px 5px' }}>⌘K</span>
                </button>

                {/* Period tabs (the admin month switcher) */}
                {workspaces.length > 0 && (
                    <div className="desk-mono" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.66rem', letterSpacing: '0.08em', maxWidth: 360, overflowX: 'auto' }}>
                        <PeriodTab label="All" active={wsScope === 'all'} onClick={() => changeWs('all')} />
                        {workspaces.map(w => (
                            <PeriodTab key={w.id} label={shortPeriod(w.name)} active={wsScope === w.id} onClick={() => changeWs(w.id)} />
                        ))}
                    </div>
                )}

                <button className="desk-iconbtn" aria-label="What needs you" title="What needs you" onClick={() => go('tray')} style={{ marginLeft: workspaces.length > 0 ? 6 : 'auto' }}>
                    <Bell size={16} />
                    {trayCount > 0 && <span style={{ position: 'absolute', top: 8, right: 9, width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />}
                </button>
                {actions.submitRequest && (
                    <Button variant="primary" size="sm" onClick={() => setNewReqOpen(true)}>New request</Button>
                )}
            </header>

            {/* ── Body: nav + surface ──────────────────────────────────── */}
            <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
                {narrow && navOpen && (
                    <div onClick={() => setNavOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 59, background: 'rgba(35,32,25,0.42)', animation: 'desk-fade var(--t-fast) var(--ease)' }} />
                )}
                <nav data-open={navOpen ? 'true' : 'false'} style={{
                    width: 236, flexShrink: 0, borderRight: '1px solid var(--hairline)', padding: '20px 14px',
                    display: 'flex', flexDirection: 'column', gap: 3, background: 'var(--paper)', overflowY: 'auto',
                }} className="desk-nav-rail">
                    <Kicker style={{ padding: '0 12px', marginBottom: 6 }}>Your desk</Kicker>
                    <NavItem icon={Inbox} label="Action tray" active={surface === 'tray'} badge={trayCount || undefined} onClick={() => go('tray')} />

                    <Kicker style={{ padding: '0 12px', margin: '16px 0 6px' }}>Videos</Kicker>
                    <NavItem
                        icon={LayoutGrid}
                        label="All videos"
                        active={surface === 'productions' && scope === 'all'}
                        count={periodDels.length}
                        chevron={brands.length > 0 ? prodOpen : undefined}
                        onChevron={brands.length > 0 ? (e) => { e.stopPropagation(); setProdOpen(o => !o) } : undefined}
                        onClick={() => { setScope('all'); go('productions') }}
                    />
                    {prodOpen && brands.map(b => (
                        <NavItem
                            key={b.id}
                            label={b.name}
                            indent
                            active={surface === 'productions' && scope === b.id}
                            count={b.count}
                            onClick={() => openChannel(b.id)}
                        />
                    ))}

                    <Kicker style={{ padding: '0 12px', margin: '16px 0 6px' }}>Library</Kicker>
                    <NavItem icon={FolderOpen} label="Files & masters" active={surface === 'files'} onClick={() => go('files')} />

                    <Kicker style={{ padding: '0 12px', margin: '16px 0 6px' }}>Billing</Kicker>
                    <NavItem icon={CreditCard} label="Statements" active={surface === 'statements'} dot={overdueCount > 0 ? 'var(--brick)' : undefined} onClick={() => go('statements')} />

                    <Kicker style={{ padding: '0 12px', margin: '16px 0 6px' }}>Correspondence</Kicker>
                    <NavItem icon={Send} label="Your requests" active={surface === 'requests'} onClick={() => go('requests')} />

                    <div style={{ marginTop: 'auto', paddingTop: 28, borderTop: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', gap: 9, marginLeft: 12 }}>
                        <DeskMark size={16} />
                        <span style={{ fontSize: '0.74rem', color: 'var(--ink-3)', lineHeight: 1.4 }}>
                            Managed by<br /><strong style={{ color: 'var(--ink-2)' }}>{agencyName}</strong>
                        </span>
                    </div>
                </nav>

                <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', position: 'relative' }}>
                    {surface === 'tray' && (
                        <YourDesk
                            key={'tray' + wsScope}
                            deliverables={periodDels}
                            invoices={periodInvs}
                            actions={actions}
                            accountName={accountName}
                            periodLabel={periodLabel}
                            needsYouCount={needsYouCount}
                            openDeliverable={openDeliverable}
                            openReview={openReview}
                            goStatements={() => go('statements')}
                            openInvoice={openInvoice}
                        />
                    )}
                    {surface === 'productions' && (
                        <Productions
                            key={'prod' + wsScope + scope}
                            deliverables={scopedDels}
                            brands={brands}
                            scope={scope}
                            setScope={setScope}
                            showPeriod={wsScope === 'all'}
                            periodLabel={periodLabel}
                            openDeliverable={openDeliverable}
                        />
                    )}
                    {surface === 'files' && (
                        // [A1] The remount `key` used to be the ONLY link between the masthead
                        // period tabs and this surface — and since Library took no scope props,
                        // it refetched the identical payload and rendered the identical grid.
                        // A client switching to "T6" saw July's files and concluded work had
                        // gone missing. Pass the scope; drop the pointless remount.
                        <Library actions={actions} wsScope={wsScope} clientScope={scope} />
                    )}
                    {surface === 'statements' && (
                        <Statements
                            key={'st' + wsScope + scope}
                            invoices={scopedInvs}
                            openInvoice={openInvoice}
                            activeId={openInv}
                            pdfUrl={actions.invoicePdfUrl}
                        />
                    )}
                    {surface === 'requests' && (
                        <Requests key="req" actions={actions} openDeliverable={openDeliverable} onNew={actions.submitRequest ? () => setNewReqOpen(true) : undefined} />
                    )}
                </div>
            </div>

            {/* ── Overlays ─────────────────────────────────────────────── */}
            {delObj && (
                <DeliverableSheet
                    d={delObj}
                    actions={actions}
                    onClose={() => setOpenDel(null)}
                    onUpdated={updateDeliverable}
                    onOpenReview={openReview}
                />
            )}
            {newReqOpen && actions.submitRequest && (
                <NewRequestPanel actions={actions} onClose={() => setNewReqOpen(false)} />
            )}
            {searchOpen && (
                <SearchPalette
                    deliverables={deliverables}
                    invoices={invoices}
                    onClose={() => setSearchOpen(false)}
                    openDeliverable={(id) => { setSearchOpen(false); openDeliverable(id) }}
                    openInvoice={(id) => { setSearchOpen(false); openInvoice(id) }}
                />
            )}
            {screening && <ScreeningRoom url={screening.url} title={screening.title} onClose={() => setScreening(null)} />}
        </div>
    )
}

/* ── Nav item ────────────────────────────────────────────────────────────── */
function NavItem({ icon: Icon, label, active, count, badge, dot, indent, chevron, onChevron, onClick }: {
    icon?: any
    label: string
    active?: boolean
    count?: number
    badge?: number
    dot?: string
    indent?: boolean
    chevron?: boolean
    onChevron?: (e: React.MouseEvent) => void
    onClick: () => void
}) {
    return (
        <button
            className="desk-nav-item"
            data-active={active ? 'true' : 'false'}
            onClick={onClick}
            style={indent ? { paddingLeft: 34, fontSize: '0.85rem' } : undefined}
        >
            {Icon && <span className="desk-nav-item__icon"><Icon size={15} /></span>}
            <span className="desk-truncate">{label}</span>
            {badge != null && <span className="desk-nav-item__badge">{badge}</span>}
            {count != null && badge == null && <span className="desk-mono" style={{ marginLeft: 'auto', fontSize: '0.64rem', color: 'var(--ink-3)' }}>{count}</span>}
            {dot && <span style={{ marginLeft: count != null || badge != null ? 8 : 'auto', width: 7, height: 7, borderRadius: '50%', background: dot }} />}
            {chevron != null && (
                <span onClick={onChevron} style={{ display: 'inline-flex', padding: 3, margin: '-3px -3px -3px 4px', color: 'var(--ink-3)' }}>
                    <ChevronDown size={13} style={{ transform: chevron ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                </span>
            )}
        </button>
    )
}

function PeriodTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button onClick={onClick} className="desk-mono" style={{
            padding: '6px 10px', borderRadius: 2, cursor: 'pointer', border: 'none', whiteSpace: 'nowrap',
            fontSize: '0.66rem', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)',
            color: active ? 'var(--on-accent)' : 'var(--ink-2)',
            background: active ? 'var(--accent)' : 'transparent',
        }}>{label}</button>
    )
}

/* "Tháng 7/2026" → "T7", "July 2026" → "JUL". Best-effort short tab label. */
function shortPeriod(name: string): string {
    const m = name.match(/(\d{1,2})\s*\/\s*(\d{4})/)
    if (m) return 'T' + m[1]
    const mon = name.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i)
    if (mon) return mon[1].toUpperCase()
    return name.length > 8 ? name.slice(0, 8) : name
}
