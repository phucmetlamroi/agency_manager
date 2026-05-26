'use client'

/**
 * [Velox v1.0 — Phase 3 cleanup]
 *
 * Single-screen UI for prefilling AddTaskModal from cloud folder scan.
 * Velox is a STRICT prefill helper — never creates tasks itself.
 *
 * Flow:
 *   1. Paste Dropbox/Google Drive folder URL → click "Scan"
 *   2. System lists video files with metadata (duration, filename)
 *   3. User picks Client + Pricing Rule
 *   4. 8 automation toggles compute values: Short/Long classify, pricing,
 *      footage link, auto-name, inherit notes, auto-assign, uniform deadline
 *   5. Preview table shows per-video: title, duration, type, price USD, price VND
 *      — user can uncheck rows or edit inline
 *   6. Click "Áp dụng vào form" → payload passed back to AddTaskModal via
 *      `onApplyToForm` callback (required prop). AddTaskModal then routes:
 *      - N=1 → single-form prefill (Phase 1)
 *      - N≥2 → Batch Table mode (Phase 2)
 *
 * Phase 3 removed: legacy `createQuickTasks` self-create fallback path +
 * optional `onSuccess` prop.
 */

import { useState, useEffect, useMemo } from 'react'
import { Loader2, Link2, Sparkles, Rocket, AlertCircle, Search } from 'lucide-react'
import { toast } from 'sonner'
import {
    isCloudStorageUrl,
} from '@/lib/cloud-link-parser'
import {
    calculatePrice,
    classifyVideoType,
    formatDuration,
    type PricingResult,
} from '@/lib/pricing-engine'
import type { ScannedVideo } from '@/lib/cloud-scanner'
import { getLastClientNote, suggestRoundRobinAssignee } from '@/actions/velox-helpers-actions'
import { AutocompleteInput } from '@/components/ui/AutocompleteInput'
import type { VeloxApplyPayload, VeloxRow } from '@/lib/velox-helpers'

/* ──────────────────────────────────────────────────────────────────── */
/*  Types                                                              */
/* ──────────────────────────────────────────────────────────────────── */

interface ClientOption {
    id: number
    name: string
    /** [Quick Create] Parent client name for hierarchical display "Parent / Child" */
    parentName?: string | null
}

interface UserOption {
    id: string
    username: string
    nickname?: string | null
}

interface PricingRule {
    id: string
    name: string
    clientId: number | null
    ruleType: string
    config: any
    isDefault: boolean
}

interface Props {
    workspaceId: string
    clients: ClientOption[]
    users: UserOption[]
    pricingRules: PricingRule[]
    /** Current exchange rate snapshot — passed from parent */
    exchangeRate?: number
    /** [Velox v1.0] Required callback: Velox returns payload to parent
     *  (AddTaskModal) for form prefill. */
    onApplyToForm: (payload: VeloxApplyPayload) => void
}

interface PreviewRow {
    /** Stable id (cloud file id or random) */
    rowId: string
    /** Filename with extension, for display only */
    fullName: string
    /** Editable task title (filename without extension by default) */
    title: string
    durationSeconds: number
    /** Computed by classifyVideoType */
    type: 'Short form' | 'Long form'
    /** Computed by calculatePrice */
    priceUSD: number
    wageVND: number
    /** Original preview URL — used for resources field */
    previewUrl: string
    /** User can uncheck to exclude */
    selected: boolean
}

interface Toggles {
    detectVideo: boolean
    classifyDuration: boolean
    applyPricing: boolean
    linkFootage: boolean
    autoName: boolean
    inheritNotes: boolean
    autoAssign: boolean
    uniformDeadline: boolean
}

const DEFAULT_TOGGLES: Toggles = {
    detectVideo: true,
    classifyDuration: true,
    applyPricing: true,
    linkFootage: true,
    autoName: true,
    inheritNotes: false,
    autoAssign: false,
    uniformDeadline: false,
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Component                                                          */
/* ──────────────────────────────────────────────────────────────────── */

export default function QuickCreateMode({
    workspaceId,
    clients,
    users,
    pricingRules,
    exchangeRate = 26300,
    onApplyToForm,
}: Props) {
    const [url, setUrl] = useState('')
    const [scanning, setScanning] = useState(false)
    const [scannedVideos, setScannedVideos] = useState<ScannedVideo[]>([])
    const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])

    const [clientId, setClientId] = useState<number | null>(null)
    const [pricingRuleId, setPricingRuleId] = useState<string>('')
    const [assigneeId, setAssigneeId] = useState<string | null>(null)
    const [deadline, setDeadline] = useState('')
    const [titlePrefix, setTitlePrefix] = useState('')
    /** [Velox v1.0 spec 6.1] Note inheritance preview: source task title + sub-client name + date */
    const [inheritedNotes, setInheritedNotes] = useState<{
        note: string
        sourceTitle: string
        sourceClientName: string
        sourceDate: string
    } | null>(null)

    const [toggles, setToggles] = useState<Toggles>(DEFAULT_TOGGLES)

    // Filter pricing rules: client-specific first, fallback to workspace defaults
    const relevantRules = useMemo(() => {
        if (clientId == null) {
            return pricingRules.filter((r) => r.clientId == null)
        }
        // Client-specific + workspace default
        return pricingRules.filter((r) => r.clientId === clientId || r.clientId == null)
    }, [pricingRules, clientId])

    const selectedRule = useMemo(() => {
        if (!pricingRuleId) {
            // Auto-pick default if available
            return relevantRules.find((r) => r.isDefault) ?? relevantRules[0] ?? null
        }
        return relevantRules.find((r) => r.id === pricingRuleId) ?? null
    }, [pricingRuleId, relevantRules])

    /* ────────────────────────────────────────────────────────────────
       Scan handler
       ──────────────────────────────────────────────────────────────── */

    async function handleScan() {
        if (!url.trim()) {
            toast.error('Vui lòng dán URL folder.')
            return
        }
        if (!isCloudStorageUrl(url)) {
            toast.error('URL phải là Dropbox hoặc Google Drive folder.')
            return
        }
        setScanning(true)
        try {
            const res = await fetch('/api/integrations/scan-folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url.trim(), workspaceId }),
            })
            const data = await res.json()
            if (!res.ok) {
                if (data.requiresConnection) {
                    toast.error(
                        `${data.error} Vào Settings → Connectors để kết nối.`,
                    )
                } else {
                    toast.error(data.error ?? 'Scan thất bại.')
                }
                return
            }
            const videos = (data.videos as ScannedVideo[]) ?? []
            if (videos.length === 0) {
                toast.warning('Folder không có video nào.')
                setScannedVideos([])
                setPreviewRows([])
                return
            }
            setScannedVideos(videos)
            toast.success(`Đã scan ${videos.length} video.`)
        } catch (err: any) {
            toast.error(err?.message ?? 'Lỗi scan.')
        } finally {
            setScanning(false)
        }
    }

    /* ────────────────────────────────────────────────────────────────
       Recompute preview when scan / toggles / pricing change
       ──────────────────────────────────────────────────────────────── */

    useEffect(() => {
        if (scannedVideos.length === 0) {
            setPreviewRows([])
            return
        }
        // [Bug fix] PRESERVE user-controlled state across rebuilds.
        // Previously this effect rebuilt `previewRows` from scratch with
        // `selected: true` for every row whenever any dependency changed —
        // any reference churn (parent re-render with new prop ref, StrictMode
        // double-effect in dev) would silently re-check rows the user had
        // unchecked. Use functional setState + per-rowId lookup so user's
        // `selected` choice survives recomputes. Computed fields (title,
        // type, priceUSD, wageVND, duration) still refresh from toggles /
        // pricing rule as intended.
        setPreviewRows((prev) => {
            const prevById = new Map(prev.map((r) => [r.rowId, r]))
            return scannedVideos.map((v) => {
                const existing = prevById.get(v.fileId)

                const type: 'Short form' | 'Long form' = toggles.classifyDuration
                    ? classifyVideoType(v.durationSeconds)
                    : 'Short form'

                let pricing: PricingResult = {
                    priceUSD: 0,
                    wageVND: 0,
                    ruleApplied: 'none',
                }
                if (toggles.applyPricing && selectedRule) {
                    try {
                        pricing = calculatePrice(
                            {
                                ruleType: selectedRule.ruleType,
                                config: selectedRule.config,
                                name: selectedRule.name,
                            },
                            v.durationSeconds,
                        )
                    } catch (err) {
                        console.warn('[QuickCreate] pricing calc error:', err)
                    }
                }

                const baseTitle = toggles.autoName ? v.name : v.fullName
                const title = titlePrefix.trim()
                    ? `${titlePrefix.trim()} ${baseTitle}`
                    : baseTitle

                return {
                    rowId: v.fileId,
                    fullName: v.fullName,
                    title,
                    durationSeconds: v.durationSeconds,
                    type,
                    priceUSD: pricing.priceUSD,
                    wageVND: pricing.wageVND,
                    previewUrl: v.previewUrl,
                    // Preserve user's checkbox state — default to true ONLY for
                    // newly-discovered videos (no existing entry).
                    selected: existing ? existing.selected : true,
                }
            })
        })
    }, [scannedVideos, toggles, selectedRule, titlePrefix])

    /* ────────────────────────────────────────────────────────────────
       Auto-assign toggle: fetch round-robin suggestion
       ──────────────────────────────────────────────────────────────── */

    useEffect(() => {
        if (!toggles.autoAssign) return
        let cancelled = false
        ;(async () => {
            const suggestion = await suggestRoundRobinAssignee(workspaceId)
            if (cancelled || !suggestion) return
            setAssigneeId(suggestion.userId)
            toast.info(
                `Gợi ý gán cho: ${suggestion.nickname || suggestion.username} (${suggestion.activeCount} task đang xử lý)`,
            )
        })()
        return () => {
            cancelled = true
        }
    }, [toggles.autoAssign, workspaceId])

    /* ────────────────────────────────────────────────────────────────
       Inherit notes toggle: fetch from previous workspace
       ──────────────────────────────────────────────────────────────── */

    useEffect(() => {
        if (!toggles.inheritNotes || clientId == null) {
            setInheritedNotes(null)
            return
        }
        let cancelled = false
        ;(async () => {
            // [Velox v1.0 spec 6.1] Recursive sub-client search for last completed
            // task with non-empty notes_vi. Returns preview metadata.
            const result = await getLastClientNote(clientId, workspaceId)
            if (cancelled) return
            if (result) {
                setInheritedNotes(result)
                toast.info(
                    `Note kế thừa từ task "${result.sourceTitle}" (${result.sourceClientName}, ${result.sourceDate})`,
                )
            } else {
                setInheritedNotes(null)
                toast.warning('Không có note để kế thừa từ client này.')
            }
        })()
        return () => {
            cancelled = true
        }
    }, [toggles.inheritNotes, clientId, workspaceId])

    /* ────────────────────────────────────────────────────────────────
       Row controls
       ──────────────────────────────────────────────────────────────── */

    function toggleRowSelected(rowId: string) {
        setPreviewRows((rows) =>
            rows.map((r) => (r.rowId === rowId ? { ...r, selected: !r.selected } : r)),
        )
    }

    function updateRow(rowId: string, patch: Partial<PreviewRow>) {
        setPreviewRows((rows) =>
            rows.map((r) => {
                if (r.rowId !== rowId) return r
                const next = { ...r, ...patch }
                // [Quick Create] When duration changes manually, recalc price via
                // active rule (so user-input duration flows through tiered/per-minute pricing).
                if (
                    'durationSeconds' in patch &&
                    toggles.applyPricing &&
                    selectedRule &&
                    next.durationSeconds > 0
                ) {
                    try {
                        const pricing = calculatePrice(
                            {
                                ruleType: selectedRule.ruleType,
                                config: selectedRule.config,
                                name: selectedRule.name,
                            },
                            next.durationSeconds,
                        )
                        next.priceUSD = pricing.priceUSD
                        next.wageVND = pricing.wageVND
                    } catch (err) {
                        console.warn('[QuickCreate] recalc price after duration edit failed:', err)
                    }
                }
                return next
            }),
        )
    }

    /* ────────────────────────────────────────────────────────────────
       Submit
       ──────────────────────────────────────────────────────────────── */

    async function handleSubmit() {
        const selectedRows = previewRows.filter((r) => r.selected)
        if (selectedRows.length === 0) {
            toast.error('Vui lòng chọn ít nhất 1 video để áp dụng vào form.')
            return
        }
        if (!clientId) {
            toast.error('Vui lòng chọn Client.')
            return
        }
        if (toggles.uniformDeadline && !deadline) {
            toast.error('Vui lòng chọn deadline đồng loạt hoặc tắt toggle.')
            return
        }

        // [Velox v1.0 — Phase 3] Single entry point: hand off payload to parent
        // (AddTaskModal). Parent decides:
        //   - N=1  → single-form prefill (Phase 1)
        //   - N≥2  → Batch Table mode (Phase 2)
        // Velox NEVER creates tasks itself.
        const payload: VeloxApplyPayload = {
            rows: selectedRows.map<VeloxRow>((r) => ({
                rowId: r.rowId,
                title: r.title,
                type: r.type as VeloxRow['type'],
                priceUSD: r.priceUSD,
                wageVND: r.wageVND,
                durationSeconds: r.durationSeconds,
                previewUrl: r.previewUrl,
                selected: r.selected,
            })),
            common: {
                clientId,
                assigneeId,
                deadline: toggles.uniformDeadline && deadline ? deadline : null,
                inheritedNote: toggles.inheritNotes ? inheritedNotes?.note ?? null : null,
            },
            toggles: {
                linkFootage: toggles.linkFootage,
                autoName: toggles.autoName,
                applyPricing: toggles.applyPricing,
                inheritNotes: toggles.inheritNotes,
                autoAssign: toggles.autoAssign,
                uniformDeadline: toggles.uniformDeadline,
            },
        }
        onApplyToForm(payload)
        if (selectedRows.length === 1) {
            toast.success('Đã áp dụng vào form. Review + bấm "Add task" để tạo.')
        }
    }

    /* ────────────────────────────────────────────────────────────────
       Computed totals
       ──────────────────────────────────────────────────────────────── */

    const selectedCount = previewRows.filter((r) => r.selected).length
    const totalUSD = previewRows
        .filter((r) => r.selected)
        .reduce((s, r) => s + r.priceUSD, 0)
    const totalVND = previewRows
        .filter((r) => r.selected)
        .reduce((s, r) => s + r.wageVND, 0)

    /* ────────────────────────────────────────────────────────────────
       Render
       ──────────────────────────────────────────────────────────────── */

    return (
        <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar space-y-5">
            {/* Hero */}
            <div className="rounded-2xl bg-violet-500/[0.08] border border-violet-500/20 p-4 flex items-start gap-3">
                <div className="p-2 rounded-xl bg-violet-500/15 border border-violet-500/30 shrink-0">
                    <Rocket size={18} className="text-violet-300" />
                </div>
                <div className="flex-1">
                    <h3 className="text-sm font-extrabold text-violet-100">Velox</h3>
                    <p className="text-xs text-violet-200/70 mt-0.5 leading-relaxed">
                        Dán link folder Dropbox/Google Drive → tự động scan video, phân loại, tính giá và tạo task hàng loạt.
                    </p>
                </div>
            </div>

            {/* URL input */}
            <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-zinc-400 mb-2">
                    Link Folder
                </label>
                <div className="flex gap-2">
                    <div className="flex-1 relative">
                        <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://www.dropbox.com/scl/fo/... hoặc https://drive.google.com/drive/folders/..."
                            className="w-full pl-9 pr-3 py-3 rounded-xl bg-zinc-900/60 border border-white/10 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500/50"
                        />
                    </div>
                    <button
                        onClick={handleScan}
                        disabled={scanning || !url.trim()}
                        className="flex items-center gap-2 px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-bold transition-colors"
                    >
                        {scanning ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <Search size={14} />
                        )}
                        Scan
                    </button>
                </div>
            </div>

            {/* Config row: Client + Pricing rule */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-zinc-400 mb-2">
                        Client
                    </label>
                    {/* [Quick Create] Searchable autocomplete giống AddTaskModal — search theo
                        "Parent name + Child name" + hiển thị "Parent / Child" cho hierarchy */}
                    <AutocompleteInput
                        selectedId={clientId != null ? String(clientId) : ''}
                        onSelect={(id) => setClientId(id ? Number(id) : null)}
                        options={clients.map((c) => ({
                            id: String(c.id),
                            label: c.name,
                            parentLabel: c.parentName ?? undefined,
                        }))}
                        placeholder="Tìm client..."
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-zinc-400 mb-2">
                        Pricing Rule
                    </label>
                    <select
                        value={pricingRuleId}
                        onChange={(e) => setPricingRuleId(e.target.value)}
                        className="w-full px-3 py-3 rounded-xl bg-zinc-900/60 border border-white/10 text-sm text-zinc-100 focus:outline-none focus:border-violet-500/50"
                    >
                        <option value="">
                            {relevantRules.length === 0
                                ? '— Chưa có rule nào —'
                                : 'Tự động (default)'}
                        </option>
                        {relevantRules.map((r) => (
                            <option key={r.id} value={r.id}>
                                {r.name} {r.isDefault && '⭐'}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Automation toggles */}
            <div>
                <h4 className="text-xs font-bold uppercase tracking-wide text-zinc-400 mb-3">
                    Automation
                </h4>
                <div className="grid grid-cols-2 gap-2">
                    <ToggleRow
                        label="Tự nhận diện video"
                        checked={toggles.detectVideo}
                        onChange={(v) => setToggles({ ...toggles, detectVideo: v })}
                    />
                    <ToggleRow
                        label="Gắn link footage gốc"
                        checked={toggles.linkFootage}
                        onChange={(v) => setToggles({ ...toggles, linkFootage: v })}
                    />
                    <ToggleRow
                        label="Phân loại Short/Long"
                        checked={toggles.classifyDuration}
                        onChange={(v) => setToggles({ ...toggles, classifyDuration: v })}
                    />
                    <ToggleRow
                        label="Tự động đặt tên"
                        checked={toggles.autoName}
                        onChange={(v) => setToggles({ ...toggles, autoName: v })}
                    />
                    <ToggleRow
                        label="Áp dụng bảng giá"
                        checked={toggles.applyPricing}
                        onChange={(v) => setToggles({ ...toggles, applyPricing: v })}
                    />
                    <ToggleRow
                        label="Kế thừa ghi chú"
                        checked={toggles.inheritNotes}
                        onChange={(v) => setToggles({ ...toggles, inheritNotes: v })}
                    />
                    <ToggleRow
                        label="Gán editor tự động"
                        checked={toggles.autoAssign}
                        onChange={(v) => setToggles({ ...toggles, autoAssign: v })}
                    />
                    <ToggleRow
                        label="Đặt deadline đồng loạt"
                        checked={toggles.uniformDeadline}
                        onChange={(v) => setToggles({ ...toggles, uniformDeadline: v })}
                    />
                </div>
            </div>

            {/* Optional prefix */}
            {toggles.autoName && (
                <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-zinc-400 mb-2">
                        Tiền tố tên task (optional)
                    </label>
                    <input
                        value={titlePrefix}
                        onChange={(e) => setTitlePrefix(e.target.value)}
                        placeholder="Vd: [Tháng 5] — sẽ prepend vào mỗi task title"
                        className="w-full px-3 py-2.5 rounded-xl bg-zinc-900/60 border border-white/10 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500/50"
                    />
                </div>
            )}

            {/* Uniform deadline (when toggle ON) */}
            {toggles.uniformDeadline && (
                <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-zinc-400 mb-2">
                        Deadline đồng loạt
                    </label>
                    <input
                        type="date"
                        value={deadline}
                        onChange={(e) => setDeadline(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-zinc-900/60 border border-white/10 text-sm text-zinc-100 focus:outline-none focus:border-violet-500/50"
                    />
                </div>
            )}

            {/* Assignee picker (when auto-assign OFF or for manual override) */}
            <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-zinc-400 mb-2">
                    Editor (assignee)
                </label>
                <select
                    value={assigneeId ?? ''}
                    onChange={(e) => setAssigneeId(e.target.value || null)}
                    className="w-full px-3 py-2.5 rounded-xl bg-zinc-900/60 border border-white/10 text-sm text-zinc-100 focus:outline-none focus:border-violet-500/50"
                >
                    <option value="">— Để trống (đưa vào queue) —</option>
                    {users.map((u) => (
                        <option key={u.id} value={u.id}>
                            {u.nickname || u.username}
                        </option>
                    ))}
                </select>
            </div>

            {/* Preview table */}
            {previewRows.length > 0 && (
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-bold uppercase tracking-wide text-zinc-400">
                            Preview ({selectedCount} / {previewRows.length} video)
                        </h4>
                        {!selectedRule && toggles.applyPricing && (
                            <div className="flex items-center gap-1.5 text-[11px] text-amber-300">
                                <AlertCircle size={12} />
                                Chưa chọn pricing rule
                            </div>
                        )}
                    </div>
                    <div className="rounded-2xl bg-zinc-900/40 border border-white/5 overflow-hidden">
                        <div className="grid grid-cols-[28px_1fr_70px_90px_80px_100px] gap-2 px-3 py-2 text-[10px] font-bold uppercase text-zinc-500 border-b border-white/5">
                            <div></div>
                            <div>Tên task</div>
                            <div>Time</div>
                            <div>Type</div>
                            <div>USD</div>
                            <div>VND</div>
                        </div>
                        <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
                            {previewRows.map((row) => (
                                <div
                                    key={row.rowId}
                                    className={`grid grid-cols-[28px_1fr_70px_90px_80px_100px] gap-2 px-3 py-2 border-b border-white/5 text-xs ${
                                        row.selected ? 'text-zinc-200' : 'text-zinc-500 opacity-50'
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={row.selected}
                                        onChange={() => toggleRowSelected(row.rowId)}
                                        className="w-4 h-4 rounded border-white/20 bg-zinc-900 text-violet-500"
                                    />
                                    <input
                                        value={row.title}
                                        onChange={(e) => updateRow(row.rowId, { title: e.target.value })}
                                        disabled={!row.selected}
                                        className="bg-transparent border-0 px-1 py-0.5 text-xs focus:outline-none focus:bg-zinc-900/60 focus:rounded"
                                    />
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        placeholder="m:ss"
                                        value={row.durationSeconds > 0 ? formatDuration(row.durationSeconds) : ''}
                                        onChange={(e) => {
                                            const val = e.target.value.trim()
                                            // Parse "m:ss" or just seconds
                                            let totalSec = 0
                                            if (val.includes(':')) {
                                                const [m, s] = val.split(':')
                                                totalSec = (parseInt(m, 10) || 0) * 60 + (parseInt(s, 10) || 0)
                                            } else {
                                                totalSec = parseInt(val, 10) || 0
                                            }
                                            // Auto-reclassify Short/Long when toggle is on
                                            const newType: 'Short form' | 'Long form' =
                                                toggles.classifyDuration && totalSec > 120
                                                    ? 'Long form'
                                                    : toggles.classifyDuration && totalSec > 0
                                                      ? 'Short form'
                                                      : row.type
                                            updateRow(row.rowId, {
                                                durationSeconds: totalSec,
                                                type: newType,
                                            })
                                        }}
                                        disabled={!row.selected}
                                        title={row.durationSeconds === 0 ? 'Dropbox không trả về độ dài — nhập tay (vd: 1:30 hoặc 90)' : ''}
                                        className={`bg-transparent border-0 px-1 py-0.5 text-xs font-mono focus:outline-none focus:bg-zinc-900/60 focus:rounded w-full ${
                                            row.durationSeconds === 0 ? 'text-amber-300/70 placeholder-amber-300/40' : ''
                                        }`}
                                    />
                                    <select
                                        value={row.type}
                                        onChange={(e) =>
                                            updateRow(row.rowId, {
                                                type: e.target.value as 'Short form' | 'Long form',
                                            })
                                        }
                                        disabled={!row.selected}
                                        className="bg-transparent border-0 text-[11px] focus:outline-none focus:bg-zinc-900/60 focus:rounded"
                                    >
                                        <option value="Short form">Short</option>
                                        <option value="Long form">Long</option>
                                    </select>
                                    <input
                                        type="number"
                                        min="0"
                                        value={row.priceUSD}
                                        onChange={(e) =>
                                            updateRow(row.rowId, { priceUSD: Number(e.target.value) })
                                        }
                                        disabled={!row.selected}
                                        className="bg-transparent border-0 px-1 py-0.5 text-xs font-mono focus:outline-none focus:bg-zinc-900/60 focus:rounded"
                                    />
                                    <input
                                        type="number"
                                        min="0"
                                        value={row.wageVND}
                                        onChange={(e) =>
                                            updateRow(row.rowId, { wageVND: Number(e.target.value) })
                                        }
                                        disabled={!row.selected}
                                        className="bg-transparent border-0 px-1 py-0.5 text-xs font-mono focus:outline-none focus:bg-zinc-900/60 focus:rounded"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Summary + Submit */}
                    <div className="mt-4 rounded-2xl bg-zinc-900/60 border border-violet-500/20 p-4 flex items-center justify-between gap-4">
                        <div>
                            <div className="text-[10px] uppercase font-bold text-zinc-500">Tổng cộng</div>
                            <div className="text-sm font-bold text-zinc-100 mt-0.5">
                                {selectedCount} task ·{' '}
                                <span className="text-emerald-400">${totalUSD.toFixed(2)}</span> ·{' '}
                                <span className="text-violet-300">
                                    {totalVND.toLocaleString('vi-VN')} VND
                                </span>
                            </div>
                        </div>
                        {(() => {
                            // [Velox v1.0 spec 7.6] Disable when no video detected
                            // OR all 8 automation toggles OFF (no value to apply).
                            const allTogglesOff = !Object.values(toggles).some(Boolean)
                            const disabled =
                                selectedCount === 0 ||
                                !clientId ||
                                (scannedVideos.length === 0 && allTogglesOff)
                            const disableTitle =
                                scannedVideos.length === 0 && allTogglesOff
                                    ? 'Bật ít nhất 1 automation hoặc detect ít nhất 1 video'
                                    : !clientId
                                      ? 'Chọn Client trước'
                                      : selectedCount === 0
                                        ? 'Chọn ít nhất 1 video'
                                        : ''
                            return (
                                <button
                                    onClick={handleSubmit}
                                    disabled={disabled}
                                    title={disableTitle}
                                    className="flex items-center gap-2 px-6 py-3 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors"
                                >
                                    <Sparkles size={14} />
                                    Áp dụng vào form
                                </button>
                            )
                        })()}
                    </div>
                </div>
            )}

            {/* Empty state */}
            {scannedVideos.length === 0 && !scanning && (
                <div className="rounded-2xl bg-zinc-900/30 border border-dashed border-white/10 p-8 text-center">
                    <Sparkles size={28} className="mx-auto text-zinc-600 mb-2" />
                    <p className="text-sm text-zinc-400">Chưa scan folder nào.</p>
                    <p className="text-xs text-zinc-500 mt-1">
                        Dán link Dropbox/Google Drive folder ở trên rồi bấm Scan.
                    </p>
                </div>
            )}
        </div>
    )
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Toggle row sub-component                                           */
/* ──────────────────────────────────────────────────────────────────── */

function ToggleRow({
    label,
    checked,
    onChange,
}: {
    label: string
    checked: boolean
    onChange: (v: boolean) => void
}) {
    return (
        <label
            className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border cursor-pointer select-none transition-colors ${
                checked
                    ? 'bg-violet-500/10 border-violet-500/30 text-violet-100'
                    : 'bg-zinc-900/40 border-white/5 text-zinc-400 hover:border-white/10'
            }`}
        >
            <span className="text-xs font-semibold">{label}</span>
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-zinc-900 text-violet-500 focus:ring-violet-500"
            />
        </label>
    )
}
