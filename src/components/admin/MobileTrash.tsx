'use client'

// [Mobile design-handoff §2 (3k) / PR#7] Thùng rác gộp 3 nguồn thành 1 màn segmented (Task đã
// hủy · Khách đã xoá · Tổ chức đã xoá). Dùng lại action sẵn có; khách: khôi phục bất cứ lúc nào,
// xoá vĩnh viễn THỦ CÔNG (đúng copy). Đếm 30 ngày CHỈ cho tổ chức (profile.daysUntilHardDelete).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Undo2, Trash2, ListChecks, Users, Building2 } from 'lucide-react'
import { restoreCancelledTask } from '@/actions/task-actions'
import { restoreClient, permanentlyDeleteClient } from '@/actions/crm-actions'
import { restoreProfileAction } from '@/actions/profile-actions'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { EmptyState } from '@/components/ui/empty-state'

type TrashTask = { id: string; title: string }
type TrashClient = { id: number; name: string; _count?: { tasks: number; subsidiaries: number; invoices: number } }
type TrashProfile = { id: string; name: string; daysUntilHardDelete: number }
type Seg = 'tasks' | 'clients' | 'profiles'

export default function MobileTrash({
    workspaceId,
    tasks: tasks0,
    clients: clients0,
    profiles: profiles0,
}: {
    workspaceId: string
    tasks: TrashTask[]
    clients: TrashClient[]
    profiles: TrashProfile[]
}) {
    const router = useRouter()
    const { confirm } = useConfirm()
    const [, startTransition] = useTransition()

    const [seg, setSeg] = useState<Seg>('tasks')
    const [tasks, setTasks] = useState(tasks0)
    const [clients, setClients] = useState(clients0)
    const [profiles, setProfiles] = useState(profiles0)
    const [busy, setBusy] = useState<string | null>(null)

    const ok = (res: any) => !res || (res.error == null && res.success !== false)

    const restoreTask = async (t: TrashTask) => {
        if (busy) return
        setBusy(`t:${t.id}`)
        try {
            const res: any = await restoreCancelledTask(t.id, workspaceId)
            if (!ok(res)) { toast.error(res.error || 'Khôi phục thất bại'); return }
            toast.success('Đã khôi phục task')
            setTasks((p) => p.filter((x) => x.id !== t.id))
            startTransition(() => router.refresh())
        } catch { toast.error('Khôi phục thất bại') } finally { setBusy(null) }
    }

    const restoreCli = async (c: TrashClient) => {
        if (busy) return
        setBusy(`c:${c.id}`)
        try {
            const res: any = await restoreClient(c.id, workspaceId)
            if (!ok(res)) { toast.error(res.error || 'Khôi phục thất bại'); return }
            toast.success('Đã khôi phục khách hàng')
            setClients((p) => p.filter((x) => x.id !== c.id))
            startTransition(() => router.refresh())
        } catch { toast.error('Khôi phục thất bại') } finally { setBusy(null) }
    }

    const purgeCli = async (c: TrashClient) => {
        if (busy) return
        const yes = await confirm({
            title: 'Xoá vĩnh viễn khách hàng?',
            message: `"${c.name}" cùng dữ liệu liên quan sẽ bị xoá VĨNH VIỄN. Không thể hoàn tác.`,
            type: 'danger',
            confirmText: 'Xoá vĩnh viễn',
            cancelText: 'Huỷ',
        })
        if (!yes) return
        setBusy(`c:${c.id}`)
        try {
            const res: any = await permanentlyDeleteClient(c.id, workspaceId)
            if (!ok(res)) { toast.error(res.error || 'Không thể xoá vĩnh viễn'); return }
            toast.success('Đã xoá vĩnh viễn')
            setClients((p) => p.filter((x) => x.id !== c.id))
            startTransition(() => router.refresh())
        } catch { toast.error('Không thể xoá vĩnh viễn') } finally { setBusy(null) }
    }

    const restoreProf = async (p: TrashProfile) => {
        if (busy) return
        setBusy(`p:${p.id}`)
        try {
            const res: any = await restoreProfileAction(p.id)
            if (!ok(res)) { toast.error(res.error || 'Khôi phục thất bại'); return }
            toast.success('Đã khôi phục tổ chức')
            setProfiles((x) => x.filter((y) => y.id !== p.id))
            startTransition(() => router.refresh())
        } catch { toast.error('Khôi phục thất bại') } finally { setBusy(null) }
    }

    const SEGS: { key: Seg; label: string; icon: typeof ListChecks; n: number }[] = [
        { key: 'tasks', label: 'Task', icon: ListChecks, n: tasks.length },
        { key: 'clients', label: 'Khách', icon: Users, n: clients.length },
        { key: 'profiles', label: 'Tổ chức', icon: Building2, n: profiles.length },
    ]

    return (
        <div className="flex flex-col gap-3 px-3 pb-[calc(64px+env(safe-area-inset-bottom)+16px)] pt-2">
            <h1 className="text-page font-bold text-foreground">Thùng rác</h1>

            <div className="flex gap-1 rounded-xl border border-white/8 bg-zinc-900/60 p-1">
                {SEGS.map((s) => (
                    <button
                        key={s.key}
                        type="button"
                        onClick={() => setSeg(s.key)}
                        className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-caption font-bold transition-colors ${seg === s.key ? 'bg-primary text-white' : 'text-muted-foreground active:bg-white/5'}`}
                    >
                        <s.icon className="h-4 w-4" /> {s.label}
                        {s.n > 0 && <span className={`rounded-full px-1.5 text-[10px] ${seg === s.key ? 'bg-white/20' : 'bg-white/10'}`}>{s.n}</span>}
                    </button>
                ))}
            </div>

            {seg === 'tasks' && (
                tasks.length === 0 ? (
                    <EmptyState variant="cleared" title="Không có task đã hủy" />
                ) : (
                    <div className="flex flex-col gap-2">
                        {tasks.map((t) => (
                            <Row key={t.id} title={t.title} busy={busy === `t:${t.id}`}>
                                <RestoreBtn onClick={() => restoreTask(t)} disabled={busy === `t:${t.id}`} />
                            </Row>
                        ))}
                    </div>
                )
            )}

            {seg === 'clients' && (
                clients.length === 0 ? (
                    <EmptyState variant="cleared" title="Không có khách trong thùng rác" />
                ) : (
                    <>
                        <p className="text-caption text-muted-foreground">Khôi phục bất cứ lúc nào; xoá vĩnh viễn là thủ công.</p>
                        <div className="flex flex-col gap-2">
                            {clients.map((c) => (
                                <Row
                                    key={c.id}
                                    title={c.name}
                                    subtitle={c._count ? `${c._count.tasks} task · ${c._count.subsidiaries} brand con · ${c._count.invoices} hóa đơn` : undefined}
                                    busy={busy === `c:${c.id}`}
                                >
                                    <RestoreBtn onClick={() => restoreCli(c)} disabled={busy === `c:${c.id}`} />
                                    <button
                                        type="button"
                                        onClick={() => purgeCli(c)}
                                        disabled={busy === `c:${c.id}`}
                                        className="inline-flex h-10 items-center gap-1.5 rounded-full bg-red-500/15 px-3 text-caption font-bold text-red-400 transition-colors active:bg-red-500/25 disabled:opacity-50"
                                    >
                                        <Trash2 className="h-4 w-4" /> Xoá vĩnh viễn
                                    </button>
                                </Row>
                            ))}
                        </div>
                    </>
                )
            )}

            {seg === 'profiles' && (
                profiles.length === 0 ? (
                    <EmptyState variant="cleared" title="Không có tổ chức đã xoá" />
                ) : (
                    <div className="flex flex-col gap-2">
                        {profiles.map((p) => (
                            <Row
                                key={p.id}
                                title={p.name}
                                subtitle={p.daysUntilHardDelete > 0 ? `Xoá vĩnh viễn sau ${p.daysUntilHardDelete} ngày` : 'Sắp bị xoá vĩnh viễn'}
                                busy={busy === `p:${p.id}`}
                            >
                                <RestoreBtn onClick={() => restoreProf(p)} disabled={busy === `p:${p.id}`} />
                            </Row>
                        ))}
                    </div>
                )
            )}
        </div>
    )
}

function Row({ title, subtitle, busy, children }: { title: string; subtitle?: string; busy?: boolean; children: React.ReactNode }) {
    return (
        <div className={`rounded-xl border border-white/8 bg-zinc-900/60 p-3 ${busy ? 'opacity-60' : ''}`}>
            <div className="truncate text-body-sm font-semibold text-foreground">{title}</div>
            {subtitle && <div className="mt-0.5 truncate text-caption text-muted-foreground">{subtitle}</div>}
            <div className="mt-2 flex flex-wrap items-center gap-2">{children}</div>
        </div>
    )
}

function RestoreBtn({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary/15 px-3 text-caption font-bold text-primary-accent transition-colors active:bg-primary/25 disabled:opacity-50"
        >
            <Undo2 className="h-4 w-4" /> Khôi phục
        </button>
    )
}
