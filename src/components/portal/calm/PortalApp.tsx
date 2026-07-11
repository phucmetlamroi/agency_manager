'use client'

import { useState, useMemo, type CSSProperties } from 'react'
import { LayoutDashboard, Clapperboard, Files, ReceiptText } from 'lucide-react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import OverviewSurface from './OverviewSurface'
import DeliverablesSurface from './DeliverablesSurface'
import DocumentsSurface from './DocumentsSurface'
import InvoicesSurface from './InvoicesSurface'
import DeliverableDetailPanel from './DeliverableDetailPanel'
import InvoiceDetailPanel from './InvoiceDetailPanel'
import CreateRequestWizard from './CreateRequestWizard'
import CreateSubClientPanel from './CreateSubClientPanel'
import PortalSettings from './PortalSettings'
import {
    deriveBrands, deriveLastUpdated,
    scopeFilterDeliverables, scopeFilterInvoices,
    workspaceFilterDeliverables, workspaceFilterInvoices,
} from './types'
import type { Deliverable, Invoice, Workspace, SurfaceId, DeliverableActions } from './types'

const NAV: { id: SurfaceId; label: string; Icon: any }[] = [
    { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
    { id: 'deliverables', label: 'Deliverables', Icon: Clapperboard },
    { id: 'documents', label: 'Document', Icon: Files },
    { id: 'invoices', label: 'Invoices', Icon: ReceiptText },
]

export default function PortalApp({ workspaceId, locale, currentUserId, accountName, contactName, agencyName, brandLogoUrl = null, brandAccent = null, initialDeliverables, initialInvoices, initialSurface = 'overview', profiles = [], switcherWorkspaces = [], currentProfileId = null, mode = 'account', actions, workspaces = [] }: {
    workspaceId: string
    locale: string
    currentUserId: string
    accountName: string
    contactName: string
    agencyName: string
    /** [Trial P3 — white-label] agency logo (sidebar lockup) + accent (portal theme). */
    brandLogoUrl?: string | null
    brandAccent?: string | null
    initialDeliverables: Deliverable[]
    initialInvoices: Invoice[]
    initialSurface?: SurfaceId
    profiles?: { id: string; name: string }[]
    switcherWorkspaces?: { id: string; name: string }[]
    currentProfileId?: string | null
    /**
     * [Canonical Clients] 'share' = public tokenized link: hides the
     * profile/workspace switcher + logout (no session exists) and routes all
     * deliverable actions through the injected token adapter.
     * (The account portal was removed in P5 — share is the only consumer.)
     */
    mode?: 'account' | 'share'
    /** Credential-bound action adapter — see DeliverableActions in types.ts. */
    actions: DeliverableActions
    /**
     * [Atelier] The periods (admin workspaces) holding this client's work,
     * newest-first. Drives the period switcher; the channel list re-derives
     * from whichever period is in view.
     */
    workspaces?: Workspace[]
}) {
    const [active, setActive] = useState<SurfaceId>(initialSurface)
    // Two-axis filter mirroring the admin: PERIOD (workspace) × CHANNEL (sub-brand).
    const [wsScope, setWsScope] = useState<string | 'all'>('all')
    const [scope, setScope] = useState<number | 'all'>('all')
    const [deliverables, setDeliverables] = useState<Deliverable[]>(initialDeliverables)
    const [openDel, setOpenDel] = useState<string | null>(null)
    const [openInv, setOpenInv] = useState<string | null>(null)
    const [createOpen, setCreateOpen] = useState(false)
    const [subClientOpen, setSubClientOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)

    const effectiveActions: DeliverableActions = actions
    const invoices = initialInvoices

    // Period first, then channel — same drill-down order as the admin board.
    const periodDels = useMemo(() => workspaceFilterDeliverables(deliverables, wsScope), [deliverables, wsScope])
    const periodInvs = useMemo(() => workspaceFilterInvoices(invoices, wsScope), [invoices, wsScope])
    // Channels re-derive from the period in view, so the switcher only offers
    // brands that actually have work in the selected book.
    const brands = useMemo(() => deriveBrands(periodDels), [periodDels])
    const scopedDels = useMemo(() => scopeFilterDeliverables(periodDels, scope), [periodDels, scope])
    const scopedInvs = useMemo(() => scopeFilterInvoices(periodInvs, scope), [periodInvs, scope])
    const lastUpdated = useMemo(() => deriveLastUpdated(periodDels), [periodDels])

    // Deliverables-per-period, for the period menu subtitle (whole dataset).
    const wsCounts = useMemo(() => {
        const m: Record<string, number> = {}
        for (const d of deliverables) if (d.workspaceId) m[d.workspaceId] = (m[d.workspaceId] || 0) + 1
        return m
    }, [deliverables])

    const periodLabel = wsScope === 'all' ? null : (workspaces.find(w => w.id === wsScope)?.name ?? null)

    // Switching period invalidates any channel that doesn't exist in the new
    // book — reset to "all channels" so the view never lands empty.
    const changeWsScope = (v: string | 'all') => {
        setWsScope(v)
        setScope('all')
        setOpenDel(null); setOpenInv(null)
    }

    const updateDeliverable = (id: string, patch: Partial<Deliverable>) =>
        setDeliverables(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d))
    const onNav = (id: SurfaceId) => { setActive(id); setOpenDel(null); setOpenInv(null) }
    const openDeliverable = (id: string) => setOpenDel(id)
    const openInvoice = (id: string) => { setActive('invoices'); setOpenInv(id) }

    const delObj = openDel ? deliverables.find(d => d.id === openDel) || null : null
    const invObj = openInv ? invoices.find(i => i.id === openInv) || null : null

    // [Trial P3 — white-label] Override the portal accent tokens with the agency's
    // brand color (validated hex from the server). color-mix keeps soft/line tints
    // consistent for any hue; falls back to the theme's violet when unset. On the dark
    // theme --accent-fg is the accent used as TEXT/icon, so it's lightened toward white
    // to keep contrast even when the brand hue is a mid/dark tone.
    const accentStyle: CSSProperties = brandAccent
        ? ({
            ['--accent' as any]: brandAccent,
            ['--accent-fg' as any]: `color-mix(in srgb, ${brandAccent} 62%, white)`,
            ['--accent-soft' as any]: `color-mix(in srgb, ${brandAccent} 14%, transparent)`,
            ['--accent-line' as any]: `color-mix(in srgb, ${brandAccent} 35%, transparent)`,
        })
        : {}

    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', ...accentStyle }}>
            <div className="hidden md:flex" style={{ height: '100%' }}>
                <Sidebar active={active} onNav={onNav} deliverables={scopedDels} invoices={scopedInvs} accountName={accountName} contactName={contactName} agencyName={agencyName} brandLogoUrl={brandLogoUrl} locale={locale} profiles={profiles} switcherWorkspaces={switcherWorkspaces} currentProfileId={currentProfileId} workspaceId={workspaceId} shareMode={mode === 'share'} />
            </div>

            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
                <TopBar
                    scope={scope} setScope={setScope} brands={brands} lastUpdated={lastUpdated}
                    workspaces={workspaces} wsScope={wsScope} setWsScope={changeWsScope} wsCounts={wsCounts}
                    onCreateTask={effectiveActions.submitRequest ? () => setCreateOpen(true) : undefined}
                    onCreateSubClient={effectiveActions.createSubClient ? () => setSubClientOpen(true) : undefined}
                    onOpenSettings={effectiveActions.notifyGet ? () => setSettingsOpen(true) : undefined}
                />

                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                    {active === 'overview' && <OverviewSurface key={'ov' + wsScope + scope} deliverables={scopedDels} invoices={scopedInvs} scope={scope} brands={brands} contactName={contactName} periodLabel={periodLabel} onNav={onNav} openDeliverable={openDeliverable} openInvoice={openInvoice} />}
                    {active === 'deliverables' && <DeliverablesSurface key={'dl' + wsScope + scope} deliverables={scopedDels} brands={brands} showPeriod={wsScope === 'all'} openDeliverable={openDeliverable} />}
                    {active === 'documents' && <DocumentsSurface key={'doc' + wsScope + scope} actions={effectiveActions} wsScope={wsScope} scope={scope} />}
                    {active === 'invoices' && <InvoicesSurface key={'iv' + wsScope + scope} invoices={scopedInvs} brands={brands} showPeriod={wsScope === 'all'} openInvoice={openInvoice} activeId={openInv} />}
                </div>

                {/* Mobile bottom nav — desktop has the sidebar, so this is hidden
                    at md+ via .pc-bottom-nav (the inline display:flex defeats the
                    Tailwind md:hidden class, hence the CSS override). */}
                <div className="md:hidden pc-bottom-nav" style={{ height: 60, borderTop: '1px solid var(--line)', background: 'var(--sidebar)', display: 'flex', alignItems: 'center', justifyContent: 'space-around', flexShrink: 0, paddingBottom: 'env(safe-area-inset-bottom)' }}>
                    {NAV.map(it => {
                        const on = active === it.id
                        const Icon = it.Icon
                        const isDocument = it.id === 'documents'
                        return (
                            <button key={it.id} onClick={() => onNav(it.id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', color: on ? (isDocument ? '#8B5CF6' : 'var(--accent-fg)') : 'var(--fg-3)' }}>
                                <Icon size={19} />
                                <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{it.label}</span>
                            </button>
                        )
                    })}
                </div>
            </main>

            {delObj && <DeliverableDetailPanel d={delObj} actions={effectiveActions} onClose={() => setOpenDel(null)} onUpdated={updateDeliverable} />}
            {invObj && <InvoiceDetailPanel inv={invObj} brands={brands} onClose={() => setOpenInv(null)} />}
            {createOpen && <CreateRequestWizard actions={effectiveActions} onClose={() => setCreateOpen(false)} />}
            {subClientOpen && <CreateSubClientPanel actions={effectiveActions} onClose={() => setSubClientOpen(false)} />}
            {settingsOpen && <PortalSettings actions={effectiveActions} onClose={() => setSettingsOpen(false)} />}
        </div>
    )
}
