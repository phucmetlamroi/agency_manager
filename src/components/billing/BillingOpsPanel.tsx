'use client'

// [BILLING P7] Panel vận hành thu phí — 3 mảng: phát hành code · đối soát tay · subscription.
// Client-fetch qua action (không props server) để bấm nút xong tự refetch được ngay.
// Mọi action bên dưới tự gác requireGlobalAdmin — panel chỉ là vỏ.

import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Gift, Loader2, RefreshCw, ShieldCheck, Ticket, Wallet } from 'lucide-react'
import { SELLABLE_PLANS, TRIAL } from '@/lib/billing/plans'
import {
    createRedemptionCode, revokeRedemptionCode, listRedemptionCodes,
    listUnmatchedPayments, resolveUnmatchedPayment, listSubscriptionsOps, grantOverride,
} from '@/actions/billing-actions'

type Codes = Extract<Awaited<ReturnType<typeof listRedemptionCodes>>, { success: true }>['codes']
type Payments = Extract<Awaited<ReturnType<typeof listUnmatchedPayments>>, { success: true }>['payments']
type Subs = Extract<Awaited<ReturnType<typeof listSubscriptionsOps>>, { success: true }>['subscriptions']

const fmtVND = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' ₫'
const fmtDate = (iso: string | null) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

const card = 'rounded-2xl border border-white/10 bg-zinc-900/50 p-6 shadow-xl backdrop-blur-xl'
const input = 'rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-violet-500/60 focus:outline-none'
const btn = 'inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/20 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-500/30 disabled:opacity-50'

export default function BillingOpsPanel() {
    const [codes, setCodes] = useState<Codes>([])
    const [payments, setPayments] = useState<Payments>([])
    const [subs, setSubs] = useState<Subs>([])
    const [busy, start] = useTransition()

    const reload = useCallback(() => {
        start(async () => {
            const [c, p, s] = await Promise.all([listRedemptionCodes(), listUnmatchedPayments(), listSubscriptionsOps()])
            if ('success' in c) setCodes(c.codes); else toast.error(c.error)
            if ('success' in p) setPayments(p.payments); else toast.error(p.error)
            if ('success' in s) setSubs(s.subscriptions); else toast.error(s.error)
        })
    }, [])
    useEffect(() => { reload() }, [reload])

    /* ── tạo code ─────────────────────────────────────────────────────────── */
    const [planCode, setPlanCode] = useState<string>(TRIAL.planCode)
    const [days, setDays] = useState<number>(TRIAL.days)
    const [maxUses, setMaxUses] = useState(1)
    const [note, setNote] = useState('')
    const makeCode = () => {
        start(async () => {
            const r = await createRedemptionCode({ planCode, durationDays: days, maxUses, note })
            if ('error' in r) { toast.error(r.error); return }
            navigator.clipboard.writeText(r.code).catch(() => {})
            toast.success(`Đã tạo ${r.code} (đã copy).`)
            setNote('')
            reload()
        })
    }

    /* ── override ─────────────────────────────────────────────────────────── */
    const [ovProfileId, setOvProfileId] = useState('')
    const [ovPlan, setOvPlan] = useState('AGENCY')
    const [ovSeats, setOvSeats] = useState(15)
    const [ovGB, setOvGB] = useState(500)
    const [ovMonths, setOvMonths] = useState<string>('12')
    const [ovNote, setOvNote] = useState('')
    const doGrant = () => {
        start(async () => {
            const r = await grantOverride({
                profileId: ovProfileId.trim(),
                planCode: ovPlan,
                overrideSeats: ovSeats,
                overrideStorageGB: ovGB,
                months: ovMonths === '' ? null : Number(ovMonths),
                note: ovNote,
            })
            if ('error' in r) { toast.error(r.error); return }
            toast.success('Đã cấp ngoại lệ.')
            setOvProfileId(''); setOvNote('')
            reload()
        })
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/40 bg-violet-500/15 text-violet-300"><ShieldCheck size={18} /></span>
                <div>
                    <h1 className="text-xl font-bold text-white">Vận hành thu phí</h1>
                    <p className="text-xs text-zinc-400">Bàn điều khiển của chủ Velox — phát code, đối soát SePay, ngoại lệ.</p>
                </div>
                <button onClick={reload} disabled={busy} className={`${btn} ml-auto`} aria-label="Tải lại">
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Tải lại
                </button>
            </div>

            {/* ── Đối soát tay ─────────────────────────────────────────────── */}
            <section className={card}>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Wallet size={15} className="text-amber-300" /> Tiền vào chưa khớp đơn ({payments.length})</h2>
                <p className="mt-1 text-xs text-zinc-500">Khách quên mã / gõ sai mã / chuyển thiếu. Xử lý xong (hoàn tiền, kích hoạt tay qua ngoại lệ…) thì bấm "Đã xử lý".</p>
                {payments.length === 0 ? (
                    <p className="mt-4 text-sm text-zinc-500">Sạch — mọi khoản tiền vào đều đã khớp.</p>
                ) : (
                    <div className="mt-4 space-y-2">
                        {payments.map((p) => (
                            <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm">
                                <span className="font-mono font-bold text-amber-200">{fmtVND(p.amountVND)}</span>
                                <span className="text-xs text-zinc-400">{p.gateway} · {fmtDate(p.transactionDate)}</span>
                                <span className="min-w-0 flex-1 truncate text-xs text-zinc-300" title={p.content}>"{p.content}"</span>
                                <button
                                    onClick={() => start(async () => {
                                        const r = await resolveUnmatchedPayment(p.id)
                                        if ('error' in r) toast.error(r.error); else { toast.success('Đã rút khỏi hàng chờ.'); reload() }
                                    })}
                                    disabled={busy}
                                    className={btn}
                                ><Check size={13} /> Đã xử lý</button>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* ── Codes ────────────────────────────────────────────────────── */}
            <section className={card}>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Ticket size={15} className="text-violet-300" /> Trial / gift code</h2>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                    <label className="text-xs text-zinc-400">Gói
                        <select value={planCode} onChange={(e) => setPlanCode(e.target.value)} className={`${input} mt-1 block`}>
                            {SELLABLE_PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </label>
                    <label className="text-xs text-zinc-400">Số ngày
                        <input type="number" min={1} max={730} value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${input} mt-1 block w-24`} />
                    </label>
                    <label className="text-xs text-zinc-400">Số lượt
                        <input type="number" min={1} max={10000} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} className={`${input} mt-1 block w-24`} />
                    </label>
                    <label className="min-w-0 flex-1 text-xs text-zinc-400">Ghi chú (phát cho ai / chiến dịch nào)
                        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="vd: trial cho anh Minh — agency Bờm Media" className={`${input} mt-1 block w-full`} />
                    </label>
                    <button onClick={makeCode} disabled={busy} className={btn}><Gift size={13} /> Tạo code</button>
                </div>
                <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead><tr className="text-zinc-500">
                            <th className="py-2 pr-3">Code</th><th className="py-2 pr-3">Gói</th><th className="py-2 pr-3">Ngày</th>
                            <th className="py-2 pr-3">Lượt</th><th className="py-2 pr-3">Ghi chú</th><th className="py-2 pr-3">Đã dùng bởi</th><th className="py-2"></th>
                        </tr></thead>
                        <tbody>
                            {codes.map((c) => (
                                <tr key={c.id} className={`border-t border-white/5 ${c.revokedAt ? 'opacity-40' : ''}`}>
                                    <td className="py-2 pr-3">
                                        <span className="font-mono text-violet-200">{c.code}</span>
                                        <button onClick={() => { navigator.clipboard.writeText(c.code); toast.success('Đã copy.') }} className="ml-1 text-zinc-500 hover:text-white" aria-label="Copy code"><Copy size={11} /></button>
                                    </td>
                                    <td className="py-2 pr-3">{c.planCode}</td>
                                    <td className="py-2 pr-3">{c.durationDays}</td>
                                    <td className="py-2 pr-3">{c.usedCount}/{c.maxUses}</td>
                                    <td className="max-w-[200px] truncate py-2 pr-3 text-zinc-400" title={c.note ?? ''}>{c.note ?? '—'}</td>
                                    <td className="max-w-[180px] truncate py-2 pr-3 text-zinc-400">{c.redemptions.map((r) => r.profileName).join(', ') || '—'}</td>
                                    <td className="py-2 text-right">
                                        {c.revokedAt ? <span className="text-zinc-500">đã thu hồi</span> : (
                                            <button
                                                onClick={() => start(async () => {
                                                    const r = await revokeRedemptionCode(c.id)
                                                    if ('error' in r) toast.error(r.error); else { toast.success('Đã thu hồi.'); reload() }
                                                })}
                                                disabled={busy}
                                                className="text-red-300 underline decoration-red-300/40 underline-offset-2 hover:text-red-200"
                                            >thu hồi</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* ── Subscriptions + ngoại lệ ─────────────────────────────────── */}
            <section className={card}>
                <h2 className="text-sm font-semibold text-white">Subscription ({subs.length})</h2>
                <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead><tr className="text-zinc-500">
                            <th className="py-2 pr-3">Tổ chức</th><th className="py-2 pr-3">Gói</th><th className="py-2 pr-3">Trạng thái (dẫn xuất)</th>
                            <th className="py-2 pr-3">Hết kỳ</th><th className="py-2 pr-3">Ngoại lệ</th><th className="py-2">profileId</th>
                        </tr></thead>
                        <tbody>
                            {subs.map((s) => (
                                <tr key={s.profileId} className="border-t border-white/5">
                                    <td className="py-2 pr-3 font-medium text-zinc-200">{s.profileName}</td>
                                    <td className="py-2 pr-3">{s.planCode}</td>
                                    <td className="py-2 pr-3">
                                        <span className={s.derivedStatus === 'ACTIVE' ? 'text-emerald-300' : s.derivedStatus === 'GRACE' ? 'text-amber-300' : 'text-red-300'}>{s.derivedStatus}</span>
                                    </td>
                                    <td className="py-2 pr-3">{fmtDate(s.periodEnd)}</td>
                                    <td className="max-w-[220px] truncate py-2 pr-3 text-zinc-400" title={s.overrideNote ?? ''}>
                                        {s.overrideSeats ? `${s.overrideSeats} ghế · ${s.overrideUntil ? `tới ${fmtDate(s.overrideUntil)}` : 'vĩnh viễn'}` : '—'}
                                    </td>
                                    <td className="py-2 font-mono text-[10px] text-zinc-500">
                                        {s.profileId.slice(0, 8)}…
                                        <button onClick={() => { navigator.clipboard.writeText(s.profileId); toast.success('Đã copy profileId.') }} className="ml-1 text-zinc-500 hover:text-white" aria-label="Copy profileId"><Copy size={10} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mt-6 rounded-xl border border-white/5 bg-zinc-950/40 p-4">
                    <h3 className="text-xs font-semibold text-zinc-300">Cấp / sửa ngoại lệ (D4)</h3>
                    <div className="mt-3 flex flex-wrap items-end gap-3">
                        <label className="min-w-0 flex-1 text-xs text-zinc-400">profileId
                            <input value={ovProfileId} onChange={(e) => setOvProfileId(e.target.value)} placeholder="copy từ bảng trên" className={`${input} mt-1 block w-full font-mono`} />
                        </label>
                        <label className="text-xs text-zinc-400">Gói
                            <select value={ovPlan} onChange={(e) => setOvPlan(e.target.value)} className={`${input} mt-1 block`}>
                                {[...SELLABLE_PLANS, 'ENTERPRISE'].map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </label>
                        <label className="text-xs text-zinc-400">Ghế
                            <input type="number" min={1} value={ovSeats} onChange={(e) => setOvSeats(Number(e.target.value))} className={`${input} mt-1 block w-20`} />
                        </label>
                        <label className="text-xs text-zinc-400">GB
                            <input type="number" min={1} value={ovGB} onChange={(e) => setOvGB(Number(e.target.value))} className={`${input} mt-1 block w-24`} />
                        </label>
                        <label className="text-xs text-zinc-400">Số tháng (trống = vĩnh viễn)
                            <input value={ovMonths} onChange={(e) => setOvMonths(e.target.value.replace(/\D/g, ''))} className={`${input} mt-1 block w-24`} />
                        </label>
                    </div>
                    <div className="mt-3 flex flex-wrap items-end gap-3">
                        <label className="min-w-0 flex-1 text-xs text-zinc-400">Lý do (BẮT BUỘC — 6 tháng sau còn biết vì sao)
                            <input value={ovNote} onChange={(e) => setOvNote(e.target.value)} placeholder="vd: D4 — khách đang dùng, 12 tháng thương lượng" className={`${input} mt-1 block w-full`} />
                        </label>
                        <button onClick={doGrant} disabled={busy || !ovProfileId.trim() || !ovNote.trim()} className={btn}><ShieldCheck size={13} /> Cấp ngoại lệ</button>
                    </div>
                </div>
            </section>
        </div>
    )
}
