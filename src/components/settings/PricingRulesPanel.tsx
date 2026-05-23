'use client'

/**
 * [Quick Create] Pricing Rules CRUD UI
 *
 * Lists existing pricing rules for the workspace + provides create/edit/delete
 * actions. Each rule maps video duration → task price (USD + VND).
 *
 * Admin-only UI (parent page gates access via verifyWorkspaceAccess(ADMIN)).
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    Plus, Pencil, Trash2, Star, Loader2, X, DollarSign,
    Calculator, Layers, AlertCircle, Check,
} from 'lucide-react'
import { toast } from 'sonner'
import {
    createPricingRule, updatePricingRule, deletePricingRule, setDefaultPricingRule,
    type RuleType, type PricingRuleInput,
} from '@/actions/pricing-rule-actions'

/* ──────────────────────────────────────────────────────────────────── */
/*  Types                                                              */
/* ──────────────────────────────────────────────────────────────────── */

interface PricingRule {
    id: string
    name: string
    clientId: number | null
    ruleType: string
    config: any
    isDefault: boolean
    sortOrder: number
    client: { id: number; name: string } | null
}

interface ClientOption {
    id: number
    name: string
}

interface Props {
    workspaceId: string
    rules: PricingRule[]
    clients: ClientOption[]
}

const RULE_TYPE_META: Record<string, { label: string; icon: any; color: string }> = {
    flat: { label: 'Giá cố định', icon: DollarSign, color: 'emerald' },
    per_minute: { label: 'Theo phút', icon: Calculator, color: 'indigo' },
    tiered_duration: { label: 'Theo bậc', icon: Layers, color: 'violet' },
    custom: { label: 'Tùy chỉnh', icon: AlertCircle, color: 'amber' },
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Main panel                                                         */
/* ──────────────────────────────────────────────────────────────────── */

export default function PricingRulesPanel({ workspaceId, rules, clients }: Props) {
    const router = useRouter()
    const [, startTransition] = useTransition()
    const [editingRule, setEditingRule] = useState<PricingRule | null>(null)
    const [showCreate, setShowCreate] = useState(false)
    const [busyId, setBusyId] = useState<string | null>(null)

    async function handleSetDefault(ruleId: string) {
        setBusyId(ruleId)
        try {
            const res = await setDefaultPricingRule(ruleId, workspaceId)
            if ('error' in res) toast.error(res.error)
            else {
                toast.success('Đã đặt làm rule mặc định.')
                startTransition(() => router.refresh())
            }
        } finally {
            setBusyId(null)
        }
    }

    async function handleDelete(ruleId: string, name: string) {
        if (!confirm(`Xóa pricing rule "${name}"? Hành động này không thể hoàn tác.`))
            return
        setBusyId(ruleId)
        try {
            const res = await deletePricingRule(ruleId, workspaceId)
            if ('error' in res) toast.error(res.error)
            else {
                toast.success('Đã xóa rule.')
                startTransition(() => router.refresh())
            }
        } finally {
            setBusyId(null)
        }
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-zinc-100">Pricing Rules</h3>
                    <p className="text-sm text-zinc-400 mt-1">
                        Định nghĩa cách tính giá tự động theo độ dài video. Quick Create dùng các rule này khi tạo task hàng loạt.
                    </p>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
                >
                    <Plus size={16} /> Thêm rule
                </button>
            </div>

            {/* Rules list */}
            {rules.length === 0 ? (
                <div className="rounded-2xl bg-zinc-950/60 backdrop-blur-xl border border-white/5 p-8 text-center">
                    <Layers size={32} className="mx-auto text-zinc-600 mb-3" />
                    <p className="text-sm text-zinc-400 mb-1">Chưa có pricing rule nào.</p>
                    <p className="text-xs text-zinc-500">
                        Tạo rule đầu tiên để Quick Create có thể tự động tính giá task.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {rules.map((rule) => {
                        const meta = RULE_TYPE_META[rule.ruleType] ?? RULE_TYPE_META.custom
                        const Icon = meta.icon
                        const busy = busyId === rule.id
                        return (
                            <div
                                key={rule.id}
                                className="rounded-2xl bg-zinc-950/60 backdrop-blur-xl border border-[rgba(139,92,246,0.15)] p-4 transition-colors hover:border-[rgba(139,92,246,0.30)]"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                        <div className={`p-2 rounded-xl bg-${meta.color}-500/10 border border-${meta.color}-500/20`}>
                                            <Icon size={16} className={`text-${meta.color}-400`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h4 className="text-sm font-bold text-zinc-100 truncate">
                                                    {rule.name}
                                                </h4>
                                                {rule.isDefault && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold uppercase text-amber-300">
                                                        <Star size={10} className="fill-amber-300" />
                                                        Mặc định
                                                    </span>
                                                )}
                                                <span className="text-[11px] text-zinc-500">
                                                    {meta.label}
                                                </span>
                                            </div>
                                            <p className="text-xs text-zinc-400 mt-1">
                                                {rule.client
                                                    ? `Áp dụng cho client: ${rule.client.name}`
                                                    : 'Áp dụng cho toàn workspace (mặc định)'}
                                            </p>
                                            <ConfigPreview ruleType={rule.ruleType} config={rule.config} />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {!rule.isDefault && (
                                            <button
                                                onClick={() => handleSetDefault(rule.id)}
                                                disabled={busy}
                                                title="Đặt làm default"
                                                className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-amber-400 transition-colors disabled:opacity-50"
                                            >
                                                <Star size={14} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setEditingRule(rule)}
                                            disabled={busy}
                                            title="Sửa"
                                            className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-violet-300 transition-colors disabled:opacity-50"
                                        >
                                            <Pencil size={14} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(rule.id, rule.name)}
                                            disabled={busy}
                                            title="Xóa"
                                            className="p-2 rounded-lg hover:bg-red-500/10 text-zinc-400 hover:text-red-400 transition-colors disabled:opacity-50"
                                        >
                                            {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Create modal */}
            {showCreate && (
                <RuleFormModal
                    workspaceId={workspaceId}
                    clients={clients}
                    rule={null}
                    onClose={() => setShowCreate(false)}
                    onSaved={() => {
                        setShowCreate(false)
                        startTransition(() => router.refresh())
                    }}
                />
            )}

            {/* Edit modal */}
            {editingRule && (
                <RuleFormModal
                    workspaceId={workspaceId}
                    clients={clients}
                    rule={editingRule}
                    onClose={() => setEditingRule(null)}
                    onSaved={() => {
                        setEditingRule(null)
                        startTransition(() => router.refresh())
                    }}
                />
            )}
        </div>
    )
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Config preview (collapsed summary)                                 */
/* ──────────────────────────────────────────────────────────────────── */

function ConfigPreview({ ruleType, config }: { ruleType: string; config: any }) {
    if (!config) return null
    switch (ruleType) {
        case 'flat':
            return (
                <p className="text-[11px] text-zinc-500 mt-1.5">
                    ${config.priceUSD} · {Number(config.wageVND ?? 0).toLocaleString('vi-VN')} VND/video
                </p>
            )
        case 'per_minute':
            return (
                <p className="text-[11px] text-zinc-500 mt-1.5">
                    ${config.ratePerMinuteUSD}/phút · {Number(config.wagePerMinuteVND ?? 0).toLocaleString('vi-VN')} VND/phút
                    {config.minimumUSD ? ` · min $${config.minimumUSD}` : ''}
                </p>
            )
        case 'tiered_duration':
            return (
                <p className="text-[11px] text-zinc-500 mt-1.5">
                    {(config.tiers ?? []).length} bậc · max {(config.tiers?.[config.tiers.length - 1]?.maxSeconds ?? 0)}s
                </p>
            )
        default:
            return null
    }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Rule Form Modal                                                    */
/* ──────────────────────────────────────────────────────────────────── */

interface RuleFormProps {
    workspaceId: string
    clients: ClientOption[]
    rule: PricingRule | null
    onClose: () => void
    onSaved: () => void
}

function RuleFormModal({ workspaceId, clients, rule, onClose, onSaved }: RuleFormProps) {
    const isEdit = !!rule
    const [name, setName] = useState(rule?.name ?? '')
    const [clientId, setClientId] = useState<number | null>(rule?.clientId ?? null)
    const [ruleType, setRuleType] = useState<RuleType>((rule?.ruleType as RuleType) ?? 'flat')
    const [isDefault, setIsDefault] = useState(rule?.isDefault ?? false)
    const [config, setConfig] = useState<any>(rule?.config ?? getDefaultConfig('flat'))
    const [saving, setSaving] = useState(false)

    function handleTypeChange(newType: RuleType) {
        setRuleType(newType)
        setConfig(getDefaultConfig(newType))
    }

    async function handleSave() {
        if (!name.trim()) {
            toast.error('Vui lòng nhập tên rule.')
            return
        }

        setSaving(true)
        try {
            const input: PricingRuleInput = {
                name: name.trim(),
                clientId,
                ruleType,
                config,
                isDefault,
            }
            const res = isEdit
                ? await updatePricingRule(rule!.id, workspaceId, input)
                : await createPricingRule(workspaceId, input)

            if ('error' in res) {
                toast.error(res.error)
            } else {
                toast.success(isEdit ? 'Đã cập nhật rule.' : 'Đã tạo rule mới.')
                onSaved()
            }
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-zinc-950/95 backdrop-blur-xl border border-[rgba(139,92,246,0.20)] p-6"
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold text-zinc-100">
                        {isEdit ? 'Sửa Pricing Rule' : 'Tạo Pricing Rule'}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-zinc-400">
                        <X size={18} />
                    </button>
                </div>

                <div className="space-y-4">
                    {/* Name */}
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">
                            Tên rule
                        </label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder='Vd: "Dr. Marwan tiered"'
                            className="w-full px-4 py-3 rounded-xl bg-zinc-900/50 border border-white/10 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500/50"
                        />
                    </div>

                    {/* Client scope */}
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">
                            Phạm vi áp dụng
                        </label>
                        <select
                            value={clientId ?? ''}
                            onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : null)}
                            className="w-full px-4 py-3 rounded-xl bg-zinc-900/50 border border-white/10 text-sm text-zinc-100 focus:outline-none focus:border-violet-500/50"
                        >
                            <option value="">Toàn workspace (mặc định cho mọi client)</option>
                            {clients.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Rule type */}
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">
                            Loại tính giá
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {(['flat', 'per_minute', 'tiered_duration'] as const).map((t) => {
                                const meta = RULE_TYPE_META[t]
                                const Icon = meta.icon
                                return (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => handleTypeChange(t)}
                                        className={`px-3 py-3 rounded-xl border text-xs font-semibold transition-colors flex flex-col items-center gap-1 ${
                                            ruleType === t
                                                ? 'bg-violet-500/15 border-violet-500/50 text-violet-200'
                                                : 'bg-zinc-900/40 border-white/10 text-zinc-400 hover:border-white/20'
                                        }`}
                                    >
                                        <Icon size={16} />
                                        {meta.label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Config form (depends on ruleType) */}
                    <div className="rounded-2xl bg-zinc-900/40 border border-white/5 p-4">
                        {ruleType === 'flat' && <FlatConfigForm config={config} onChange={setConfig} />}
                        {ruleType === 'per_minute' && <PerMinuteConfigForm config={config} onChange={setConfig} />}
                        {ruleType === 'tiered_duration' && <TieredConfigForm config={config} onChange={setConfig} />}
                    </div>

                    {/* Default toggle */}
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={isDefault}
                            onChange={(e) => setIsDefault(e.target.checked)}
                            className="w-4 h-4 rounded border-white/20 bg-zinc-900 text-violet-500 focus:ring-violet-500"
                        />
                        <span className="text-sm text-zinc-200">Đặt làm rule mặc định cho workspace</span>
                    </label>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-white/5">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="px-4 py-2 rounded-full text-sm font-semibold text-zinc-300 hover:bg-white/5 transition-colors"
                    >
                        Hủy
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-5 py-2 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-bold transition-colors"
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        {isEdit ? 'Cập nhật' : 'Tạo rule'}
                    </button>
                </div>
            </div>
        </div>
    )
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Sub-forms                                                          */
/* ──────────────────────────────────────────────────────────────────── */

function getDefaultConfig(type: RuleType): any {
    switch (type) {
        case 'flat':
            return { priceUSD: 25, wageVND: 250000 }
        case 'per_minute':
            return { ratePerMinuteUSD: 15, wagePerMinuteVND: 100000, minimumUSD: 25, minimumVND: 250000 }
        case 'tiered_duration':
            return {
                tiers: [
                    { maxSeconds: 60, priceUSD: 25, wageVND: 250000 },
                    { maxSeconds: 120, priceUSD: 35, wageVND: 350000 },
                    { maxSeconds: 300, priceUSD: 50, wageVND: 500000 },
                ],
            }
        case 'custom':
            return { formula: 'base + (duration / 60) * rate', variables: { base: 25, rate: 10 } }
    }
}

function FlatConfigForm({ config, onChange }: { config: any; onChange: (c: any) => void }) {
    return (
        <div className="grid grid-cols-2 gap-3">
            <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">Giá USD</label>
                <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={config.priceUSD ?? 0}
                    onChange={(e) => onChange({ ...config, priceUSD: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900/60 border border-white/10 text-sm text-zinc-100"
                />
            </div>
            <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">Lương VND</label>
                <input
                    type="number"
                    min="0"
                    step="1000"
                    value={config.wageVND ?? 0}
                    onChange={(e) => onChange({ ...config, wageVND: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900/60 border border-white/10 text-sm text-zinc-100"
                />
            </div>
        </div>
    )
}

function PerMinuteConfigForm({ config, onChange }: { config: any; onChange: (c: any) => void }) {
    return (
        <div className="grid grid-cols-2 gap-3">
            <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">USD/phút</label>
                <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={config.ratePerMinuteUSD ?? 0}
                    onChange={(e) => onChange({ ...config, ratePerMinuteUSD: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900/60 border border-white/10 text-sm text-zinc-100"
                />
            </div>
            <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">VND/phút</label>
                <input
                    type="number"
                    min="0"
                    step="1000"
                    value={config.wagePerMinuteVND ?? 0}
                    onChange={(e) => onChange({ ...config, wagePerMinuteVND: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900/60 border border-white/10 text-sm text-zinc-100"
                />
            </div>
            <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">Min USD (optional)</label>
                <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={config.minimumUSD ?? 0}
                    onChange={(e) => onChange({ ...config, minimumUSD: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900/60 border border-white/10 text-sm text-zinc-100"
                />
            </div>
            <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">Min VND (optional)</label>
                <input
                    type="number"
                    min="0"
                    step="1000"
                    value={config.minimumVND ?? 0}
                    onChange={(e) => onChange({ ...config, minimumVND: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900/60 border border-white/10 text-sm text-zinc-100"
                />
            </div>
        </div>
    )
}

function TieredConfigForm({ config, onChange }: { config: any; onChange: (c: any) => void }) {
    const tiers = config.tiers ?? []

    function update(idx: number, field: string, value: number) {
        const newTiers = tiers.map((t: any, i: number) =>
            i === idx ? { ...t, [field]: value } : t
        )
        onChange({ ...config, tiers: newTiers })
    }

    function addTier() {
        const lastMax = tiers.length > 0 ? tiers[tiers.length - 1].maxSeconds : 60
        onChange({
            ...config,
            tiers: [
                ...tiers,
                { maxSeconds: lastMax + 60, priceUSD: 30, wageVND: 300000 },
            ],
        })
    }

    function removeTier(idx: number) {
        onChange({ ...config, tiers: tiers.filter((_: any, i: number) => i !== idx) })
    }

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-[10px] uppercase text-zinc-500 font-bold px-1">
                <div className="col-span-3">≤ Giây</div>
                <div className="col-span-4">USD</div>
                <div className="col-span-4">VND</div>
                <div className="col-span-1"></div>
            </div>
            {tiers.map((t: any, idx: number) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input
                        type="number"
                        min="1"
                        value={t.maxSeconds}
                        onChange={(e) => update(idx, 'maxSeconds', Number(e.target.value))}
                        className="col-span-3 px-2 py-1.5 rounded-lg bg-zinc-900/60 border border-white/10 text-sm text-zinc-100"
                    />
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={t.priceUSD}
                        onChange={(e) => update(idx, 'priceUSD', Number(e.target.value))}
                        className="col-span-4 px-2 py-1.5 rounded-lg bg-zinc-900/60 border border-white/10 text-sm text-zinc-100"
                    />
                    <input
                        type="number"
                        min="0"
                        step="1000"
                        value={t.wageVND}
                        onChange={(e) => update(idx, 'wageVND', Number(e.target.value))}
                        className="col-span-4 px-2 py-1.5 rounded-lg bg-zinc-900/60 border border-white/10 text-sm text-zinc-100"
                    />
                    <button
                        onClick={() => removeTier(idx)}
                        disabled={tiers.length <= 1}
                        className="col-span-1 p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-400 hover:text-red-400 disabled:opacity-30"
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}
            <button
                type="button"
                onClick={addTier}
                className="w-full mt-2 px-3 py-2 rounded-xl border border-dashed border-white/10 text-xs text-zinc-400 hover:border-violet-500/30 hover:text-violet-300 transition-colors flex items-center justify-center gap-1.5"
            >
                <Plus size={12} /> Thêm tier
            </button>
        </div>
    )
}
