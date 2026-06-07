'use client'

import { useState, useMemo } from 'react'
import { LayoutDashboard, Clapperboard, ReceiptText } from 'lucide-react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import OverviewSurface from './OverviewSurface'
import DeliverablesSurface from './DeliverablesSurface'
import InvoicesSurface from './InvoicesSurface'
import DeliverableDetailPanel from './DeliverableDetailPanel'
import InvoiceDetailPanel from './InvoiceDetailPanel'
import { deriveBrands, deriveLastUpdated, scopeFilterDeliverables, scopeFilterInvoices } from './types'
import type { Deliverable, Invoice, SurfaceId } from './types'

const NAV: { id: SurfaceId; label: string; Icon: any }[] = [
    { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
    { id: 'deliverables', label: 'Deliverables', Icon: Clapperboard },
    { id: 'invoices', label: 'Invoices', Icon: ReceiptText },
]

export default function PortalApp({ workspaceId, locale, currentUserId, accountName, contactName, agencyName, initialDeliverables, initialInvoices, initialSurface = 'overview', profiles = [], switcherWorkspaces = [], currentProfileId = null }: {
    workspaceId: string
    locale: string
    currentUserId: string
    accountName: string
    contactName: string
    agencyName: string
    initialDeliverables: Deliverable[]
    initialInvoices: Invoice[]
    initialSurface?: SurfaceId
    profiles?: { id: string; name: string }[]
    switcherWorkspaces?: { id: string; name: string }[]
    currentProfileId?: string | null
}) {
    const [active, setActive] = useState<SurfaceId>(initialSurface)
    const [scope, setScope] = useState<number | 'all'>('all')
    const [deliverables, setDeliverables] = useState<Deliverable[]>(initialDeliverables)
    const [openDel, setOpenDel] = useState<string | null>(null)
    const [openInv, setOpenInv] = useState<string | null>(null)

    const invoices = initialInvoices
    const brands = useMemo(() => deriveBrands(deliverables), [deliverables])
    const scopedDels = useMemo(() => scopeFilterDeliverables(deliverables, scope), [deliverables, scope])
    const scopedInvs = useMemo(() => scopeFilterInvoices(invoices, scope), [invoices, scope])
    const lastUpdated = useMemo(() => deriveLastUpdated(deliverables), [deliverables])

    const updateDeliverable = (id: string, patch: Partial<Deliverable>) =>
        setDeliverables(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d))
    const onNav = (id: SurfaceId) => { setActive(id); setOpenDel(null); setOpenInv(null) }
    const openDeliverable = (id: string) => setOpenDel(id)
    const openInvoice = (id: string) => { setActive('invoices'); setOpenInv(id) }

    const delObj = openDel ? deliverables.find(d => d.id === openDel) || null : null
    const invObj = openInv ? invoices.find(i => i.id === openInv) || null : null

    return (
        <div style={{ display: 'flex', height: '100%', width: '100%' }}>
            <div className="hidden md:flex" style={{ height: '100%' }}>
                <Sidebar active={active} onNav={onNav} deliverables={scopedDels} invoices={scopedInvs} accountName={accountName} contactName={contactName} agencyName={agencyName} locale={locale} profiles={profiles} switcherWorkspaces={switcherWorkspaces} currentProfileId={currentProfileId} workspaceId={workspaceId} />
            </div>

            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
                <TopBar scope={scope} setScope={setScope} brands={brands} lastUpdated={lastUpdated} />

                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                    {active === 'overview' && <OverviewSurface key={'ov' + scope} deliverables={scopedDels} invoices={scopedInvs} scope={scope} brands={brands} contactName={contactName} onNav={onNav} openDeliverable={openDeliverable} openInvoice={openInvoice} />}
                    {active === 'deliverables' && <DeliverablesSurface key={'dl' + scope} deliverables={scopedDels} brands={brands} openDeliverable={openDeliverable} />}
                    {active === 'invoices' && <InvoicesSurface key={'iv' + scope} invoices={scopedInvs} brands={brands} openInvoice={openInvoice} activeId={openInv} />}
                </div>

                {/* Mobile bottom nav */}
                <div className="md:hidden" style={{ height: 60, borderTop: '1px solid var(--line)', background: 'var(--sidebar)', display: 'flex', alignItems: 'center', justifyContent: 'space-around', flexShrink: 0, paddingBottom: 'env(safe-area-inset-bottom)' }}>
                    {NAV.map(it => {
                        const on = active === it.id
                        const Icon = it.Icon
                        return (
                            <button key={it.id} onClick={() => onNav(it.id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', color: on ? 'var(--accent-fg)' : 'var(--fg-3)' }}>
                                <Icon size={19} />
                                <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{it.label}</span>
                            </button>
                        )
                    })}
                </div>
            </main>

            {delObj && <DeliverableDetailPanel d={delObj} workspaceId={workspaceId} onClose={() => setOpenDel(null)} onUpdated={updateDeliverable} />}
            {invObj && <InvoiceDetailPanel inv={invObj} brands={brands} onClose={() => setOpenInv(null)} />}
        </div>
    )
}
