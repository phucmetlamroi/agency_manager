'use client'

// [Mobile design-handoff §2 (3j) / PR#3b · visual-parity redo] Hồ sơ khách mobile. VISUAL theo
// prototype: header back + tên + pill brand-con + pill tier; hero 3 chỉ số mono trên .m-card bg-2
// + orb indigo; chip brand con; segmented Task/Invoice/Đánh giá; thanh hành động đáy nét-đứt với
// Portal = primary indigo. Styling qua `.mroot .m-*`. LOGIC + actions giữ nguyên.
// GHI CHÚ: prototype hero là 'Kỳ này / Task / Chưa thu' nhưng doanh-thu-kỳ + chưa-thu KHÔNG có
// trong props → dùng 3 chỉ số CÓ THẬT (Task+chạy / Điểm TB / Số dư), không bịa số (risk-note).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, FileText, Share2, Star, Activity, Plus } from 'lucide-react'
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
    const runningCount = allTasks.filter((t: any) => t.status === 'Đang thực hiện').length
    const avgRating =
        ratings.length > 0
            ? ratings.reduce((acc, r) => acc + (r.creativeQuality + r.responsiveness + r.communication) / 3, 0) / ratings.length
            : 0
    const deposit = Number(client.depositBalance) || 0
    const subs = client.subsidiaries?.length ?? 0

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
        <section className="mroot m-scr flex min-h-dvh flex-col gap-2.5 px-4 pb-[calc(64px+env(safe-area-inset-bottom)+16px)] pt-2">
            {/* ── Header ── */}
            <div className="m-row" style={{ gap: 8 }}>
                <button
                    type="button"
                    onClick={() => router.back()}
                    aria-label="Quay lại"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors active:bg-white/10"
                    style={{ color: 'var(--m-fg-3)' }}
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <span style={{ minWidth: 0, flex: 1, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--m-fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</span>
                {subs > 0 && <span className="m-pill" style={{ flexShrink: 0 }}>{subs} brand con</span>}
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${tierCls}`}>{client.tier}</span>
            </div>

            {/* ── Hero 3-stat (chỉ số CÓ THẬT) ── */}
            <div className="m-card" style={{ background: 'var(--m-bg-2)', padding: '13px 15px', overflow: 'hidden' }}>
                <div className="m-orb" style={{ background: 'rgba(99,102,241,.10)', top: -44, right: -36 }} />
                <div style={{ display: 'flex', gap: 14 }}>
                    <div style={{ flex: 1 }}>
                        <div className="m-eb">Task</div>
                        <div className="m-mono" style={{ fontSize: 19, fontWeight: 800, marginTop: 2, whiteSpace: 'nowrap', color: 'var(--m-fg-1)' }}>
                            {totalTasksCount}<span style={{ fontSize: 10, fontWeight: 600, color: 'var(--m-fg-4)' }}> · {runningCount} chạy</span>
                        </div>
                    </div>
                    <div style={{ flex: 1 }}>
                        <div className="m-eb">Điểm TB</div>
                        <div className="m-mono" style={{ fontSize: 19, fontWeight: 800, marginTop: 2, color: avgRating > 0 ? 'var(--m-warning-fg)' : 'var(--m-fg-4)' }}>{avgRating > 0 ? avgRating.toFixed(1) : 'N/A'}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                        <div className="m-eb">Số dư</div>
                        <div className="m-mono" style={{ fontSize: 19, fontWeight: 800, marginTop: 2, whiteSpace: 'nowrap', color: 'var(--m-fg-1)' }}>${deposit.toLocaleString()}</div>
                    </div>
                </div>
            </div>

            {/* ── Brand chips ── */}
            {subs > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {client.subsidiaries.map((s: any) => (
                        <span key={s.id} className="m-pill">Brand: {s.name}</span>
                    ))}
                </div>
            )}

            {/* ── Segmented (bare) ── */}
            <div style={{ display: 'flex', gap: 4 }}>
                {([
                    ['tasks', 'Task'],
                    ['invoices', 'Invoice'],
                    ['ratings', 'Đánh giá'],
                ] as [TabKey, string][]).map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setTab(key)} className={tab === key ? 'm-seg on' : 'm-seg'}>
                        {label}
                    </button>
                ))}
            </div>

            {/* ── Task tab ── */}
            {tab === 'tasks' && (
                allTasks.length === 0 ? (
                    <p style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, fontStyle: 'italic', color: 'var(--m-fg-4)' }}>Chưa có task nào.</p>
                ) : (
                    <div className="m-card" style={{ display: 'flex', flexDirection: 'column' }}>
                        {allTasks.map((task: any, i: number) => {
                            const s = getStatusInfo(task.status)
                            return (
                                <div key={task.id} style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: i < allTasks.length - 1 ? '1px solid var(--m-border-1)' : 'none' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--m-fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
                                        <div style={{ fontSize: 10.5, color: 'var(--m-fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.brand} · {new Date(task.createdAt).toLocaleDateString('vi-VN')}</div>
                                    </div>
                                    <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>
                                        <span style={{ width: 6, height: 6, borderRadius: 999, background: s.color }} />
                                        {s.label}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                )
            )}

            {/* ── Invoice tab ── */}
            {tab === 'invoices' && (
                <div className="m-card" style={{ overflowX: 'auto', overscrollBehaviorX: 'contain', padding: 8 }}>
                    <ClientInvoicesTable invoices={client.invoices || []} clientId={client.id} workspaceId={workspaceId} />
                </div>
            )}

            {/* ── Ratings tab ── */}
            {tab === 'ratings' && (
                ratings.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '40px 0', color: 'var(--m-fg-4)' }}>
                        <Star className="h-8 w-8" style={{ opacity: 0.5 }} />
                        <p style={{ fontSize: 13, fontStyle: 'italic' }}>Chưa có nhận xét nào.</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {ratings.map((r) => {
                            const avg = ((r.creativeQuality + r.responsiveness + r.communication) / 3).toFixed(1)
                            return (
                                <div key={r.id} className="m-card" style={{ padding: 13 }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--m-fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.task.title}</div>
                                            <div style={{ marginTop: 2, fontSize: 10.5, color: 'var(--m-fg-4)' }}>Editor: <span style={{ color: 'var(--m-primary-fg)' }}>{r.staff.nickname || r.staff.username}</span></div>
                                        </div>
                                        <div className="m-mono" style={{ flexShrink: 0, fontSize: 24, fontWeight: 800, color: 'var(--m-warning-fg)' }}>{avg}</div>
                                    </div>
                                    {r.qualitativeFeedback && (
                                        <p className="m-note" style={{ marginTop: 8, fontStyle: 'italic', color: 'var(--m-fg-2)' }}>&ldquo;{r.qualitativeFeedback}&rdquo;</p>
                                    )}
                                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, color: 'var(--m-fg-4)' }}>
                                        <Activity className="h-3 w-3" />
                                        ST {r.creativeQuality} · PH {r.responsiveness} · GT {r.communication}
                                        <span className="m-mono" style={{ marginLeft: 'auto' }}>{new Date(r.createdAt).toLocaleDateString('vi-VN')}</span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )
            )}

            <div style={{ flex: 1 }} />

            {/* ── Bottom action bar (dashed top, Portal = primary) ── */}
            <div style={{ margin: '0 -16px', borderTop: '1.6px dashed rgba(99,102,241,.4)', padding: '9px 16px', display: 'flex', gap: 7 }}>
                {!client.parentId && (
                    <div style={{ flex: 1 }}>
                        <CreateSubClientButton parentId={client.id} parentName={client.name} workspaceId={workspaceId} />
                    </div>
                )}
                <button type="button" className="m-btnG" style={{ flex: 1 }} onClick={() => setInvoiceOpen(true)}>
                    <FileText className="h-4 w-4" /> Tạo invoice
                </button>
                <button type="button" className="m-btnP" style={{ flex: 1 }} disabled={portalPending} onClick={handlePortal}>
                    <Share2 className="h-4 w-4" /> {portalPending ? 'Đang tạo…' : 'Portal'}
                </button>
            </div>

            {/* ── Invoice 2-step flow — WITH real deposit balance ── */}
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
        </section>
    )
}
