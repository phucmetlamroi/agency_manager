'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { getBonusConfig, updateBonusConfig, type BonusConfigDTO } from '@/actions/bonus-config-actions'

/**
 * Cấu hình thưởng theo team (profile) — Top 1/2/3, mỗi hạng bật/tắt + %.
 * Top 1 bắt buộc bật. Thưởng = % × "Thực nhận" (doanh thu task Hoàn tất) của
 * người đứng hạng. Lưu theo profile, dùng lại mọi tháng.
 */
export default function BonusConfigModal({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
    const [cfg, setCfg] = useState<BonusConfigDTO>({
        top1Enabled: true,
        top1Percent: 0,
        top2Enabled: false,
        top2Percent: 0,
        top3Enabled: false,
        top3Percent: 0,
    })
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [isDefault, setIsDefault] = useState(false)

    useEffect(() => {
        let cancelled = false
        getBonusConfig(workspaceId)
            .then((res) => {
                if (cancelled) return
                if ('error' in res) {
                    toast.error(res.error)
                    onClose()
                    return
                }
                setCfg(res.config)
                setIsDefault(res.isDefault)
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [workspaceId, onClose])

    const setEnabled = (rank: 1 | 2 | 3, v: boolean) =>
        setCfg((c) => (rank === 1 ? { ...c, top1Enabled: v } : rank === 2 ? { ...c, top2Enabled: v } : { ...c, top3Enabled: v }))
    const setPercent = (rank: 1 | 2 | 3, v: number) =>
        setCfg((c) => (rank === 1 ? { ...c, top1Percent: v } : rank === 2 ? { ...c, top2Percent: v } : { ...c, top3Percent: v }))

    const rows: { rank: 1 | 2 | 3; label: string; emoji: string; enabled: boolean; percent: number; mandatory?: boolean }[] = [
        { rank: 1, label: 'Top 1', emoji: '🥇', enabled: cfg.top1Enabled, percent: cfg.top1Percent, mandatory: true },
        { rank: 2, label: 'Top 2', emoji: '🥈', enabled: cfg.top2Enabled, percent: cfg.top2Percent },
        { rank: 3, label: 'Top 3', emoji: '🥉', enabled: cfg.top3Enabled, percent: cfg.top3Percent },
    ]

    async function handleSave() {
        setSaving(true)
        try {
            const res = await updateBonusConfig(workspaceId, cfg)
            if ('error' in res) {
                toast.error(res.error)
                return
            }
            toast.success('Đã lưu cấu hình thưởng cho team')
            onClose()
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div
                className="relative w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-violet-500/15 grid place-items-center">
                            <Settings className="w-4 h-4 text-violet-400" />
                        </div>
                        <h3 className="text-lg font-bold text-zinc-100">Cấu hình thưởng</h3>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-white/5">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="px-5 pb-5">
                    <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
                        Áp dụng cho <b className="text-zinc-300">team này</b>, dùng lại mọi tháng. Thưởng ={' '}
                        <b className="text-zinc-300">%</b> × <b className="text-zinc-300">Thực nhận</b> của người đứng hạng.
                        {isDefault && <span className="text-amber-400/80"> (đang là mặc định — lưu để chỉnh riêng cho team)</span>}
                    </p>

                    {loading ? (
                        <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500">
                            <Loader2 className="w-4 h-4 animate-spin" /> Đang tải…
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {rows.map((r) => (
                                <div
                                    key={r.rank}
                                    className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                                        r.enabled ? 'border-violet-500/30 bg-violet-500/5' : 'border-white/10 bg-white/[0.02]'
                                    }`}
                                >
                                    <span className="text-xl">{r.emoji}</span>
                                    <span className="font-semibold text-zinc-100 text-sm w-12">{r.label}</span>
                                    <button
                                        type="button"
                                        disabled={r.mandatory}
                                        onClick={() => setEnabled(r.rank, !r.enabled)}
                                        className={`relative h-6 w-11 rounded-full transition-colors ${r.enabled ? 'bg-violet-500' : 'bg-zinc-700'} ${
                                            r.mandatory ? 'opacity-70 cursor-not-allowed' : ''
                                        }`}
                                        title={r.mandatory ? 'Top 1 bắt buộc bật' : r.enabled ? 'Tắt hạng này' : 'Bật hạng này'}
                                    >
                                        <span
                                            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${r.enabled ? 'left-[22px]' : 'left-0.5'}`}
                                        />
                                    </button>
                                    <div className="ml-auto flex items-center gap-1.5">
                                        <input
                                            type="number"
                                            min={0}
                                            max={100}
                                            step={0.1}
                                            disabled={!r.enabled}
                                            value={r.enabled ? (r.percent || '') : ''}
                                            onChange={(e) => setPercent(r.rank, Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                                            placeholder="0"
                                            className="w-20 bg-zinc-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-right text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50 disabled:opacity-40"
                                        />
                                        <span className="text-zinc-500 text-sm">%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex gap-3 pt-4">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-300 text-sm font-semibold hover:bg-white/10"
                        >
                            Huỷ
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || loading}
                            className="flex-1 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Lưu
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
