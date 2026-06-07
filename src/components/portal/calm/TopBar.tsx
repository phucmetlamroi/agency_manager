'use client'

import { X } from 'lucide-react'
import ScopeSelector from './ScopeSelector'
import { fmtDate } from './format'
import type { Brand } from './types'

export default function TopBar({ scope, setScope, brands, lastUpdated }: {
    scope: number | 'all'
    setScope: (s: number | 'all') => void
    brands: Brand[]
    lastUpdated: string | null
}) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 24px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <ScopeSelector scope={scope} brands={brands} onChange={setScope} />
                {scope !== 'all' && (
                    <button onClick={() => setScope('all')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px', borderRadius: 999, background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--fg-3)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
                        <X size={13} /> Clear filter
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
