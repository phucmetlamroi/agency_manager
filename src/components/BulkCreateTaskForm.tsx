'use client'

import { useState, useEffect, useRef } from 'react'
import { createBatchTasks } from '@/actions/bulk-task-actions'
import ClientSelector from '@/components/crm/ClientSelector'
import { toast } from 'sonner'
import { Copy, Users, DollarSign, Link2, Rocket, Info, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import PriceTemplateSelector, { useRadialTrigger, PriceTemplateSelectorHandle } from '@/components/PriceTemplateSelector'

// ── Types ────────────────────────────────────────────────────
type User = {
    id: string
    username: string
    role: string
}

// ── Reusable Styled Input ────────────────────────────────────
const FormInput = ({ label, value, onChange, placeholder, type = 'text' }: any) => (
    <div>
        <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">{label}</label>
        <input type={type} value={value} onChange={onChange} placeholder={placeholder}
            className="w-full px-3 py-2.5 bg-zinc-900/60 border border-white/8 rounded-xl text-zinc-200 text-sm placeholder:text-zinc-700 focus:outline-none focus:border-indigo-500/50 focus:bg-zinc-900 transition-all duration-200"
        />
    </div>
)

const FormSelect = ({ label, value, onChange, children }: any) => (
    <div>
        <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">{label}</label>
        <select value={value} onChange={onChange}
            className="w-full px-3 py-2.5 bg-zinc-900/60 border border-white/8 rounded-xl text-zinc-200 text-sm focus:outline-none focus:border-indigo-500/50 transition-all duration-200">
            {children}
        </select>
    </div>
)

const SectionBlock = ({ icon: Icon, title, color = 'indigo', children }: any) => {
    const colorMap: Record<string, string> = {
        indigo: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/5',
        emerald: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
        blue: 'text-blue-400 border-blue-500/30 bg-blue-500/5',
    }
    return (
        <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
            <div className="flex items-center gap-2 mb-4">
                <Icon className="w-4 h-4" />
                <h4 className="text-xs font-bold uppercase tracking-widest">{title}</h4>
            </div>
            <div className="flex flex-col gap-3">
                {children}
            </div>
        </div>
    )
}

// ── Main Component ───────────────────────────────────────────
export default function BulkCreateTaskForm({ users, onSuccess, workspaceId }: { users: User[], onSuccess?: () => void, workspaceId: string }) {

    // ── State (logic unchanged) ───────────────────────────────
    const [rate, setRate] = useState<number>(26300)
    const [usd, setUsd] = useState<number>(0)
    const [usdDisplay, setUsdDisplay] = useState<string>('')
    const [wage, setWage] = useState<number>(0)
    const [wageDisplay, setWageDisplay] = useState<string>('')
    const [clientId, setClientId] = useState<number | null>(null)
    const [assigneeId, setAssigneeId] = useState<string>('')
    const [type, setType] = useState<string>('Short form')
    const [deadline, setDeadline] = useState<string>('')
    const [linkRaw, setLinkRaw] = useState<string>('')
    const [linkBroll, setLinkBroll] = useState<string>('')
    const [collectFilesLink, setCollectFilesLink] = useState<string>('')
    const [submissionFolder, setSubmissionFolder] = useState<string>('')
    const [references, setReferences] = useState<string>('')
    const [notes, setNotes] = useState<string>('')
    const [notesEn, setNotesEn] = useState<string>('')
    const [rawTitles, setRawTitles] = useState<string>('')
    const [parsedTitles, setParsedTitles] = useState<string[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [profitShare, setProfitShare] = useState<number>(0)
    const [revenueVnd, setRevenueVnd] = useState<number>(0)
    const selectorRef = useRef<PriceTemplateSelectorHandle>(null)
    const { onContainerMouseDown } = useRadialTrigger(selectorRef)

    const handleTemplateSelect = (data: { usd: number | null; vnd: number | null }) => {
        if (data.usd != null) {
            setUsd(data.usd)
            setUsdDisplay(data.usd.toLocaleString('vi-VN'))
        }
        if (data.vnd != null) {
            setWage(data.vnd)
            setWageDisplay(data.vnd.toLocaleString('vi-VN'))
        }
    }

    useEffect(() => {
        async function fetchRate() {
            try {
                const res = await fetch('/api/exchange-rate')
                const data = await res.json()
                if (data?.rate) setRate(Math.round(data.rate))
            } catch (e) { console.error("Rate fetch failed") }
        }
        fetchRate()
    }, [])

    useEffect(() => {
        const lines = rawTitles.split('\n').map(l => l.trim()).filter(l => l.length > 0)
        setParsedTitles(lines)
    }, [rawTitles])

    useEffect(() => {
        const rev = usd * rate
        setRevenueVnd(rev)
        if (rev > 0 && wage > 0) { setProfitShare((wage / rev) * 100) }
        else { setProfitShare(0) }
    }, [usd, wage, rate])

    const handleUsdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/\D/g, '')
        const num = parseFloat(raw)
        if (isNaN(num)) { setUsd(0); setUsdDisplay('') }
        else { setUsd(num); setUsdDisplay(num.toLocaleString('vi-VN')) }
    }

    const handleWageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/\D/g, '')
        const num = parseFloat(raw)
        if (isNaN(num)) { setWage(0); setWageDisplay('') }
        else { setWage(num); setWageDisplay(num.toLocaleString('vi-VN')) }
    }

    const handleSubmit = async () => {
        if (parsedTitles.length === 0) return toast.error('Vui lòng nhập ít nhất 1 tên task')
        if (!clientId) return toast.error('Vui lòng chọn khách hàng')
        setIsSubmitting(true)
        const res = await createBatchTasks({
            titles: parsedTitles,
            clientId,
            assigneeId: assigneeId || null,
            deadline: deadline || null,
            jobPriceUSD: usd,
            exchangeRate: rate,
            wageVND: wage,
            resources: (linkRaw || linkBroll || submissionFolder) ? `RAW: ${linkRaw.trim()} | BROLL: ${linkBroll.trim()} | SUBMISSION: ${submissionFolder.trim()}` : null,
            references: references || null,
            collectFilesLink: collectFilesLink || null,
            notes: notes || null,
            notes_en: notesEn || null,
            type
        }, workspaceId)

        if (res.error) { toast.error(res.error) }
        else {
            toast.success(`✅ Đã tạo thành công ${res.count} task!`)
            setRawTitles('')
            if (onSuccess) onSuccess()
        }
        setIsSubmitting(false)
    }

    // ── Profit share visuals ──────────────────────────────────
    const profitColor = profitShare > 50 ? 'text-emerald-400' : profitShare < 30 ? 'text-red-400' : 'text-amber-400'
    const ProfitIcon = profitShare > 50 ? TrendingUp : profitShare < 30 ? TrendingDown : Minus

    // ── Render ────────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-300">

            {/* ── BLOCK 1: Core Info ─────────────────────────── */}
            <SectionBlock icon={Users} title="Thông tin chung" color="indigo">
                <ClientSelector onSelect={setClientId} workspaceId={workspaceId} />
                <div className="grid grid-cols-2 gap-3">
                    <FormSelect label="Loại Task" value={type} onChange={(e: any) => setType(e.target.value)}>
                        <option value="Short form">Short form</option>
                        <option value="Long form">Long form</option>
                        <option value="Trial">Trial</option>
                    </FormSelect>
                    <FormInput label="Deadline" type="datetime-local" value={deadline} onChange={(e: any) => setDeadline(e.target.value)} />
                </div>
                <FormSelect label="Giao cho nhân viên" value={assigneeId} onChange={(e: any) => setAssigneeId(e.target.value)}>
                    <option value="">-- Để trống (Kho Task) --</option>
                    {users
                        .filter(u => u.role !== 'CLIENT' && u.role !== 'LOCKED')
                        .map((u) => <option key={u.id} value={u.id}>{u.username}</option>)
                    }
                </FormSelect>
            </SectionBlock>

            {/* ── BLOCK 2: Finance ──────────────────────────── */}
            <div onMouseDown={onContainerMouseDown}>
            <SectionBlock icon={DollarSign} title={<span className="flex items-center gap-2">{"T\u00e0i ch\u00ednh"} <PriceTemplateSelector workspaceId={workspaceId} onSelect={handleTemplateSelect} ref={selectorRef} /></span>} color="emerald">
                <div className="grid grid-cols-2 gap-3">
                    <FormInput label="Giá Job (USD)" value={usdDisplay} onChange={handleUsdChange} placeholder="0" />
                    <FormInput label="Thù lao Editor (VND)" value={wageDisplay} onChange={handleWageChange} placeholder="0" />
                </div>

                {/* Finance Summary */}
                <div className="rounded-lg bg-black/30 px-4 py-3 border border-white/5 text-xs space-y-1.5">
                    <div className="flex justify-between text-zinc-500">
                        <span className="flex items-center gap-1.5"><Info className="w-3 h-3" /> Tỷ giá</span>
                        <span className="font-mono text-zinc-400">1 USD = {rate.toLocaleString()} VND</span>
                    </div>
                    <div className="flex justify-between text-zinc-500">
                        <span>Doanh thu</span>
                        <span className="font-mono text-zinc-300">{revenueVnd.toLocaleString()} đ</span>
                    </div>
                    {usd > 0 && wage > 0 && (
                        <div className={`flex justify-between font-bold pt-1.5 border-t border-white/5 ${profitColor}`}>
                            <span className="flex items-center gap-1.5"><ProfitIcon className="w-3.5 h-3.5" /> Tỷ lệ Editor nhận</span>
                            <span className="font-mono">{profitShare.toFixed(1)}%{profitShare < 30 ? ' ⚠️' : profitShare > 50 ? ' ✅' : ''}</span>
                        </div>
                    )}
                </div>
            </SectionBlock>
            </div>

            {/* ── BLOCK 3: Resources & Notes ────────────────── */}
            <SectionBlock icon={Link2} title="Tài nguyên & Ghi chú" color="blue">
                <div className="grid grid-cols-2 gap-3">
                    <FormInput label="Link Raw Footage" value={linkRaw} onChange={(e: any) => setLinkRaw(e.target.value)} placeholder="https://..." />
                    <FormInput label="Link B-Roll" value={linkBroll} onChange={(e: any) => setLinkBroll(e.target.value)} placeholder="https://..." />
                    <FormInput label="Project Mẫu / Collect Files" value={collectFilesLink} onChange={(e: any) => setCollectFilesLink(e.target.value)} placeholder="https://..." />
                    <FormInput label="Folder Nộp File" value={submissionFolder} onChange={(e: any) => setSubmissionFolder(e.target.value)} placeholder="https://..." />
                </div>
                <FormInput label="References (Link mẫu)" value={references} onChange={(e: any) => setReferences(e.target.value)} placeholder="https://..." />

                {/* Notes VI */}
                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Ghi chú (Tiếng Việt)</label>
                        <button type="button" onClick={() => { navigator.clipboard.writeText(notes); toast.success('Đã copy nội dung tiếng Việt') }}
                            className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors">
                            <Copy size={10} /> Copy
                        </button>
                    </div>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ghi chú thêm cho Editor (Tiếng Việt)..." rows={3}
                        className="w-full px-3 py-2.5 bg-zinc-900/60 border border-white/8 rounded-xl text-zinc-200 text-sm placeholder:text-zinc-700 focus:outline-none focus:border-indigo-500/50 transition-all duration-200 resize-none" />
                </div>

                {/* Notes EN */}
                <div>
                    <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">English Notes</label>
                    <textarea value={notesEn} onChange={e => setNotesEn(e.target.value)} placeholder="Dán nội dung tiếng Anh vào đây..." rows={3}
                        className="w-full px-3 py-2.5 bg-zinc-900/60 border border-emerald-500/15 rounded-xl text-zinc-200 text-sm placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500/40 transition-all duration-200 resize-none" />
                    <p className="text-[10px] text-zinc-700 mt-1 italic">ℹ️ Tự dán kết quả dịch vào đây để tối ưu chi phí.</p>
                </div>
            </SectionBlock>

            {/* ── BLOCK 4: Task List ────────────────────────── */}
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-indigo-400 flex items-center gap-2">
                        <Rocket className="w-4 h-4" />
                        Danh sách Task ({parsedTitles.length})
                    </h4>
                    {parsedTitles.length > 0 && (
                        <span className="text-[10px] text-zinc-500 bg-zinc-800 px-2 py-1 rounded-full font-mono">
                            {parsedTitles.length} video
                        </span>
                    )}
                </div>
                <p className="text-[11px] text-zinc-600 mb-2">Paste danh sách tên video vào đây (Mỗi dòng 1 video)</p>
                <textarea
                    value={rawTitles}
                    onChange={e => setRawTitles(e.target.value)}
                    placeholder={`Video Intro\nVideo Review 1\nVideo Review 2`}
                    rows={8}
                    className="w-full px-3 py-2.5 bg-zinc-950/80 border border-indigo-500/20 rounded-xl text-zinc-200 font-mono text-sm leading-relaxed focus:outline-none focus:border-indigo-500/50 transition-all duration-200 resize-none"
                />
            </div>

            {/* ── Submit Button ─────────────────────────────── */}
            <button
                onClick={handleSubmit}
                disabled={isSubmitting || parsedTitles.length === 0}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-blue-500 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-base rounded-xl shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-[0.98]"
            >
                <Rocket className="w-5 h-5" />
                {isSubmitting ? 'Đang xử lý...' : `Tạo ${parsedTitles.length > 0 ? parsedTitles.length : ''} Task Ngay`}
            </button>
        </div>
    )
}
