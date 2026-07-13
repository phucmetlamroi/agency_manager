'use client'
// [Giao diện 2 · Mission Control · M10 Add Task — Quick Create]
// FAITHFUL port of the imported design frame "Thêm Task mới" — a SINGLE full-screen modal
// with 3 columns (1·THÔNG TIN CHUNG + 2·DANH SÁCH VIDEO | 3·$ TÀI CHÍNH | 4·TÀI NGUYÊN),
// NOT the /admin 5-step wizard. It re-skins the same task-creation flow.
//
// MONEY-SAFE BY CONSTRUCTION: this component only collects input and produces the EXACT same
// payload shape the /admin AddTaskModal produces, then calls the SAME `onSubmit`
// (DashboardActionWrapper.handleSubmitWrapped → createTask / createBatchTasks / …, all of which
// re-check ADMIN server-side and persist jobPriceUSD/value from the typed USD/VND fields). The
// revenue / editor-% figures here are DISPLAY ONLY (revenue = USD × exchangeRate; editor% =
// feeVND / revenueVND) — identical to what the wizard shows. No money math is re-implemented on
// the write path. `/admin` never renders this (DashboardActionWrapper layout='wizard' default).
import { useMemo, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { Plus, X, Search, Sparkles, Eye } from 'lucide-react'
import { AutocompleteInput } from '@/components/ui/AutocompleteInput'
import { calculatePrice } from '@/lib/pricing-engine'
import { createClient } from '@/actions/crm-actions'

const TiptapEditor = dynamic(() => import('@/components/tiptap/TiptapEditor'), { ssr: false })

const FONT = '"Plus Jakarta Sans", -apple-system, "Segoe UI", system-ui, sans-serif'

/** Exact field set the /admin AddTaskModal + DashboardActionWrapper.handleSubmit consume. */
export interface McAddTaskFormData {
    clientId: string
    taskType: string
    deadline: string
    assigneeId: string
    managerId: string
    videoList: string
    jobPriceUSD: string
    editorFee: string
    rawFootage: string
    collectFile: string
    bRoll: string
    references: string
    submitFolder: string
    script: string
    frameUsername: string
    framePassword: string
    frameNote: string
    notes: string
}

type McClient = { id: string; name: string; parentId?: string | null; parent?: { name: string } | null }
type McUser = { id: string; username: string; nickname?: string | null; displayName?: string | null }
type McPricingRule = { id: string; name: string; clientId: number | null; ruleType: string; config: any; isDefault: boolean }

interface Props {
    open: boolean
    onClose: () => void
    workspaceId: string
    clients: McClient[]
    users: McUser[]
    /** SAME contract as AddTaskModal.onSubmit — wired to the money-safe handleSubmitWrapped. */
    onSubmit?: (data: McAddTaskFormData) => void | Promise<void>
    pricingRules?: McPricingRule[]
    exchangeRate?: number
    /** Portal to <body> to escape the MC topbar's backdrop-filter containing block. */
    portalToBody?: boolean
    /** "Đổ sẵn từ Velox" → hand off to the full Velox scanner (the vetted wizard). Optional. */
    onOpenVelox?: () => void
}

const DOT_COLORS = ['#8B5CF6', '#EC4899', '#6366F1', '#10B981', '#F59E0B', '#06B6D4']
function dotColor(name: string): string {
    let h = 0
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
    return DOT_COLORS[h % DOT_COLORS.length]
}
function initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
}
function fmtVND(v: number): string {
    return Math.round(v).toLocaleString('vi-VN')
}
function compactVND(v: number): string {
    if (!v) return 'đ0'
    if (v >= 1_000_000) return `đ${(Math.round((v / 1_000_000) * 100) / 100).toString()}tr`
    return `đ${Math.round(v / 1000)}k`
}

/* Small styled bits ------------------------------------------------------- */
const inputStyle: React.CSSProperties = {
    width: '100%', height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)', color: '#F4F4F5', fontFamily: 'inherit',
    fontSize: 13, padding: '0 14px', outline: 'none',
}
const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: '#71717A', marginBottom: 7,
}

function SectionBadge({ n, label, accent, symbol }: { n: number; label: string; accent: string; symbol?: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
            <span style={{
                width: 22, height: 22, borderRadius: 7, background: `${accent}26`, border: `1px solid ${accent}55`,
                color: accent, fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{n}</span>
            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#D4D4D8' }}>
                {symbol && <span style={{ color: accent, marginRight: 4 }}>{symbol}</span>}{label}
            </span>
        </div>
    )
}

export default function McAddTaskModal({
    open, onClose, workspaceId, clients, users, onSubmit, pricingRules = [], exchangeRate = 26300, portalToBody = false, onOpenVelox,
}: Props) {
    const router = useRouter()
    const [mounted, setMounted] = useState(false)
    useEffect(() => { setMounted(true) }, [])

    // Form state — 1:1 with McAddTaskFormData.
    const [clientId, setClientId] = useState('')
    const [clientQuery, setClientQuery] = useState('')
    const [assigneeId, setAssigneeId] = useState('')
    const [managerId, setManagerId] = useState('')
    const [taskType, setTaskType] = useState('Short form')
    const [deadline, setDeadline] = useState('')
    const [videoList, setVideoList] = useState('')
    const [pricingRuleId, setPricingRuleId] = useState<string>('') // '' = none, 'custom' = tự nhập
    const [jobPriceUSD, setJobPriceUSD] = useState('')
    const [editorFee, setEditorFee] = useState('')
    const [rawFootage, setRawFootage] = useState('')
    const [bRoll, setBRoll] = useState('')
    const [references, setReferences] = useState('')
    const [script, setScript] = useState('')
    const [collectFile, setCollectFile] = useState('')
    const [submitFolder, setSubmitFolder] = useState('')
    const [notes, setNotes] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [creatingClient, setCreatingClient] = useState(false)
    const [showPreview, setShowPreview] = useState(false)

    const selectedClient = useMemo(() => clients.find((c) => c.id === clientId) ?? null, [clients, clientId])
    const clientLabel = selectedClient
        ? (selectedClient.parent ? `${selectedClient.parent.name} / ${selectedClient.name}` : selectedClient.name)
        : ''

    const clientMatches = useMemo(() => {
        const q = clientQuery.trim().toLowerCase()
        const src = q
            ? clients.filter((c) => (c.parent ? `${c.parent.name} ${c.name}` : c.name).toLowerCase().includes(q))
            : clients
        return src.slice(0, 4)
    }, [clients, clientQuery])
    const hasExactClient = useMemo(
        () => clients.some((c) => c.name.trim().toLowerCase() === clientQuery.trim().toLowerCase()),
        [clients, clientQuery],
    )

    // Pricing templates relevant to the chosen client (client-specific + workspace defaults).
    const relevantRules = useMemo(() => {
        if (!clientId) return pricingRules.filter((r) => r.clientId == null)
        return pricingRules.filter((r) => r.clientId == null || String(r.clientId) === clientId)
    }, [pricingRules, clientId])

    // Money — DISPLAY ONLY. Identical formula to the wizard: revenue = USD × rate; editor% = fee / revenue.
    const usdNum = parseFloat(jobPriceUSD) || 0
    const feeNum = parseFloat(editorFee) || 0
    const revenueVND = Math.round(usdNum * exchangeRate)
    const editorPct = revenueVND > 0 ? (feeNum / revenueVND) * 100 : 0
    const pctLow = editorPct > 0 && editorPct < 30
    const pctColor = pctLow ? '#FBBF24' : '#34D399'

    const titles = useMemo(
        () => videoList.split('\n').map((s) => s.trim()).filter(Boolean),
        [videoList],
    )
    const taskCount = Math.max(1, titles.length)

    const userOptions = useMemo(
        () => users.map((u) => ({ id: u.id, label: u.nickname || u.displayName || u.username })),
        [users],
    )

    if (!open) return null

    function applyRule(rule: McPricingRule) {
        try {
            const p = calculatePrice({ ruleType: rule.ruleType, config: rule.config, name: rule.name }, 60)
            setJobPriceUSD(String(p.priceUSD ?? 0))
            setEditorFee(String(p.wageVND ?? 0))
            setPricingRuleId(rule.id)
        } catch {
            setPricingRuleId(rule.id)
        }
    }

    async function handleCreateClient() {
        const name = clientQuery.trim()
        if (!name || creatingClient) return
        setCreatingClient(true)
        try {
            const res = await createClient({ name }, workspaceId)
            if (res?.success) {
                toast.success(`Đã tạo khách "${name}". Chọn lại trong gợi ý bên dưới.`)
                router.refresh() // server re-fetches clients → new one appears in matches to pick
            } else {
                toast.error(res?.error || 'Tạo khách hàng thất bại.')
            }
        } catch {
            toast.error('Tạo khách hàng thất bại.')
        } finally {
            setCreatingClient(false)
        }
    }

    function resetForNext() {
        setVideoList(''); setRawFootage(''); setBRoll(''); setReferences('')
        setScript(''); setCollectFile(''); setSubmitFolder(''); setNotes('')
    }

    async function handleCreate(keepOpen: boolean) {
        if (!clientId) { toast.error('Chọn khách hàng trước khi tạo task.'); return }
        if (submitting) return
        setSubmitting(true)
        try {
            await onSubmit?.({
                clientId,
                taskType: taskType.trim() || 'Short form',
                deadline,
                assigneeId,
                managerId,
                videoList,
                jobPriceUSD,
                editorFee,
                rawFootage,
                collectFile,
                bRoll,
                references,
                submitFolder,
                script,
                frameUsername: '',
                framePassword: '',
                frameNote: '',
                notes,
            })
            toast.success(`Đã tạo ${taskCount} task.`)
            if (keepOpen) resetForNext()
            else onClose()
        } catch (e: any) {
            toast.error(e?.message || 'Tạo task thất bại.')
        } finally {
            setSubmitting(false)
        }
    }

    const tree = (
        <div
            style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 20px', fontFamily: FONT }}
            onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose() }}
        >
            <div style={{ width: '100%', maxWidth: 1180, background: 'rgba(12,12,14,0.98)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, boxShadow: '0 40px 100px rgba(0,0,0,0.7)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(700px 400px at 8% -10%, rgba(99,102,241,0.10), transparent 60%),radial-gradient(700px 400px at 100% 0%, rgba(139,92,246,0.10), transparent 60%)', pointerEvents: 'none' }} />

                {/* Header */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 14, padding: '22px 26px 18px' }}>
                    <div style={{ width: 44, height: 44, borderRadius: 13, background: 'rgba(139,92,246,0.16)', border: '1px solid rgba(139,92,246,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Plus style={{ width: 22, height: 22, color: '#C4B5FD' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.01em' }}>Thêm Task mới</div>
                        <div style={{ fontSize: 12.5, color: '#A1A1AA', marginTop: 2 }}>Đủ trường như form cũ, gộp 1 màn — template điền sẵn giá, task quen thuộc vẫn chỉ 4 click</div>
                    </div>
                    <button type="button" onClick={() => { if (!submitting) onClose() }} style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A1A1AA', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                        <X style={{ width: 17, height: 17 }} />
                    </button>
                </div>

                {/* Body — 3 columns */}
                <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,0.95fr) minmax(0,1fr)', gap: 22, padding: '4px 26px 8px' }}>

                    {/* COLUMN 1 — Thông tin chung + Danh sách video */}
                    <div style={{ minWidth: 0 }}>
                        <SectionBadge n={1} label="Thông tin chung" accent="#818CF8" />

                        {/* Client */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={labelStyle}>Tên khách hàng</label>
                            {selectedClient ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, borderRadius: 12, background: 'rgba(139,92,246,0.10)', border: '1px solid rgba(139,92,246,0.28)', padding: '0 12px' }}>
                                    <span style={{ width: 24, height: 24, borderRadius: 999, background: dotColor(selectedClient.name), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{initials(selectedClient.name)}</span>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#F4F4F5', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clientLabel}</span>
                                    <button type="button" onClick={() => { setClientId(''); setPricingRuleId('') }} style={{ color: '#A1A1AA', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                                        <X style={{ width: 15, height: 15 }} />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div style={{ position: 'relative' }}>
                                        <Search style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#71717A' }} />
                                        <input
                                            value={clientQuery}
                                            onChange={(e) => setClientQuery(e.target.value)}
                                            placeholder="Gõ tên — gợi ý bên dưới"
                                            style={{ ...inputStyle, paddingLeft: 34 }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 9 }}>
                                        {clientMatches.map((c) => (
                                            <button key={c.id} type="button" onClick={() => { setClientId(c.id); setClientQuery('') }}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 11px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: '#E4E4E7', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>
                                                <span style={{ width: 8, height: 8, borderRadius: 999, background: dotColor(c.name) }} />
                                                {c.parent ? `${c.parent.name} / ${c.name}` : c.name}
                                            </button>
                                        ))}
                                        {clientQuery.trim() && !hasExactClient && (
                                            <button type="button" onClick={handleCreateClient} disabled={creatingClient}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.32)', color: '#A5B4FC', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: creatingClient ? 'wait' : 'pointer', opacity: creatingClient ? 0.6 : 1 }}>
                                                <Plus style={{ width: 12, height: 12 }} /> tạo khách mới “{clientQuery.trim()}”
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Editor */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={labelStyle}>Tên editor</label>
                            <AutocompleteInput
                                selectedId={assigneeId}
                                onSelect={setAssigneeId}
                                options={userOptions}
                                placeholder="Để trống — vào Chợ task (Chờ giao)"
                                emptyLabel="🏪 Để trống — vào Chợ task (Chờ giao)"
                            />
                        </div>

                        {/* Manager */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={labelStyle}>Người quản lý</label>
                            <AutocompleteInput
                                selectedId={managerId}
                                onSelect={setManagerId}
                                options={userOptions}
                                placeholder="Mặc định — người tạo task"
                                emptyLabel="Mặc định — người tạo task"
                            />
                        </div>

                        {/* Type + Deadline */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                            <div>
                                <label style={labelStyle}>Loại task</label>
                                <input value={taskType} onChange={(e) => setTaskType(e.target.value)} placeholder="Short form" style={inputStyle} />
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                    {['Long form', 'Trial'].map((t) => (
                                        <button key={t} type="button" onClick={() => setTaskType(t)}
                                            style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: '#A1A1AA', fontSize: 11.5, fontFamily: 'inherit', cursor: 'pointer' }}>{t}</button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label style={labelStyle}>Deadline (ngày & giờ)</label>
                                <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
                            </div>
                        </div>

                        {/* Video list */}
                        <SectionBadge n={2} label="Danh sách video" accent="#818CF8" />
                        <div style={{ fontSize: 10.5, color: '#71717A', marginTop: -8, marginBottom: 8 }}>mỗi dòng 1 video → 1 task</div>
                        <textarea
                            value={videoList}
                            onChange={(e) => setVideoList(e.target.value)}
                            placeholder={'Shorts #16 — hook pricing\nShorts #17 — hook story\nnhập tên video tiếp theo…'}
                            rows={5}
                            style={{ ...inputStyle, height: 'auto', padding: '12px 14px', resize: 'vertical', lineHeight: 1.7, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5 }}
                        />
                        <div style={{ fontSize: 11.5, color: '#818CF8', marginTop: 8 }}>→ sẽ tạo <b>{taskCount} task</b> cùng thông số, đánh số tự động</div>
                    </div>

                    {/* COLUMN 2 — Tài chính */}
                    <div style={{ minWidth: 0 }}>
                        <SectionBadge n={3} label="Tài chính" accent="#34D399" symbol="$" />

                        {/* Pricing templates */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                            {relevantRules.map((r) => {
                                let p = { priceUSD: 0, wageVND: 0 }
                                try { const cp = calculatePrice({ ruleType: r.ruleType, config: r.config, name: r.name }, 60); p = { priceUSD: cp.priceUSD, wageVND: cp.wageVND } } catch { /* ignore */ }
                                const active = pricingRuleId === r.id
                                return (
                                    <button key={r.id} type="button" onClick={() => applyRule(r)}
                                        style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 13px', borderRadius: 12, background: active ? 'rgba(139,92,246,0.16)' : 'rgba(255,255,255,0.03)', border: active ? '1px solid rgba(139,92,246,0.40)' : '1px solid rgba(255,255,255,0.08)', color: '#F4F4F5', fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
                                        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{r.name}</span>
                                        <span style={{ fontSize: 10.5, color: '#A1A1AA' }}>${p.priceUSD} · {compactVND(p.wageVND)}</span>
                                    </button>
                                )
                            })}
                            <button type="button" onClick={() => setPricingRuleId('custom')}
                                style={{ display: 'flex', alignItems: 'center', padding: '8px 13px', borderRadius: 12, background: pricingRuleId === 'custom' ? 'rgba(139,92,246,0.16)' : 'rgba(255,255,255,0.03)', border: pricingRuleId === 'custom' ? '1px solid rgba(139,92,246,0.40)' : '1px solid rgba(255,255,255,0.08)', color: '#D4D4D8', fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer' }}>tự nhập</button>
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <label style={labelStyle}>Tiền job (USD)</label>
                            <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#34D399', fontSize: 13, fontWeight: 700 }}>$</span>
                                <input type="number" value={jobPriceUSD} onChange={(e) => { setJobPriceUSD(e.target.value); setPricingRuleId('custom') }} placeholder="0.00" style={{ ...inputStyle, paddingLeft: 28 }} />
                            </div>
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <label style={labelStyle}>Thù lao editor (VND)</label>
                            <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#FBBF24', fontSize: 13, fontWeight: 700 }}>đ</span>
                                <input type="number" value={editorFee} onChange={(e) => { setEditorFee(e.target.value); setPricingRuleId('custom') }} placeholder="0" style={{ ...inputStyle, paddingLeft: 28 }} />
                            </div>
                        </div>

                        {/* Live profit card */}
                        <div style={{ borderRadius: 16, background: 'rgba(24,24,27,0.55)', border: '1px solid rgba(255,255,255,0.07)', padding: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 8 }}>
                                <span style={{ color: '#A1A1AA' }}>Tỷ giá</span>
                                <span style={{ color: '#E4E4E7' }}>1 USD = <b>{fmtVND(exchangeRate)}</b> đ</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 12 }}>
                                <span style={{ color: '#A1A1AA' }}>Doanh thu</span>
                                <span style={{ color: '#F4F4F5', fontWeight: 700 }}>{fmtVND(revenueVND)} đ</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 7 }}>
                                <span style={{ color: '#A1A1AA' }}>Editor nhận</span>
                                <span style={{ color: pctColor, fontWeight: 800 }}>{editorPct.toFixed(1)}% doanh thu</span>
                            </div>
                            <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${Math.min(100, editorPct)}%`, background: pctColor, borderRadius: 999, transition: 'width 0.2s ease' }} />
                            </div>
                            <div style={{ fontSize: 10.5, color: '#71717A', marginTop: 8 }}>&lt;30% cảnh báo thấp ⚠️ · &gt;50% cao ✅</div>
                        </div>

                        {taskCount >= 2 && (
                            <div style={{ marginTop: 12, borderRadius: 12, background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.22)', padding: '11px 14px', fontSize: 12, color: '#A5B4FC' }}>
                                📊 Áp cho <b>{taskCount} video</b>: tổng <b>${(usdNum * taskCount).toLocaleString('en-US')}</b> · thù lao <b>đ{fmtVND(feeNum * taskCount)}</b>
                            </div>
                        )}
                    </div>

                    {/* COLUMN 3 — Tài nguyên */}
                    <div style={{ minWidth: 0 }}>
                        <SectionBadge n={4} label="Tài nguyên" accent="#818CF8" />

                        {/* Velox bar */}
                        <button type="button" onClick={() => onOpenVelox?.()} disabled={!onOpenVelox}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, height: 46, borderRadius: 12, background: 'rgba(139,92,246,0.10)', border: '1px solid rgba(139,92,246,0.26)', padding: '0 12px', marginBottom: 16, cursor: onOpenVelox ? 'pointer' : 'default', color: '#C4B5FD', fontFamily: 'inherit' }}>
                            <Sparkles style={{ width: 16, height: 16, flexShrink: 0 }} />
                            <span style={{ flex: 1, textAlign: 'left', fontSize: 13, color: '#A1A1AA' }}>Dán link Dropbox / Drive…</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#C4B5FD', background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.30)', borderRadius: 8, padding: '4px 9px', whiteSpace: 'nowrap' }}>Đổ sẵn từ Velox</span>
                        </button>

                        {/* Resource fields — 2×3 grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                            {([
                                ['Raw footage', rawFootage, setRawFootage, 'drive.google.com/…'],
                                ['B-roll', bRoll, setBRoll, 'Link folder…'],
                                ['Video tham khảo', references, setReferences, 'Link video…'],
                                ['Kịch bản', script, setScript, 'Link docs…'],
                                ['File thu thập', collectFile, setCollectFile, 'Link Drive…'],
                                ['Nơi nộp file', submitFolder, setSubmitFolder, 'drive.google.com/…'],
                            ] as [string, string, (v: string) => void, string][]).map(([lbl, val, setter, ph]) => (
                                <div key={lbl}>
                                    <label style={labelStyle}>{lbl}</label>
                                    <input value={val} onChange={(e) => setter(e.target.value)} placeholder={ph} style={{ ...inputStyle, height: 40, fontSize: 12.5 }} />
                                </div>
                            ))}
                        </div>

                        {/* Notes */}
                        <label style={labelStyle}>Ghi chú</label>
                        <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
                            <TiptapEditor content={notes} onChange={(html: string) => setNotes(html)} />
                        </div>
                    </div>
                </div>

                {/* Preview strip */}
                {showPreview && (
                    <div style={{ position: 'relative', margin: '10px 26px 0', padding: '12px 16px', borderRadius: 12, background: 'rgba(24,24,27,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#71717A', marginBottom: 8 }}>Xem trước {taskCount} task</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {(titles.length ? titles : [clientLabel || 'Untitled Task']).map((t, i) => (
                                <div key={i} style={{ fontSize: 12.5, color: '#D4D4D8' }}>• {clientLabel ? `${clientLabel} · ` : ''}{t}</div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '18px 26px 22px', marginTop: 6 }}>
                    <button type="button" onClick={() => handleCreate(false)} disabled={submitting}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 46, padding: '0 22px', borderRadius: 12, background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', border: 'none', cursor: submitting ? 'wait' : 'pointer', boxShadow: '0 8px 24px rgba(99,102,241,0.35)', opacity: submitting ? 0.7 : 1 }}>
                        {submitting ? 'Đang tạo…' : `Tạo ${taskCount} task`} <span style={{ fontSize: 12, opacity: 0.8 }}>⏎</span>
                    </button>
                    <button type="button" onClick={() => handleCreate(true)} disabled={submitting}
                        style={{ height: 46, padding: '0 18px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: '#E4E4E7', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
                        Tạo &amp; thêm tiếp
                    </button>
                    <button type="button" onClick={() => setShowPreview((v) => !v)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#71717A', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}>
                        <Eye style={{ width: 14, height: 14 }} /> Xem trước từng task trước khi tạo
                    </button>
                    <div style={{ flex: 1 }} />
                    <div style={{ fontSize: 11.5, color: '#71717A', textAlign: 'right' }}>
                        {assigneeId ? '' : <>Editor để trống → cả {taskCount} task vào <b style={{ color: '#A1A1AA' }}>Chợ task</b> chờ giao</>}
                    </div>
                </div>
            </div>
        </div>
    )

    return portalToBody && mounted ? createPortal(tree, document.body) : tree
}
