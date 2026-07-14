'use client'
// [Giao diện 2 · Mission Control] Workspace (= tháng) switcher for the MC topbar.
// Workspaces represent monthly payroll cycles ("Tháng 7/2026"); the M1 board rendered the
// name as a STATIC chip, so clicking it did nothing (owner's 2026-07-14 review: "bấm đổi tháng
// không được"). This makes it a real dropdown that lists the profile's workspaces and navigates
// to /{id}/mc — staying inside Mission Control. Read-only navigation; no money, no schema.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { LayoutGrid, ChevronDown, Check, Briefcase } from 'lucide-react'
import { getMyProfilesAndWorkspaces } from '@/actions/profile-actions'

type Ws = { id: string; name: string; description: string | null }

export default function McWorkspaceSwitcher({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [workspaces, setWorkspaces] = useState<Ws[]>([])
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        getMyProfilesAndWorkspaces().then((d: any) => setWorkspaces(d?.workspaces ?? [])).catch(() => {})
    }, [])
    useEffect(() => {
        const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
        if (open) document.addEventListener('mousedown', h)
        return () => document.removeEventListener('mousedown', h)
    }, [open])

    const go = (id: string) => {
        setOpen(false)
        if (id !== workspaceId) router.push(`/${id}/mc`)
    }
    const currentName = workspaces.find((w) => w.id === workspaceId)?.name || workspaceName

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                title="Đổi workspace / tháng"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, background: open ? 'rgba(99,102,241,0.20)' : 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.35)', cursor: 'pointer', fontFamily: 'inherit' }}
            >
                <LayoutGrid style={{ width: 14, height: 14, color: '#A5B4FC' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#F4F4F5', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentName}</span>
                <ChevronDown style={{ width: 13, height: 13, color: '#A5B4FC', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }} />
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.98 }}
                        transition={{ duration: 0.16 }}
                        style={{ position: 'absolute', top: '100%', left: 0, marginTop: 8, width: 260, zIndex: 80, borderRadius: 14, background: '#0A0A0A', border: '1px solid rgba(99,102,241,0.20)', boxShadow: '0 16px 48px rgba(0,0,0,0.55)', padding: 8, maxHeight: 360, overflowY: 'auto' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#71717A' }}>
                            <Briefcase style={{ width: 11, height: 11 }} /> Workspace / tháng
                        </div>
                        {workspaces.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12, color: '#52525B', fontStyle: 'italic' }}>Đang tải…</div>}
                        {workspaces.map((ws) => {
                            const active = ws.id === workspaceId
                            return (
                                <button key={ws.id} type="button" onClick={() => go(ws.id)} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 10, background: active ? 'rgba(99,102,241,0.14)' : 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                                    <span style={{ width: 30, height: 30, borderRadius: 8, background: active ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <Briefcase style={{ width: 14, height: 14, color: '#A5B4FC' }} />
                                    </span>
                                    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: '#E4E4E7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ws.name}</span>
                                        {ws.description && <span style={{ fontSize: 10, color: '#71717A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ws.description}</span>}
                                    </span>
                                    {active && <Check style={{ width: 15, height: 15, color: '#A5B4FC', flexShrink: 0 }} />}
                                </button>
                            )
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
