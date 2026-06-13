'use client'

import { LayoutDashboard, Clapperboard, ReceiptText, ShieldCheck, LogOut } from 'lucide-react'
import { logoutAction } from '@/actions/auth-actions'
import LanguageSwitcher from '@/components/portal/LanguageSwitcher'
import { mapInvoiceStatus, initials } from './format'
import type { Deliverable, Invoice, SurfaceId } from './types'

const NAV: { id: SurfaceId; label: string; Icon: any }[] = [
    { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
    { id: 'deliverables', label: 'Deliverables', Icon: Clapperboard },
    { id: 'invoices', label: 'Invoices', Icon: ReceiptText },
]

export default function Sidebar({ active, onNav, deliverables, invoices, accountName, contactName, agencyName, locale, profiles = [], switcherWorkspaces = [], currentProfileId = null, workspaceId, shareMode = false }: {
    active: SurfaceId
    onNav: (id: SurfaceId) => void
    deliverables: Deliverable[]
    invoices: Invoice[]
    accountName: string
    contactName: string
    agencyName: string
    locale: string
    profiles?: { id: string; name: string }[]
    switcherWorkspaces?: { id: string; name: string }[]
    currentProfileId?: string | null
    workspaceId: string
    /** [Canonical Clients] public share link: no session → hide switcher,
     *  logout and locale switcher (those all assume an account). */
    shareMode?: boolean
}) {
    const needsReview = deliverables.filter(d => d.needsYou).length
    const overdue = invoices.filter(i => mapInvoiceStatus(i.status) === 'Overdue').length
    const badge: Record<string, number> = { deliverables: needsReview, invoices: overdue }
    const badgeKind: Record<string, 'attn' | 'danger'> = { deliverables: 'attn', invoices: 'danger' }

    return (
        <aside style={{ width: 244, flexShrink: 0, background: 'var(--sidebar)', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Brand lockup */}
            <div style={{ padding: '22px 20px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="pc-display" style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(150deg, var(--surface-3), var(--surface))', border: '1px solid var(--accent-line)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-fg)', fontWeight: 600, fontSize: 19, boxShadow: 'inset 0 1px 0 rgba(245,233,214,0.05)' }}>{accountName.slice(0, 1).toUpperCase()}</span>
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>{accountName}</div>
                    <div className="eyebrow" style={{ fontSize: 9.5, marginTop: 1 }}>Client Portal</div>
                </div>
            </div>

            {/* [Canonical Clients] PortalSwitcher removed with the account portal —
                a share link has no session/profile to switch between. */}

            {/* Nav */}
            <nav style={{ padding: '6px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <p className="eyebrow" style={{ padding: '8px 10px 6px', fontSize: 9.5 }}>Menu</p>
                {NAV.map(item => {
                    const on = active === item.id
                    const b = badge[item.id] || 0
                    const danger = badgeKind[item.id] === 'danger'
                    const Icon = item.Icon
                    return (
                        <button key={item.id} onClick={() => onNav(item.id)}
                            onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'var(--surface-2)' }}
                            onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent' }}
                            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 11px', borderRadius: 10, cursor: 'pointer', border: '1px solid ' + (on ? 'var(--accent-line)' : 'transparent'), background: on ? 'var(--accent-soft)' : 'transparent', transition: 'background .15s', textAlign: 'left', width: '100%' }}>
                            <Icon size={18} style={{ color: on ? 'var(--accent-fg)' : 'var(--fg-2)' }} />
                            <span style={{ flex: 1, fontSize: 14, fontWeight: on ? 700 : 600, color: on ? 'var(--fg)' : 'var(--fg-2)' }}>{item.label}</span>
                            {b > 0 && (
                                <span className="num" style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: danger ? 'var(--danger)' : 'var(--attn)', background: danger ? 'var(--danger-soft)' : 'var(--attn-soft)', border: '1px solid ' + (danger ? 'var(--danger-line)' : 'var(--attn-line)') }}>{b}</span>
                            )}
                        </button>
                    )
                })}
            </nav>

            <div style={{ flex: 1 }} />

            {/* Account card — share mode has no session, so no language
                switcher (locale routes are portal paths) and no logout. */}
            <div style={{ padding: 12, borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {!shareMode && <LanguageSwitcher currentLocale={locale} />}
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)' }}>
                    <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(150deg, var(--surface-3), var(--surface-2))', border: '1px solid var(--line-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-1)', fontWeight: 700, fontSize: 12 }}>{initials(contactName)}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contactName}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--fg-3)' }}>{shareMode ? 'Shared view' : 'Account owner'}</div>
                    </div>
                    {!shareMode && (
                        <form action={logoutAction}>
                            <button type="submit" title="Sign out" style={{ display: 'inline-flex', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 2 }}>
                                <LogOut size={15} />
                            </button>
                        </form>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 10px', fontSize: 11, color: 'var(--fg-4)' }}>
                    <ShieldCheck size={12} />
                    Managed by {agencyName}
                </div>
            </div>
        </aside>
    )
}
