'use client'

import { X } from 'lucide-react'
import ScopeSelector from './ScopeSelector'
import WorkspaceSelector from './WorkspaceSelector'
import { fmtDate } from './format'
import type { Brand, Workspace } from './types'

export default function TopBar({ scope, setScope, brands, lastUpdated, workspaces, wsScope, setWsScope, wsCounts }: {
    scope: number | 'all'
    setScope: (s: number | 'all') => void
    brands: Brand[]
    lastUpdated: string | null
    workspaces: Workspace[]
    wsScope: string | 'all'
    setWsScope: (v: string | 'all') => void
    wsCounts: Record<string, number>
}) {
    const filtering = wsScope !== 'all' || scope !== 'all'
    const clearAll = () => { setWsScope('all'); setScope('all') }
    // [Redesign P4] Only surface a filter when there's an actual choice to make.
    // A client with a single month / single channel sees NO filter chrome.
    const showPeriod = workspaces.length > 1
    const showChannel = brands.length > 1
    const anyFilter = showPeriod || showChannel

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '15px 24px', borderBottom: '1px solid var(--line)', flexShrink: 0, background: 'var(--void)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
                {showPeriod && (
                    <WorkspaceSelector workspaces={workspaces} value={wsScope} counts={wsCounts} onChange={setWsScope} />
                )}
                {showPeriod && showChannel && (
                    <span style={{ width: 1, height: 26, background: 'var(--line-2)', margin: '0 2px' }} className="hidden md:block" />
                )}
                {showChannel && (
                    <ScopeSelector scope={scope} brands={brands} onChange={setScope} />
                )}
                {filtering && anyFilter && (
                    <button onClick={clearAll} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 11px', borderRadius: 999, background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--fg-3)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit' }}>
                        <X size={13} /> Clear
                    </button>
                )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--fg-3)', paddingRight: 4 }} className="pc-updated">
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)' }} />
                    {lastUpdated ? `Updated ${fmtDate(lastUpdated, false)}` : 'Up to date'}
                </span>
            </div>
        </div>
    )
}
