'use client'
// [Giao diện 2 · Mission Control · M10 Add Task] Standalone "Thêm Task mới" screen.
// Reuses the EXACT money-safe AddTaskModal via DashboardActionWrapper (controlled + hideBar) —
// same submit routing as /admin (createTask / batch / Velox V1+V3 / Multi-Hook Map). The dark MC
// backdrop mimics the design's blurred board; closing the modal navigates back to /mc.
// Trang cha admin-gated fail-closed; createTask re-check ADMIN server-side → USD/giá không rò rỉ.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardActionWrapper from '@/components/dashboard/DashboardActionWrapper'
import type { McAddTaskData } from './McTopbarActions'

export default function McAddScreen({
    workspaceId, addTask, userRole,
}: {
    workspaceId: string
    addTask: McAddTaskData
    userRole: string
}) {
    const router = useRouter()
    const [open, setOpen] = useState(true)

    const close = () => { setOpen(false); router.push(`/${workspaceId}/mc`) }

    return (
        <div style={{ minHeight: '100dvh', background: '#050505', color: '#F4F4F5', position: 'relative', fontFamily: '"Plus Jakarta Sans", -apple-system, "Segoe UI", system-ui, sans-serif', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(900px 600px at 12% -10%, rgba(99,102,241,0.10), transparent 60%),radial-gradient(800px 600px at 100% 110%, rgba(168,85,247,0.10), transparent 60%)', pointerEvents: 'none' }} />
            {/* Faint blurred board behind the modal (matches the M10 design backdrop) */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 12, padding: '80px 24px 24px', opacity: 0.22, filter: 'blur(2px)', pointerEvents: 'none' }}>
                {[60, 50, 55, 45].map((w, i) => (
                    <div key={i} style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.08)', width: `${w}%` }} />
                        <div style={{ height: 60, borderRadius: 12, background: 'rgba(24,24,27,0.6)', border: '1px solid rgba(255,255,255,0.06)' }} />
                        {i < 2 && <div style={{ height: 60, borderRadius: 12, background: 'rgba(24,24,27,0.6)', border: '1px solid rgba(255,255,255,0.06)' }} />}
                    </div>
                ))}
            </div>

            {/* The real Add-Task modal — reuses /admin's money-safe submit routing. */}
            <DashboardActionWrapper
                hideBar
                portalToBody
                open={open}
                onOpenChange={(o: boolean) => { if (!o) close() }}
                workspaceId={workspaceId}
                clients={addTask.clients}
                users={addTask.users}
                workspaces={[]}
                userRole={userRole}
                canCreateWorkspace={false}
                pricingRules={addTask.pricingRules}
                exchangeRate={addTask.exchangeRate}
            />
        </div>
    )
}
