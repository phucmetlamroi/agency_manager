'use client'

// [Mobile design-handoff §2 (3k) / PR#7 · visual-parity redo] Thùng rác gộp 3 nguồn thành 1 màn
// segmented (Task đã hủy · Khách · Tổ chức). VISUAL theo prototype: header icon+title, 3 .m-seg
// (label · count, không icon), Task gộp vào 1 .m-card (hairline giữa hàng) + pill "Khôi phục"
// gọn; Khách thêm pill "Xóa hẳn" (vẫn qua confirm danger); Tổ chức đếm 30 ngày. Styling qua
// `.mroot .m-*` (indigo #6366F1), desktop KHÔNG đụng. LOGIC + chữ ký action giữ nguyên.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2, RotateCcw } from 'lucide-react'
import { restoreCancelledTask } from '@/actions/task-actions'
import { restoreClient, permanentlyDeleteClient } from '@/actions/crm-actions'
import { restoreProfileAction } from '@/actions/profile-actions'
import { useConfirm } from '@/components/ui/ConfirmModal'

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

    const SEGS: { key: Seg; full: string; n: number }[] = [
        { key: 'tasks', full: 'Task đã hủy', n: tasks.length },
        { key: 'clients', full: 'Khách', n: clients.length },
        { key: 'profiles', full: 'Tổ chức', n: profiles.length },
    ]

    return (
        <section className="mroot m-scr flex flex-col gap-3 px-3 pb-[calc(64px+env(safe-area-inset-bottom)+16px)] pt-2">
            {/* header */}
            <div className="m-row" style={{ gap: 10, padding: '10px 0 8px' }}>
                <Trash2 className="h-5 w-5" style={{ color: 'var(--m-fg-3)' }} />
                <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--m-fg-1)' }}>Thùng rác</span>
            </div>

            {/* segmented */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                {SEGS.map((s) => (
                    <button
                        key={s.key}
                        type="button"
                        onClick={() => setSeg(s.key)}
                        className={seg === s.key ? 'm-seg on' : 'm-seg'}
                        style={{ flex: seg === s.key ? 1.2 : 1, fontSize: 11.5 }}
                    >
                        {s.full} · {s.n}
                    </button>
                ))}
            </div>

            {/* TASKS */}
            {seg === 'tasks' && (
                tasks.length === 0 ? (
                    <EmptyCard text="Không có task đã hủy" />
                ) : (
                    <>
                        <div className="m-card" style={{ display: 'flex', flexDirection: 'column' }}>
                            {tasks.map((t, i) => {
                                const rowBusy = busy === `t:${t.id}`
                                return (
                                    <div key={t.id} style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: i < tasks.length - 1 ? '1px solid var(--m-border-1)' : 'none', opacity: rowBusy ? 0.6 : 1 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={ROW_TITLE}>{t.title}</div>
                                            <div style={ROW_META}>Đã hủy</div>
                                        </div>
                                        <RestorePill onClick={() => restoreTask(t)} disabled={rowBusy} />
                                    </div>
                                )
                            })}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--m-fg-4)', textAlign: 'center' }}>khôi phục task đưa về đúng trạng thái trước khi hủy</div>
                    </>
                )
            )}

            {/* CLIENTS */}
            {seg === 'clients' && (
                clients.length === 0 ? (
                    <EmptyCard text="Không có khách trong thùng rác" />
                ) : (
                    <>
                        <p style={{ fontSize: 13, color: 'var(--m-fg-3)' }}>Khôi phục bất cứ lúc nào; xoá vĩnh viễn là thủ công.</p>
                        <div className="flex flex-col gap-2">
                            {clients.map((c) => {
                                const rowBusy = busy === `c:${c.id}`
                                return (
                                    <div key={c.id} className="m-card" style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 8, opacity: rowBusy ? 0.6 : 1 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={ROW_TITLE}>{c.name}</div>
                                            {c._count && <div style={ROW_META}>{c._count.tasks} task · {c._count.subsidiaries} brand con · {c._count.invoices} hóa đơn</div>}
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                            <RestorePill onClick={() => restoreCli(c)} disabled={rowBusy} />
                                            <span
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => !rowBusy && purgeCli(c)}
                                                className="m-pill dan m-press"
                                                style={{ cursor: rowBusy ? 'default' : 'pointer', opacity: rowBusy ? 0.5 : 1 }}
                                            >
                                                Xóa hẳn
                                            </span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </>
                )
            )}

            {/* PROFILES */}
            {seg === 'profiles' && (
                profiles.length === 0 ? (
                    <EmptyCard text="Không có tổ chức đã xoá" />
                ) : (
                    <div className="flex flex-col gap-2">
                        {profiles.map((p) => {
                            const rowBusy = busy === `p:${p.id}`
                            return (
                                <div key={p.id} className="m-card" style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 8, opacity: rowBusy ? 0.6 : 1 }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={ROW_TITLE}>{p.name}</div>
                                        <div style={ROW_META}>{p.daysUntilHardDelete > 0 ? `Xoá vĩnh viễn sau ${p.daysUntilHardDelete} ngày` : 'Sắp bị xoá vĩnh viễn'}</div>
                                    </div>
                                    <RestorePill onClick={() => restoreProf(p)} disabled={rowBusy} />
                                </div>
                            )
                        })}
                    </div>
                )
            )}
        </section>
    )
}

const ROW_TITLE: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, color: 'var(--m-fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const ROW_META: React.CSSProperties = { marginTop: 1, fontSize: 10.5, color: 'var(--m-fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

function RestorePill({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
    return (
        <span
            role="button"
            tabIndex={0}
            onClick={() => !disabled && onClick()}
            className="m-pill suc m-press"
            style={{ cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}
        >
            <RotateCcw style={{ width: 11, height: 11 }} /> Khôi phục
        </span>
    )
}

function EmptyCard({ text }: { text: string }) {
    return (
        <div className="m-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '40px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--m-fg-4)' }}>{text}</p>
        </div>
    )
}
