'use client'

// [BILLING P5] Panel Gói cước — client, một file gồm 3 mảnh: trạng thái gói + nâng gói
// (3 card → checkout QR SePay) + nhập code. Style theo hệ glass hiện hành
// (bg-zinc-950/50 + border-white/10 + violet accent), toast = sonner, poll đơn 4s/lần.
//
// Bảng giá import THẲNG từ plans.ts (thuần dữ liệu, không server-dep) — không fetch,
// không chép số: đổi giá một chỗ là trang này tự đúng.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
    BadgeCheck, Check, Copy, CreditCard, Gift, HardDrive, Loader2, Lock, QrCode, Users, X,
} from 'lucide-react'
import {
    PLANS, SELLABLE_PLANS, chargeAmountVND, getPlan, monthlyPriceVND,
    type BillingCycle, type PlanCode, type PlanFeature,
} from '@/lib/billing/plans'
import {
    createSubscriptionOrder, getOrderStatus, redeemCode, type CheckoutInfo,
} from '@/actions/billing-actions'

/* ── props (đã serialize từ server) ─────────────────────────────────────── */

interface EntitlementsDto {
    planCode: PlanCode
    status: 'ACTIVE' | 'GRACE' | 'LOCKED'
    readOnly: boolean
    enforced: boolean
    daysLeft: number | null
    effectiveEnd: string | null
    graceEndsAt: string | null
    hasSubscription: boolean
    seatLimit: number | null
    storageLimitBytes: string | null
}

interface UsageDto {
    seats: number
    workspaces: number
    liveBytes: string
    liveBytesLabel: string
}

const fmtVND = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' ₫'
const fmtDate = (iso: string) => {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
const fmtGB = (bytesStr: string | null) => {
    if (bytesStr === null) return 'Không giới hạn'
    const n = Number(BigInt(bytesStr) / BigInt(1_000_000_000))
    return n >= 1000 ? `${n / 1000} TB` : `${n} GB`
}

/** Mô tả NGẮN từng quyền lợi cho card giá — nhãn marketing, nguồn sự thật vẫn là PlanFeature. */
const FEATURE_LABEL: Record<PlanFeature, string> = {
    VELOX: 'Velox quét thư mục tạo task',
    MARKETPLACE_PUBLISH: 'Đăng task lên chợ',
    SHARE_LINK_PROTECTION: 'Bảo vệ link review (mật khẩu, hạn, chặn tải)',
    PAYROLL_FULL: 'Bảng lương đầy đủ',
    PAYROLL_EXPORT: 'Xuất lương XLSX',
    INVOICING: 'Hoá đơn cho khách',
    FINANCE_SUITE: 'Tài chính: P&L + sổ thu + bảng giá',
    CLIENT_PORTAL: 'Cổng khách hàng (The Desk)',
    CLIENT_INTAKE: 'Khách tự gửi yêu cầu',
    MCP: 'MCP cho Claude/GPT',
    VERSION_COMPARE: 'So sánh phiên bản',
    ANALYTICS: 'Phân tích KPI đội ngũ',
    WHITE_LABEL: 'White-label (ẩn thương hiệu Velox)',
}

const STATUS_CHIP: Record<EntitlementsDto['status'], { text: string; cls: string }> = {
    ACTIVE: { text: 'Đang hoạt động', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
    GRACE: { text: 'Hết hạn — chỉ đọc', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
    LOCKED: { text: 'Chưa có gói', cls: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30' },
}

export default function BillingPanel({ workspaceId, entitlements: ent, usage, enforcementStartISO }: {
    workspaceId: string
    entitlements: EntitlementsDto
    usage: UsageDto
    enforcementStartISO: string | null
}) {
    const router = useRouter()
    const [cycle, setCycle] = useState<BillingCycle>('MONTHLY')
    const [extraSeats, setExtraSeats] = useState(0)
    const [checkout, setCheckout] = useState<CheckoutInfo | null>(null)
    const [creating, startCreate] = useTransition()
    const [code, setCode] = useState('')
    const [redeeming, startRedeem] = useTransition()

    const plan = getPlan(ent.planCode)
    const locked = ent.status === 'LOCKED'

    /* ── poll trạng thái đơn khi panel checkout đang mở ─────────────────── */
    const checkoutRef = useRef(checkout)
    checkoutRef.current = checkout
    useEffect(() => {
        if (!checkout) return
        const t = setInterval(async () => {
            const cur = checkoutRef.current
            if (!cur) return
            const res = await getOrderStatus(workspaceId, cur.orderId)
            if ('error' in res) return // mạng chớp — lần poll sau thử lại
            if (res.status === 'PAID') {
                setCheckout(null)
                toast.success(`Đã nhận thanh toán — gói ${getPlan((res.planCode ?? cur.planCode) as PlanCode).label} kích hoạt! 🎉`)
                router.refresh()
            } else if (res.status === 'EXPIRED' || res.status === 'CANCELED') {
                setCheckout(null)
                toast.error('Mã thanh toán đã hết hiệu lực. Tạo mã mới nhé.')
            }
        }, 4000)
        return () => clearInterval(t)
    }, [checkout, workspaceId, router])

    const startCheckout = (planCode: PlanCode) => {
        startCreate(async () => {
            const res = await createSubscriptionOrder(workspaceId, { planCode, billingCycle: cycle, extraSeats })
            if ('error' in res) { toast.error(res.error); return }
            setCheckout(res.checkout)
        })
    }

    const submitCode = () => {
        if (!code.trim()) return
        startRedeem(async () => {
            const res = await redeemCode(workspaceId, code)
            if ('error' in res) { toast.error(res.error); return }
            setCode('')
            toast.success(`Đã kích hoạt gói ${getPlan(res.planCode).label} tới ${fmtDate(res.periodEnd)}.`)
            router.refresh()
        })
    }

    const copy = (v: string, label: string) => {
        navigator.clipboard.writeText(v).then(() => toast.success(`Đã copy ${label}.`)).catch(() => toast.error('Không copy được.'))
    }

    const seatPct = ent.seatLimit ? Math.min(100, Math.round((usage.seats / ent.seatLimit) * 100)) : 0
    const storagePct = useMemo(() => {
        if (!ent.storageLimitBytes) return 0
        const used = Number(BigInt(usage.liveBytes) / BigInt(1_000_000))
        const cap = Number(BigInt(ent.storageLimitBytes) / BigInt(1_000_000))
        return cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0
    }, [ent.storageLimitBytes, usage.liveBytes])

    return (
        <div className="space-y-6 pt-6">
            <div>
                <h2 className="text-2xl font-bold text-white">Gói cước</h2>
                <p className="mt-1 text-sm text-zinc-400">
                    Gói sử dụng Velox của tổ chức — thanh toán chuyển khoản qua SePay hoặc nhập code.
                </p>
            </div>

            {/* ── Gói của bạn ─────────────────────────────────────────────── */}
            <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/50 p-6 shadow-xl backdrop-blur-xl">
                <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-violet-500 opacity-15 blur-[80px]" />
                <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/40 bg-violet-500/15 text-violet-300">
                        {locked ? <Lock size={18} /> : <BadgeCheck size={18} />}
                    </span>
                    <div className="min-w-0">
                        <div className="text-lg font-bold text-white">{locked ? 'Chưa có gói' : plan.label}</div>
                        <div className="text-xs text-zinc-400">
                            {ent.effectiveEnd
                                ? <>Hiệu lực tới <strong className="text-zinc-200">{fmtDate(ent.effectiveEnd)}</strong>{ent.daysLeft !== null ? ` · còn ${ent.daysLeft} ngày` : ''}</>
                                : locked ? 'Chọn gói bên dưới hoặc nhập code dùng thử' : 'Hiệu lực không giới hạn'}
                        </div>
                    </div>
                    <span className={`ml-auto rounded-full border px-3 py-1 text-xs font-medium ${STATUS_CHIP[ent.status].cls}`}>
                        {STATUS_CHIP[ent.status].text}
                    </span>
                </div>

                {!ent.enforced && enforcementStartISO && ent.status !== 'ACTIVE' && (
                    <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200">
                        Hệ thống bắt đầu thu phí từ <strong>{fmtDate(enforcementStartISO)}</strong>. Trước ngày đó mọi tính năng vẫn mở.
                    </p>
                )}
                {ent.status === 'GRACE' && (
                    <p className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2.5 text-xs text-red-200">
                        Dữ liệu đang <strong>chỉ-đọc</strong>{ent.graceEndsAt ? <> tới {fmtDate(ent.graceEndsAt)}</> : null} — xem và tải được, không tạo mới được. Gia hạn để mở lại.
                    </p>
                )}

                {/* đồng hồ dùng */}
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                    <div className="rounded-xl border border-white/5 bg-zinc-900/50 p-4">
                        <div className="flex items-center gap-2 text-xs text-zinc-400"><Users size={13} /> Ghế đang dùng</div>
                        <div className="mt-1 text-lg font-bold text-white">
                            {usage.seats}<span className="text-sm font-normal text-zinc-400"> / {ent.seatLimit ?? '∞'}</span>
                        </div>
                        {ent.seatLimit !== null && (
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                                <div className={`h-full rounded-full ${seatPct >= 90 ? 'bg-red-400' : 'bg-violet-400'}`} style={{ width: `${seatPct}%` }} />
                            </div>
                        )}
                    </div>
                    <div className="rounded-xl border border-white/5 bg-zinc-900/50 p-4">
                        <div className="flex items-center gap-2 text-xs text-zinc-400"><HardDrive size={13} /> Dung lượng</div>
                        <div className="mt-1 text-lg font-bold text-white">
                            {usage.liveBytesLabel}<span className="text-sm font-normal text-zinc-400"> / {fmtGB(ent.storageLimitBytes)}</span>
                        </div>
                        {ent.storageLimitBytes !== null && (
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                                <div className={`h-full rounded-full ${storagePct >= 90 ? 'bg-red-400' : 'bg-violet-400'}`} style={{ width: `${storagePct}%` }} />
                            </div>
                        )}
                        <p className="mt-1 text-[10px] text-zinc-500">Tính theo file đang hiển thị — thùng rác không tính.</p>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-zinc-900/50 p-4">
                        <div className="flex items-center gap-2 text-xs text-zinc-400"><Gift size={13} /> Nhập code</div>
                        <div className="mt-2 flex gap-2">
                            <input
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && submitCode()}
                                placeholder="VLX-XXXX-XXXX-XXXX"
                                className="w-full min-w-0 rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 font-mono text-xs uppercase text-white placeholder:text-zinc-600 focus:border-violet-500/60 focus:outline-none"
                            />
                            <button
                                onClick={submitCode}
                                disabled={redeeming || !code.trim()}
                                className="shrink-0 rounded-lg border border-violet-500/40 bg-violet-500/20 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-500/30 disabled:opacity-50"
                            >
                                {redeeming ? <Loader2 size={14} className="animate-spin" /> : 'Dùng'}
                            </button>
                        </div>
                        <p className="mt-1 text-[10px] text-zinc-500">Code dùng thử / code tặng — không có số 0 và 1.</p>
                    </div>
                </div>
            </section>

            {/* ── Nâng gói ────────────────────────────────────────────────── */}
            <section>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-semibold text-white">{locked ? 'Chọn gói' : 'Nâng / gia hạn gói'}</h3>
                    {/* Ghế mua thêm — áp vào gói được bấm; trần theo seatCap từng gói do server tự kẹp lại. */}
                    <div className="flex items-center gap-2 rounded-full border border-white/5 bg-zinc-900/40 px-3 py-1 text-xs text-zinc-300">
                        <Users size={12} className="text-zinc-500" />
                        Ghế thêm
                        <button onClick={() => setExtraSeats(v => Math.max(0, v - 1))} className="rounded px-1.5 text-zinc-400 hover:bg-white/5 hover:text-white" aria-label="Bớt ghế">−</button>
                        <span className="w-5 text-center font-semibold text-white">{extraSeats}</span>
                        <button onClick={() => setExtraSeats(v => Math.min(30, v + 1))} className="rounded px-1.5 text-zinc-400 hover:bg-white/5 hover:text-white" aria-label="Thêm ghế">+</button>
                    </div>
                    <div className="ml-auto flex items-center gap-1 rounded-full border border-white/5 bg-zinc-900/40 p-1">
                        {(['MONTHLY', 'ANNUAL'] as const).map((c) => (
                            <button
                                key={c}
                                onClick={() => setCycle(c)}
                                className={`rounded-full px-3 py-1 text-xs font-medium transition ${cycle === c ? 'border border-violet-500/40 bg-violet-500/20 text-violet-200' : 'text-zinc-400 hover:text-zinc-200'}`}
                            >
                                {c === 'MONTHLY' ? 'Hàng tháng' : 'Trả năm (rẻ hơn ~20%)'}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    {SELLABLE_PLANS.map((codeP) => {
                        const p = PLANS[codeP]
                        const perMonth = monthlyPriceVND(codeP, cycle)!
                        const isCurrent = ent.status === 'ACTIVE' && ent.planCode === codeP
                        return (
                            <div key={codeP} className={`relative flex flex-col overflow-hidden rounded-2xl border p-5 shadow-xl backdrop-blur-xl ${codeP === 'AGENCY' ? 'border-violet-500/40 bg-violet-950/20' : 'border-white/10 bg-zinc-950/50'}`}>
                                {codeP === 'AGENCY' && (
                                    <span className="absolute right-4 top-4 rounded-full border border-violet-500/40 bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold text-violet-200">Phổ biến</span>
                                )}
                                <div className="text-sm font-semibold text-zinc-300">{p.label}</div>
                                <div className="mt-1 text-2xl font-bold text-white">
                                    {fmtVND(perMonth)}<span className="text-sm font-normal text-zinc-400">/tháng</span>
                                </div>
                                {cycle === 'ANNUAL' && (
                                    <div className="text-[11px] text-zinc-500">thu một lần {fmtVND(perMonth * 12)}/năm</div>
                                )}
                                {extraSeats > 0 && p.limits.extraSeatVND !== null && (
                                    <div className="text-[11px] text-violet-300">
                                        + {extraSeats} ghế → tổng {fmtVND(chargeAmountVND(codeP, cycle, extraSeats)!)}
                                    </div>
                                )}
                                <ul className="mt-4 flex-1 space-y-1.5 text-xs text-zinc-300">
                                    <li className="flex gap-2"><Check size={13} className="mt-0.5 shrink-0 text-emerald-400" /> {p.limits.seatsIncluded} ghế (tối đa {p.limits.seatCap})</li>
                                    <li className="flex gap-2"><Check size={13} className="mt-0.5 shrink-0 text-emerald-400" /> {fmtGB(p.limits.storageBytes === null ? null : p.limits.storageBytes.toString())} lưu trữ</li>
                                    <li className="flex gap-2"><Check size={13} className="mt-0.5 shrink-0 text-emerald-400" /> Video {p.limits.videoQuality === 'UHD_4K' ? '4K' : '1080p'}</li>
                                    {p.features.slice(0, 6).map((f) => (
                                        <li key={f} className="flex gap-2"><Check size={13} className="mt-0.5 shrink-0 text-emerald-400" /> {FEATURE_LABEL[f]}</li>
                                    ))}
                                    {p.features.length > 6 && (
                                        <li className="pl-5 text-zinc-500">+ {p.features.length - 6} tính năng khác</li>
                                    )}
                                </ul>
                                <button
                                    onClick={() => startCheckout(codeP)}
                                    disabled={creating || isCurrent}
                                    className={`mt-5 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${codeP === 'AGENCY' ? 'bg-violet-600 text-white hover:bg-violet-500' : 'border border-white/15 bg-zinc-900/60 text-zinc-100 hover:bg-zinc-800/70'}`}
                                >
                                    {creating ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
                                    {isCurrent ? 'Gói hiện tại — gia hạn' : locked ? 'Chọn gói này' : 'Nâng lên gói này'}
                                </button>
                                {isCurrent && (
                                    <button
                                        onClick={() => startCheckout(codeP)}
                                        disabled={creating}
                                        className="mt-2 text-center text-[11px] text-violet-300 underline decoration-violet-300/40 underline-offset-2 hover:text-violet-200"
                                    >
                                        Tạo mã gia hạn thêm {cycle === 'ANNUAL' ? '12 tháng' : '1 tháng'}
                                    </button>
                                )}
                            </div>
                        )
                    })}
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                    Nâng gói giữa kỳ: số ngày còn lại của gói cũ được quy đổi theo tỷ lệ giá và cộng vào gói mới (làm tròn có lợi cho bạn).
                    Cần thêm ghế hoặc gói Enterprise? Liên hệ <a className="text-zinc-400 underline" href="mailto:support@hustlytasker.xyz">support@hustlytasker.xyz</a>.
                </p>
            </section>

            {/* ── Checkout overlay ────────────────────────────────────────── */}
            {checkout && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Thanh toán chuyển khoản">
                    <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
                        <button onClick={() => setCheckout(null)} className="absolute right-4 top-4 rounded-lg p-1 text-zinc-400 hover:bg-white/5 hover:text-white" aria-label="Đóng">
                            <X size={18} />
                        </button>
                        <div className="flex items-center gap-2 text-sm font-semibold text-white"><QrCode size={16} className="text-violet-300" /> Quét QR để thanh toán</div>
                        <p className="mt-1 text-xs text-zinc-400">
                            Gói {getPlan(checkout.planCode).label} · {checkout.billingCycle === 'ANNUAL' ? '12 tháng' : '1 tháng'}
                            {checkout.extraSeats > 0 ? ` · +${checkout.extraSeats} ghế` : ''} — mã hiệu lực tới {fmtDate(checkout.expiresAt)}
                        </p>

                        <div className="mt-4 flex justify-center rounded-xl bg-white p-3">
                            {/* eslint-disable-next-line @next/next/no-img-element -- QR SePay, host đã vào img-src CSP; next/image không có pattern cho host này */}
                            <img src={checkout.payTo.qrUrl} alt={`QR chuyển khoản ${fmtVND(checkout.amountVND)}`} width={220} height={220} />
                        </div>

                        <div className="mt-4 space-y-2 text-sm">
                            {([
                                ['Ngân hàng', checkout.payTo.bank],
                                ['Số tài khoản', checkout.payTo.accountNumber],
                                ['Số tiền', fmtVND(checkout.amountVND)],
                                ['Nội dung CK', checkout.paymentCode],
                            ] as const).map(([label, value]) => (
                                <div key={label} className="flex items-center gap-2 rounded-lg border border-white/5 bg-zinc-900/60 px-3 py-2">
                                    <span className="w-28 shrink-0 text-xs text-zinc-500">{label}</span>
                                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-100">{value}</span>
                                    <button onClick={() => copy(String(value), label.toLowerCase())} className="shrink-0 rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-white" aria-label={`Copy ${label}`}>
                                        <Copy size={13} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
                            Giữ ĐÚNG nội dung chuyển khoản <strong className="font-mono">{checkout.paymentCode}</strong> — hệ thống nhận diện thanh toán bằng mã này.
                        </p>

                        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-zinc-400">
                            <Loader2 size={13} className="animate-spin text-violet-300" />
                            Đang chờ chuyển khoản… gói kích hoạt tự động trong ~10 giây sau khi tiền vào.
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
