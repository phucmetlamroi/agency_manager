'use client'
// [Giao diện 2 · Mission Control · M10 Add Task — Quick Create (2i)]
// PIXEL-FAITHFUL port of the imported design frame "Màn 10 — Add Task modal" (single-screen,
// 3 columns: ①Thông tin chung + ②Danh sách video | ③$ Tài chính | ④Tài nguyên + Ghi chú).
// Every color / padding / radius mirrors the design file 1:1.
//
// MONEY-SAFE BY CONSTRUCTION: this component only collects input and produces the EXACT same
// payload the /admin AddTaskModal produces, then calls the SAME `onSubmit`
// (DashboardActionWrapper.handleSubmitWrapped → createTask / createBatchTasks / …, all admin-
// re-checked server-side). Revenue / editor-% are DISPLAY ONLY (revenue = USD × exchangeRate;
// editor% = feeVND / revenueVND). No money math on the write path; /admin is untouched.
import { useMemo, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { Plus, X, Store, ChevronDown, Calendar, Wand2, Link2, Calculator, Eye, Search } from 'lucide-react'
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
    onSubmit?: (data: McAddTaskFormData) => void | Promise<void>
    pricingRules?: McPricingRule[]
    exchangeRate?: number
    portalToBody?: boolean
    onOpenVelox?: () => void
}

const DOT_GRADIENTS = [
    'linear-gradient(135deg,#F43F5E,#EC4899)',
    'linear-gradient(135deg,#06B6D4,#3B82F6)',
    'linear-gradient(135deg,#A855F7,#6366F1)',
    'linear-gradient(135deg,#10B981,#059669)',
    'linear-gradient(135deg,#F59E0B,#EF4444)',
]
function dotGradient(name: string): string {
    let h = 0
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
    return DOT_GRADIENTS[h % DOT_GRADIENTS.length]
}
function initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
}
function fmtVND(v: number): string { return Math.round(v).toLocaleString('vi-VN') }
function compactVND(v: number): string {
    if (!v) return '₫0'
    if (v >= 1_000_000) return `₫${(Math.round((v / 1_000_000) * 100) / 100).toString()}tr`
    return `₫${Math.round(v / 1000)}k`
}

/* Shared styles — mirror the design tokens exactly ----------------------- */
const LABEL: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.08em' }
const LABEL_RES: React.CSSProperties = { ...LABEL, letterSpacing: '0.06em' }
const FIELD_COL: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
// bordered "row" container (bg rgba(255,255,255,0.04) / border rgba(255,255,255,0.08))
function rowBox(borderColor = 'rgba(255,255,255,0.08)', bg = 'rgba(255,255,255,0.04)', pad = '8px 12px'): React.CSSProperties {
    return { display: 'flex', alignItems: 'center', gap: 8, padding: pad, borderRadius: 10, background: bg, border: `1px solid ${borderColor}` }
}
const BARE_INPUT: React.CSSProperties = { flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#F4F4F5', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }

function SectionBadge({ n, label, bg, border, color }: { n: number; label: string; bg: string; border: string; color: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 18, height: 18, borderRadius: 6, background: bg, border: `1px solid ${border}`, color, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color }}>{label}</span>
        </div>
    )
}

/* Person picker (editor / manager) — matches the design's row styling ----- */
function PersonPicker({
    value, onChange, options, variant,
}: {
    value: string
    onChange: (id: string) => void
    options: { id: string; label: string }[]
    variant: 'editor' | 'manager'
}) {
    const [openList, setOpenList] = useState(false)
    const [q, setQ] = useState('')
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpenList(false); setQ('') } }
        document.addEventListener('mousedown', h)
        return () => document.removeEventListener('mousedown', h)
    }, [])
    const selected = options.find((o) => o.id === value)
    const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options

    const box = variant === 'editor' && !selected
        ? rowBox('rgba(168,85,247,0.30)', 'rgba(168,85,247,0.06)')
        : rowBox()

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <div style={{ ...box, cursor: 'pointer' }} onClick={() => setOpenList((o) => !o)}>
                {variant === 'editor' ? (
                    selected ? (
                        <>
                            <span style={{ width: 20, height: 20, borderRadius: 999, background: dotGradient(selected.label), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff' }}>{initials(selected.label)}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#F4F4F5' }}>{selected.label}</span>
                            <ChevronDown style={{ width: 12, height: 12, color: '#71717A', marginLeft: 'auto' }} />
                        </>
                    ) : (
                        <>
                            <Store style={{ width: 13, height: 13, color: '#C084FC' }} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#C084FC' }}>Để trống — vào Chợ task (Chờ giao)</span>
                            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#71717A' }}>hoặc tìm người ▾</span>
                        </>
                    )
                ) : (
                    <>
                        <span style={{ width: 20, height: 20, borderRadius: 999, background: selected ? dotGradient(selected.label) : 'linear-gradient(135deg,#A855F7,#6366F1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff' }}>{selected ? initials(selected.label) : 'BP'}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#D4D4D8' }}>{selected ? selected.label : 'Mặc định — người tạo task'}</span>
                        <ChevronDown style={{ width: 12, height: 12, color: '#71717A', marginLeft: 'auto' }} />
                    </>
                )}
            </div>
            {openList && (
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, width: '100%', zIndex: 50, maxHeight: 210, overflowY: 'auto', borderRadius: 12, background: '#0B0B0D', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <Search style={{ width: 12, height: 12, color: '#71717A' }} />
                        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm người…" style={{ ...BARE_INPUT, fontSize: 12, fontWeight: 500, color: '#D4D4D8' }} />
                    </div>
                    <button type="button" onClick={() => { onChange(''); setOpenList(false); setQ('') }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', color: '#71717A', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>
                        {variant === 'editor' ? '🏪 Để trống — vào Chợ task' : 'Mặc định — người tạo task'}
                    </button>
                    {filtered.map((o) => (
                        <button key={o.id} type="button" onClick={() => { onChange(o.id); setOpenList(false); setQ('') }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: o.id === value ? 'rgba(99,102,241,0.12)' : 'none', border: 'none', color: o.id === value ? '#fff' : '#D4D4D8', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>{o.label}</button>
                    ))}
                    {filtered.length === 0 && <div style={{ padding: '10px 12px', fontSize: 12, color: '#52525B' }}>Không có kết quả</div>}
                </div>
            )}
        </div>
    )
}

export default function McAddTaskModal({
    open, onClose, workspaceId, clients, users, onSubmit, pricingRules = [], exchangeRate = 26300, portalToBody = false, onOpenVelox,
}: Props) {
    const router = useRouter()
    const [mounted, setMounted] = useState(false)
    useEffect(() => { setMounted(true) }, [])

    const [clientId, setClientId] = useState('')
    const [clientQuery, setClientQuery] = useState('')
    const [assigneeId, setAssigneeId] = useState('')
    const [managerId, setManagerId] = useState('')
    const [taskType, setTaskType] = useState('Short form')
    const [deadline, setDeadline] = useState('')
    const [videoList, setVideoList] = useState('')
    const [pricingRuleId, setPricingRuleId] = useState<string>('')
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

    const selectedClient = useMemo(() => clients.find((c) => c.id === clientId) ?? null, [clients, clientId])
    const clientMatches = useMemo(() => {
        const q = clientQuery.trim().toLowerCase()
        const src = q ? clients.filter((c) => (c.parent ? `${c.parent.name} ${c.name}` : c.name).toLowerCase().includes(q)) : clients
        return src.slice(0, 4)
    }, [clients, clientQuery])
    const hasExactClient = useMemo(() => clients.some((c) => c.name.trim().toLowerCase() === clientQuery.trim().toLowerCase()), [clients, clientQuery])

    const relevantRules = useMemo(() => {
        if (!clientId) return pricingRules.filter((r) => r.clientId == null)
        return pricingRules.filter((r) => r.clientId == null || String(r.clientId) === clientId)
    }, [pricingRules, clientId])

    // DISPLAY-ONLY money — identical formula to the wizard.
    const usdNum = parseFloat(jobPriceUSD) || 0
    const feeNum = parseFloat(editorFee) || 0
    const revenueVND = Math.round(usdNum * exchangeRate)
    const editorPct = revenueVND > 0 ? (feeNum / revenueVND) * 100 : 0
    const pctColor = editorPct >= 50 ? '#34D399' : '#FBBF24'

    const titles = useMemo(() => videoList.split('\n').map((s) => s.trim()).filter(Boolean), [videoList])
    const taskCount = Math.max(1, titles.length)
    const userOptions = useMemo(() => users.map((u) => ({ id: u.id, label: u.nickname || u.displayName || u.username })), [users])

    if (!open) return null

    function applyRule(rule: McPricingRule) {
        try {
            const p = calculatePrice({ ruleType: rule.ruleType, config: rule.config, name: rule.name }, 60)
            setJobPriceUSD(String(p.priceUSD ?? 0)); setEditorFee(String(p.wageVND ?? 0)); setPricingRuleId(rule.id)
        } catch { setPricingRuleId(rule.id) }
    }

    async function handleCreateClient() {
        const name = clientQuery.trim()
        if (!name || creatingClient) return
        setCreatingClient(true)
        try {
            const res = await createClient({ name }, workspaceId)
            if (res?.success) { toast.success(`Đã tạo khách "${name}". Chọn lại trong gợi ý bên dưới.`); router.refresh() }
            else toast.error(res?.error || 'Tạo khách hàng thất bại.')
        } catch { toast.error('Tạo khách hàng thất bại.') } finally { setCreatingClient(false) }
    }

    function resetForNext() {
        setVideoList(''); setRawFootage(''); setBRoll(''); setReferences(''); setScript(''); setCollectFile(''); setSubmitFolder(''); setNotes('')
    }

    async function handleCreate(keepOpen: boolean) {
        if (!clientId) { toast.error('Chọn khách hàng trước khi tạo task.'); return }
        if (submitting) return
        setSubmitting(true)
        try {
            await onSubmit?.({
                clientId, taskType: taskType.trim() || 'Short form', deadline, assigneeId, managerId, videoList,
                jobPriceUSD, editorFee, rawFootage, collectFile, bRoll, references, submitFolder, script,
                frameUsername: '', framePassword: '', frameNote: '', notes,
            })
            toast.success(`Đã tạo ${taskCount} task.`)
            if (keepOpen) resetForNext(); else onClose()
        } catch (e: any) { toast.error(e?.message || 'Tạo task thất bại.') } finally { setSubmitting(false) }
    }

    // Resource fields: [label, value, setter, placeholder]
    const resourceFields: [string, string, (v: string) => void, string][] = [
        ['Raw footage', rawFootage, setRawFootage, 'drive.google.com/…'],
        ['B-roll', bRoll, setBRoll, 'Link folder…'],
        ['Video tham khảo', references, setReferences, 'Shorts #12 — style caption'],
        ['Kịch bản', script, setScript, 'Link docs…'],
        ['File thu thập', collectFile, setCollectFile, 'Link Drive…'],
        ['Nơi nộp file', submitFolder, setSubmitFolder, 'drive.google.com/…submit'],
    ]

    const tree = (
        <div
            style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '32px 20px', fontFamily: FONT }}
            onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose() }}
        >
            {/* Modal — width 1150, radius 20, bg rgba(10,10,10,0.95) */}
            <div style={{ position: 'relative', width: '100%', maxWidth: 1150, borderRadius: 20, background: 'rgba(10,10,10,0.95)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 24px 60px rgba(0,0,0,0.75)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -60, right: -60, width: 190, height: 190, borderRadius: 999, background: 'rgba(99,102,241,0.08)', filter: 'blur(38px)', pointerEvents: 'none' }} />

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Plus style={{ width: 16, height: 16, color: '#A5B4FC' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: '#FFFFFF' }}>Thêm Task mới</span>
                        <span style={{ fontSize: 11, color: '#71717A' }}>Đủ trường như form cũ, gộp 1 màn — template điền sẵn giá, task quen thuộc vẫn chỉ 4 click</span>
                    </div>
                    <button type="button" onClick={() => { if (!submitting) onClose() }} style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A', cursor: 'pointer' }}>
                        <X style={{ width: 14, height: 14 }} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ display: 'flex', gap: 20, padding: '18px 22px' }}>

                    {/* COLUMN 1 — flex 1.05 */}
                    <div style={{ flex: 1.05, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                        <SectionBadge n={1} label="Thông tin chung" bg="rgba(99,102,241,0.18)" border="rgba(99,102,241,0.35)" color="#A5B4FC" />

                        {/* Client */}
                        <div style={FIELD_COL}>
                            <span style={LABEL}>Tên khách hàng</span>
                            {selectedClient ? (
                                <div style={rowBox('rgba(99,102,241,0.35)')}>
                                    <span style={{ width: 20, height: 20, borderRadius: 999, background: dotGradient(selectedClient.name), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff' }}>{initials(selectedClient.name)}</span>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#F4F4F5' }}>{selectedClient.parent ? `${selectedClient.parent.name} / ${selectedClient.name}` : selectedClient.name}</span>
                                    <button type="button" onClick={() => { setClientId(''); setPricingRuleId('') }} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#71717A', cursor: 'pointer', display: 'flex' }}><X style={{ width: 13, height: 13 }} /></button>
                                </div>
                            ) : (
                                <>
                                    <div style={rowBox('rgba(99,102,241,0.35)')}>
                                        <input value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} placeholder="Jac" style={BARE_INPUT} />
                                        <span style={{ fontSize: 10, color: '#71717A', whiteSpace: 'nowrap' }}>gõ tên — gợi ý bên dưới</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                        {clientMatches.map((c) => (
                                            <button key={c.id} type="button" onClick={() => { setClientId(c.id); setClientQuery('') }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 11, fontWeight: 600, color: '#A1A1AA', fontFamily: 'inherit', cursor: 'pointer' }}>
                                                <span style={{ width: 12, height: 12, borderRadius: 999, background: dotGradient(c.name) }} />
                                                <b style={{ color: '#D4D4D8' }}>{c.parent ? `${c.parent.name} / ${c.name}` : c.name}</b>
                                            </button>
                                        ))}
                                        {clientQuery.trim() && !hasExactClient && (
                                            <button type="button" onClick={handleCreateClient} disabled={creatingClient} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999, border: '1px dashed rgba(255,255,255,0.14)', background: 'none', fontSize: 11, fontWeight: 600, color: '#71717A', fontFamily: 'inherit', cursor: creatingClient ? 'wait' : 'pointer', opacity: creatingClient ? 0.6 : 1 }}>
                                                <Plus style={{ width: 11, height: 11 }} />tạo khách mới “{clientQuery.trim()}”
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Editor */}
                        <div style={FIELD_COL}>
                            <span style={LABEL}>Tên editor</span>
                            <PersonPicker value={assigneeId} onChange={setAssigneeId} options={userOptions} variant="editor" />
                        </div>

                        {/* Manager */}
                        <div style={FIELD_COL}>
                            <span style={LABEL}>Người quản lý</span>
                            <PersonPicker value={managerId} onChange={setManagerId} options={userOptions} variant="manager" />
                        </div>

                        {/* Type + Deadline */}
                        <div style={{ display: 'flex', gap: 10 }}>
                            <div style={{ flex: 1, ...FIELD_COL }}>
                                <span style={LABEL}>Loại task</span>
                                <div style={rowBox('rgba(255,255,255,0.08)', 'rgba(255,255,255,0.04)', '7px 12px')}>
                                    <input value={taskType} onChange={(e) => setTaskType(e.target.value)} placeholder="Short form" style={{ ...BARE_INPUT, fontWeight: 700, color: '#38BDF8' }} />
                                </div>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    <button type="button" onClick={() => setTaskType('Long form')} style={{ padding: '2px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 10, color: '#71717A', fontFamily: 'inherit', cursor: 'pointer' }}>gợi ý: Long form</button>
                                    <button type="button" onClick={() => setTaskType('Trial')} style={{ padding: '2px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 10, color: '#71717A', fontFamily: 'inherit', cursor: 'pointer' }}>Trial</button>
                                    <span style={{ padding: '2px 8px', borderRadius: 999, border: '1px dashed rgba(255,255,255,0.12)', fontSize: 10, color: '#71717A' }}>＋ gõ loại tùy ý</span>
                                </div>
                            </div>
                            <div style={{ flex: 1, ...FIELD_COL }}>
                                <span style={LABEL}>Deadline (ngày &amp; giờ)</span>
                                <div style={rowBox('rgba(99,102,241,0.35)', 'rgba(255,255,255,0.04)', '7px 12px')}>
                                    <Calendar style={{ width: 12, height: 12, color: '#A5B4FC', flexShrink: 0 }} />
                                    <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ ...BARE_INPUT, fontWeight: 700, colorScheme: 'dark' }} />
                                </div>
                            </div>
                        </div>

                        {/* Video list */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <span style={{ width: 18, height: 18, borderRadius: 6, background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.35)', color: '#A5B4FC', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>2</span>
                            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A5B4FC' }}>Danh sách video</span>
                            <span style={{ fontSize: 10, color: '#71717A' }}>mỗi dòng 1 video → 1 task</span>
                        </div>
                        <textarea value={videoList} onChange={(e) => setVideoList(e.target.value)} rows={3}
                            placeholder={'Shorts #16 — hook pricing\nShorts #17 — hook story\n| nhập tên video tiếp theo…'}
                            style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#F4F4F5', fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 12, lineHeight: 1.9, resize: 'vertical', outline: 'none' }} />
                        <span style={{ fontSize: 10, color: '#C084FC' }}>→ sẽ tạo <b>{taskCount} task</b> cùng thông số, đánh số tự động</span>
                    </div>

                    {/* COLUMN 2 — flex 0.95 */}
                    <div style={{ flex: 0.95, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                        <SectionBadge n={3} label="$ Tài chính" bg="rgba(16,185,129,0.15)" border="rgba(16,185,129,0.35)" color="#34D399" />

                        {/* Pricing templates */}
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            {relevantRules.map((r) => {
                                let p = { priceUSD: 0, wageVND: 0 }
                                try { const cp = calculatePrice({ ruleType: r.ruleType, config: r.config, name: r.name }, 60); p = { priceUSD: cp.priceUSD, wageVND: cp.wageVND } } catch { /* ignore */ }
                                const active = pricingRuleId === r.id
                                return (
                                    <button key={r.id} type="button" onClick={() => applyRule(r)} style={{ display: 'inline-flex', flexDirection: 'column', gap: 1, padding: '6px 12px', borderRadius: 12, background: active ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.03)', border: active ? '1px solid rgba(99,102,241,0.45)' : '1px solid rgba(255,255,255,0.08)', fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: active ? '#C7D2FE' : '#D4D4D8' }}>{r.name}</span>
                                        <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 9, color: active ? '#A5B4FC' : '#71717A' }}>${p.priceUSD} · {compactVND(p.wageVND)}</span>
                                    </button>
                                )
                            })}
                            <button type="button" onClick={() => setPricingRuleId('custom')} style={{ display: 'inline-flex', alignItems: 'center', padding: '6px 12px', borderRadius: 12, border: pricingRuleId === 'custom' ? '1px solid rgba(99,102,241,0.45)' : '1px dashed rgba(255,255,255,0.14)', background: pricingRuleId === 'custom' ? 'rgba(99,102,241,0.18)' : 'none', fontSize: 11, fontWeight: 600, color: pricingRuleId === 'custom' ? '#C7D2FE' : '#71717A', fontFamily: 'inherit', cursor: 'pointer' }}>tự nhập</button>
                        </div>

                        {/* USD */}
                        <div style={FIELD_COL}>
                            <span style={LABEL}>Tiền Job (USD)</span>
                            <div style={rowBox('rgba(255,255,255,0.08)', 'rgba(255,255,255,0.04)', '9px 12px')}>
                                <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 13, fontWeight: 700, color: '#4ADE80' }}>$</span>
                                <input type="number" value={jobPriceUSD} onChange={(e) => { setJobPriceUSD(e.target.value); setPricingRuleId('custom') }} placeholder="50.00" style={{ ...BARE_INPUT, fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 13, fontWeight: 700 }} />
                            </div>
                        </div>
                        {/* VND */}
                        <div style={FIELD_COL}>
                            <span style={LABEL}>Thù lao editor (VND)</span>
                            <div style={rowBox('rgba(255,255,255,0.08)', 'rgba(255,255,255,0.04)', '9px 12px')}>
                                <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 13, fontWeight: 700, color: '#FBBF24' }}>₫</span>
                                <input type="number" value={editorFee} onChange={(e) => { setEditorFee(e.target.value); setPricingRuleId('custom') }} placeholder="400.000" style={{ ...BARE_INPUT, fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 13, fontWeight: 700 }} />
                            </div>
                        </div>

                        {/* Profit card */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '11px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 11, color: '#71717A' }}>Tỷ giá</span><span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11, color: '#D4D4D8' }}>1 USD = {fmtVND(exchangeRate)} ₫</span></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 11, color: '#71717A' }}>Doanh thu</span><span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11, fontWeight: 700, color: '#F4F4F5' }}>{fmtVND(revenueVND)} ₫</span></div>
                            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 11, color: '#71717A' }}>Editor nhận</span><span style={{ fontSize: 12, fontWeight: 800, color: pctColor }}>{editorPct.toFixed(1)}% doanh thu</span></div>
                            <div style={{ height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.06)' }}><div style={{ width: `${Math.min(100, editorPct)}%`, height: '100%', borderRadius: 999, background: pctColor, transition: 'width 0.2s ease' }} /></div>
                            <span style={{ fontSize: 10, color: '#71717A' }}>&lt;30% cảnh báo thấp ⚠️ · &gt;50% cao ✅</span>
                        </div>

                        {/* Batch card */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 12, background: 'rgba(99,102,241,0.06)', border: '1px dashed rgba(99,102,241,0.30)' }}>
                            <Calculator style={{ width: 13, height: 13, color: '#A5B4FC', flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: '#A5B4FC' }}>Áp cho <b>{taskCount} video</b>: tổng ${(usdNum * taskCount).toLocaleString('en-US')} · thù lao ₫{fmtVND(feeNum * taskCount)}</span>
                        </div>
                    </div>

                    {/* COLUMN 3 — flex 1.1 */}
                    <div style={{ flex: 1.1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                        <SectionBadge n={4} label="Tài nguyên" bg="rgba(6,182,212,0.15)" border="rgba(6,182,212,0.35)" color="#22D3EE" />

                        {/* Velox bar */}
                        <button type="button" onClick={() => onOpenVelox?.()} disabled={!onOpenVelox} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'rgba(6,182,212,0.05)', border: '1px dashed rgba(6,182,212,0.30)', width: '100%', cursor: onOpenVelox ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                            <Wand2 style={{ width: 13, height: 13, color: '#22D3EE', flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: '#67E8F9', flex: 1, textAlign: 'left' }}>Dán link Dropbox / Drive…</span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.35)', color: '#22D3EE', whiteSpace: 'nowrap' }}>Đổ sẵn từ Velox</span>
                        </button>

                        {/* Resource grid 2×3 */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            {resourceFields.map(([lbl, val, setter, ph]) => (
                                <div key={lbl} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    <span style={LABEL_RES}>{lbl}</span>
                                    <div style={rowBox('rgba(255,255,255,0.08)', 'rgba(255,255,255,0.04)', '7px 10px')}>
                                        <Link2 style={{ width: 11, height: 11, color: val ? '#A5B4FC' : '#52525B', flexShrink: 0 }} />
                                        <input value={val} onChange={(e) => setter(e.target.value)} placeholder={ph} style={{ ...BARE_INPUT, fontSize: 11, fontWeight: 400, color: '#D4D4D8' }} />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Notes */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0 }}>
                            <span style={LABEL}>Ghi chú</span>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                <TiptapEditor content={notes} onChange={(html: string) => setNotes(html)} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 22px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                    <button type="button" onClick={() => handleCreate(false)} disabled={submitting} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 10, background: '#6366F1', color: '#fff', fontSize: 13, fontWeight: 700, boxShadow: '0 0 24px rgba(99,102,241,0.40)', border: 'none', fontFamily: 'inherit', cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.75 : 1 }}>
                        {submitting ? 'Đang tạo…' : `Tạo ${taskCount} task`}<span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 10, background: 'rgba(0,0,0,0.3)', padding: '1px 6px', borderRadius: 4 }}>↵</span>
                    </button>
                    <button type="button" onClick={() => handleCreate(true)} disabled={submitting} style={{ display: 'inline-flex', alignItems: 'center', padding: '11px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: '#D4D4D8', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Tạo &amp; thêm tiếp</button>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#71717A', marginLeft: 4 }}><Eye style={{ width: 12, height: 12 }} />Xem trước từng task trước khi tạo</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#71717A' }}>
                        {assigneeId ? <>Editor đã chọn</> : <>Editor để trống → cả {taskCount} task vào <b style={{ color: '#C084FC' }}>Chợ task</b> chờ giao</>}
                    </span>
                </div>
            </div>
        </div>
    )

    return portalToBody && mounted ? createPortal(tree, document.body) : tree
}
