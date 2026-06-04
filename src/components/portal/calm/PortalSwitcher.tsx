'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronsUpDown, Check, Building2, LayoutGrid } from 'lucide-react'

type Item = { id: string; name: string }

/* Profile + workspace switcher inside the portal — mirrors the admin/user
   switcher. Switching to a staff profile lands on admin/dashboard; switching to
   another client profile / workspace stays in the portal. */
export default function PortalSwitcher({ profiles, workspaces, currentProfileId, currentWorkspaceId, locale }: {
    profiles: Item[]
    workspaces: Item[]
    currentProfileId: string | null
    currentWorkspaceId: string
    locale: string
}) {
    const [open, setOpen] = useState(false)
    const [busy, setBusy] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
        document.addEventListener('mousedown', h)
        return () => document.removeEventListener('mousedown', h)
    }, [open])

    const currentProfile = profiles.find(p => p.id === currentProfileId)

    const switchProfile = async (pid: string) => {
        if (pid === currentProfileId || busy) return
        setBusy(true)
        try {
            await fetch('/api/profile/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: pid }) })
            const res = await fetch(`/api/workspace/first?profileId=${pid}`)
            const { workspaceId, view } = await res.json()
            if (view === 'portal') window.location.href = workspaceId ? `/portal/${locale}/${workspaceId}` : '/welcome'
            else window.location.href = workspaceId ? `/${workspaceId}/${view === 'admin' ? 'admin' : 'dashboard'}` : '/welcome'
        } catch { setBusy(false) }
    }

    const switchWorkspace = (wsId: string) => {
        if (wsId === currentWorkspaceId) { setOpen(false); return }
        window.location.href = `/portal/${locale}/${wsId}`
    }

    const hasChoices = profiles.length > 1 || workspaces.length > 1
    if (!hasChoices && !currentProfile) return null

    return (
        <div ref={ref} style={{ position: 'relative', padding: '0 12px 8px' }}>
            <button onClick={() => hasChoices && setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--surface-2)', cursor: hasChoices ? 'pointer' : 'default', color: 'var(--fg-1)' }}>
                <Building2 size={14} style={{ color: 'var(--fg-3)', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentProfile?.name || 'Workspace'}</span>
                {hasChoices && <ChevronsUpDown size={13} style={{ color: 'var(--fg-3)', flexShrink: 0 }} />}
            </button>

            {open && hasChoices && (
                <div className="pc-view-in" style={{ position: 'absolute', left: 12, right: 12, top: 46, zIndex: 70, background: 'var(--surface-3)', border: '1px solid var(--line-2)', borderRadius: 12, boxShadow: '0 16px 48px rgba(0,0,0,0.55)', overflow: 'hidden', maxHeight: 360, overflowY: 'auto' }}>
                    {profiles.length > 1 && (
                        <div style={{ padding: 6 }}>
                            <p className="eyebrow" style={{ fontSize: 9, padding: '6px 8px 4px' }}>Profiles</p>
                            {profiles.map(p => (
                                <button key={p.id} onClick={() => switchProfile(p.id)} disabled={busy} style={rowStyle(p.id === currentProfileId)}>
                                    <Building2 size={14} style={{ color: 'var(--fg-3)', flexShrink: 0 }} />
                                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                                    {p.id === currentProfileId && <Check size={14} style={{ color: 'var(--accent-fg)', flexShrink: 0 }} />}
                                </button>
                            ))}
                        </div>
                    )}
                    {workspaces.length > 1 && (
                        <div style={{ padding: 6, borderTop: profiles.length > 1 ? '1px solid var(--line)' : undefined }}>
                            <p className="eyebrow" style={{ fontSize: 9, padding: '6px 8px 4px' }}>Workspaces</p>
                            {workspaces.map(w => (
                                <button key={w.id} onClick={() => switchWorkspace(w.id)} style={rowStyle(w.id === currentWorkspaceId)}>
                                    <LayoutGrid size={14} style={{ color: 'var(--fg-3)', flexShrink: 0 }} />
                                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.name}</span>
                                    {w.id === currentWorkspaceId && <Check size={14} style={{ color: 'var(--accent-fg)', flexShrink: 0 }} />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function rowStyle(active: boolean): React.CSSProperties {
    return { width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px', borderRadius: 8, border: 'none', background: active ? 'var(--accent-soft)' : 'transparent', color: active ? 'var(--fg)' : 'var(--fg-2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit' }
}
