'use client'

// [Mobile design-handoff §2 (3j) / PR#3b] Mobile client-detail (hồ sơ khách) — dispatcher in
// crm/[id]/page.tsx renders this on mobile; desktop ClientAnalytics stays UNTOUCHED. Reuses the
// SAME data + actions: Tạo hóa đơn (MobileInvoiceFlow — now WITH real depositBalance), Chia sẻ
// Portal (createClientShareLink), + Brand con (CreateSubClientButton, chỉ khi !parentId), lịch sử
// hóa đơn + thu tiền (ClientInvoicesTable), task, nhận xét. No new/changed server actions.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, FileText, Share2, Star, Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getStatusInfo } from '@/lib/status-colors'
import { createClientShareLink } from '@/actions/share-link-actions'
import CreateSubClientButton from '@/components/crm/CreateSubClientButton'
import { ClientInvoicesTable } from '@/components/invoice/ClientInvoicesTable'
import MobileInvoiceFlow from '@/components/invoice/MobileInvoiceFlow'

type RatingData = {
    id: string
    createdAt: string
    creativeQuality: number
    responsiveness: number
    communication: number
    qualitativeFeedback?: string | null
    task: { id: string; title: string }
    staff: { username: string; nickname?: string | null }
}

type ClientData = {
    id: number
    name: string
    tier: string
    depositBalance: number
    parentId?: number | null
    subsidiaries: any[]
    tasks: any[]
    invoices: any[]
}

type TabKey = 'tasks' | 'invoices' | 'ratings'

const TIER_BADGE: Record<string, string> = {
    DIAMOND: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/40',
    GOLD: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/40',
    SILVER: 'bg-gray-400/10 text-gray-300 border-gray-400/40',
    WARNING: 'bg-red-500/15 text-red-400 border-red-500/50',
}

export default function MobileClientDetail({ client, ratings = [], workspaceId }: { client: ClientData; ratings?: RatingData[]; workspaceId: string }) {
    const router = useRouter()
    const [tab, setTab] = useState<TabKey>('tasks')
    const [invoiceOpen, setInvoiceOpen] = useState(false)
    const [portalPending, setPortalPending] = useState(false)

    // allTasks = own + subsidiary tasks (mirror ClientAnalytics).
    const allTasks = [
        ...client.tasks.map((t) => ({ ...t, brand: 'Trực tiếp' })),
        ...(client.subsidiaries?.flatMap((sub) => sub.tasks.map((t: any) => ({ ...t, brand: sub.name }))) || []),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const totalTasksCount = allTasks.length
    const avgRating =
        ratings.length > 0
            ? ratings.reduce((acc, r) => acc + (r.creativeQuality + r.responsiveness + r.communication) / 3, 0) / ratings.length
            : 0
    const deposit = Number(client.depositBalance) || 0

    const handlePortal = async () => {
        if (portalPending) return
        setPortalPending(true)
        try {
            const res = await createClientShareLink(client.id, workspaceId)
            if (!res.success) {
                toast.error(res.error || 'Không tạo được link Portal.')
                return
            }
            try {
                await navigator.clipboard.writeText(res.url)
                toast.success('Đã tạo link Portal — đã copy vào clipboard')
            } catch {
                toast.success('Đã tạo link Portal', { description: res.url })
            }
        } catch {
            toast.error('Không tạo được link Portal. Vui lòng thử lại.')
        } finally {
            setPortalPending(false)
        }
    }

    const tierCls = TIER_BADGE[client.tier] || 'bg-primary/10 text-primary-accent border-primary/40'

    return (
        <div className="flex min-h-dvh flex-col gap-4 px-3 pb-[calc(64px+env(safe-area-inset-bottom)+16px)] pt-2">
            {/* ── Header ── */}
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => router.back()}
                    aria-label="Quay lại"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-white/10"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <h1 className="min-w-0 flex-1 truncate text-page font-bold text-foreground">{client.name}</h1>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-caption font-bold ${tierCls}`}>{client.tier}</span>
            </div>

            {/* ── Deposit + primary CTA ── */}
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.06] px-3 py-3">
                <div className="min-w-0">
                    <div className="text-caption text-muted-foreground">Số dư (cọc)</div>
                    <div className="whitespace-nowrap font-mono text-[17px] font-bold text-emerald-400">${deposit.toLocaleString()}</div>
                </div>
                <Button className="h-11 shrink-0 gap-2" onClick={() => setInvoiceOpen(true)}>
                    <FileText className="h-4 w-4" /> Tạo hóa đơn
                </Button>
            </div>

            {/* ── Secondary actions ── */}
            <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="h-11 flex-1 gap-2" disabled={portalPending} onClick={handlePortal}>
                    <Share2 className="h-4 w-4" /> {portalPending ? 'Đang tạo…' : 'Chia sẻ Portal'}
                </Button>
                {!client.parentId && (
                    <div className="flex-1">
                        <CreateSubClientButton parentId={client.id} parentName={client.name} workspaceId={workspaceId} />
                    </div>
                )}
            </div>

            {/* ── KPI strip ── */}
            <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-white/8 bg-zinc-900/60 p-3 text-center">
                    <div className="text-2xl font-bold text-foreground">{totalTasksCount}</div>
                    <div className="text-caption text-muted-foreground">Task</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-zinc-900/60 p-3 text-center">
                    <div className="text-2xl font-bold text-amber-400">{avgRating > 0 ? avgRating.toFixed(1) : 'N/A'}</div>
                    <div className="text-caption text-muted-foreground">Điểm TB</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-zinc-900/60 p-3 text-center">
                    <div className="text-2xl font-bold text-foreground">{client.subsidiaries?.length || 0}</div>
                    <div className="text-caption text-muted-foreground">Brand con</div>
                </div>
            </div>

            {/* ── Segmented tabs ── */}
            <div className="flex gap-1 rounded-xl border border-white/8 bg-zinc-900/60 p-1">
                {([
                    ['tasks', `Task${totalTasksCount ? ` (${totalTasksCount})` : ''}`],
                    ['invoices', 'Hóa đơn'],
                    ['ratings', `Nhận xét${ratings.length ? ` (${ratings.length})` : ''}`],
                ] as [TabKey, string][]).map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        className={`h-9 flex-1 rounded-lg text-caption font-bold transition-colors ${tab === key ? 'bg-primary text-white' : 'text-muted-foreground active:bg-white/5'}`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* ── Section content ── */}
            {tab === 'tasks' && (
                <div className="flex flex-col gap-2">
                    {allTasks.length === 0 ? (
                        <p className="py-8 text-center text-body-sm italic text-muted-foreground">Chưa có task nào.</p>
                    ) : (
                        allTasks.map((task: any) => {
                            const s = getStatusInfo(task.status)
                            return (
                                <div key={task.id} className="flex items-start justify-between gap-2 rounded-xl border border-white/8 bg-zinc-900/60 p-3">
                                    <div className="min-w-0">
                                        <div className="truncate text-body-sm font-semibold text-foreground">{task.title}</div>
                                        <div className="mt-0.5 truncate text-caption text-muted-foreground">{task.brand}</div>
                                        <span
                                            className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold"
                                            style={{ background: s.bg, color: s.color }}
                                        >
                                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                                            {s.label}
                                        </span>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <div className="whitespace-nowrap font-mono text-body-sm text-zinc-300">{(task.value || 0).toLocaleString()} ₫</div>
                                        <div className="mt-0.5 text-caption text-muted-foreground">{new Date(task.createdAt).toLocaleDateString('vi-VN')}</div>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            )}

            {tab === 'invoices' && (
                <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-white/8 bg-zinc-900/40 p-2">
                    <ClientInvoicesTable invoices={client.invoices || []} clientId={client.id} workspaceId={workspaceId} />
                </div>
            )}

            {tab === 'ratings' && (
                <div className="flex flex-col gap-2">
                    {ratings.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                            <Star className="h-8 w-8 opacity-50" />
                            <p className="text-body-sm italic">Chưa có nhận xét nào.</p>
                        </div>
                    ) : (
                        ratings.map((r) => {
                            const avg = ((r.creativeQuality + r.responsiveness + r.communication) / 3).toFixed(1)
                            return (
                                <div key={r.id} className="rounded-xl border border-white/8 bg-zinc-900/60 p-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="truncate text-body-sm font-medium text-foreground">{r.task.title}</div>
                                            <div className="mt-0.5 text-caption text-muted-foreground">
                                                Editor: <span className="text-primary-accent">{r.staff.nickname || r.staff.username}</span>
                                            </div>
                                        </div>
                                        <div className="shrink-0 font-mono text-2xl font-black text-amber-400">{avg}</div>
                                    </div>
                                    {r.qualitativeFeedback && (
                                        <p className="mt-2 rounded-lg border-l-2 border-primary/50 bg-black/20 p-2.5 text-body-sm italic text-zinc-300">
                                            &ldquo;{r.qualitativeFeedback}&rdquo;
                                        </p>
                                    )}
                                    <div className="mt-2 flex items-center gap-2 text-caption text-muted-foreground">
                                        <Activity className="h-3 w-3" />
                                        ST {r.creativeQuality} · PH {r.responsiveness} · GT {r.communication}
                                        <span className="ml-auto font-mono">{new Date(r.createdAt).toLocaleDateString('vi-VN')}</span>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            )}

            {/* ── Invoice 2-step flow — now WITH real deposit balance ── */}
            {invoiceOpen && (
                <MobileInvoiceFlow
                    open={invoiceOpen}
                    onClose={() => setInvoiceOpen(false)}
                    clientId={client.id}
                    clientName={client.name}
                    depositBalance={deposit}
                    workspaceId={workspaceId}
                />
            )}
        </div>
    )
}
