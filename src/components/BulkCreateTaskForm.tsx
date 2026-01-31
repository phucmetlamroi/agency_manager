'use client'

import { useState, useEffect } from 'react'
import { createBatchTasks } from '@/actions/bulk-task-actions'
import ClientSelector from '@/components/crm/ClientSelector'

type User = {
    id: string
    username: string
    reputation: number
    role: string
}

export default function BulkCreateTaskForm({ users, onSuccess }: { users: User[], onSuccess?: () => void }) {
    // Common Data State
    const [rate, setRate] = useState<number>(25300)
    const [usd, setUsd] = useState<number>(0)
    const [usdDisplay, setUsdDisplay] = useState<string>('')
    const [wage, setWage] = useState<number>(0)
    const [wageDisplay, setWageDisplay] = useState<string>('')
    const [clientId, setClientId] = useState<number | null>(null)
    const [assigneeId, setAssigneeId] = useState<string>('')
    const [type, setType] = useState<string>('Short form')
    const [deadline, setDeadline] = useState<string>('')
    const [resources, setResources] = useState<string>('')
    const [references, setReferences] = useState<string>('')
    const [notes, setNotes] = useState<string>('')

    // Batch Data State
    const [rawTitles, setRawTitles] = useState<string>('')
    const [parsedTitles, setParsedTitles] = useState<string[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
        // Fetch Exchange Rate
        async function fetchRate() {
            try {
                const res = await fetch('https://open.er-api.com/v6/latest/USD')
                const data = await res.json()
                if (data?.rates?.VND) setRate(data.rates.VND)
            } catch (e) { console.error("Rate fetch failed") }
        }
        fetchRate()
    }, [])

    // Parse titles on change
    useEffect(() => {
        const lines = rawTitles.split('\n').map(l => l.trim()).filter(l => l.length > 0)
        setParsedTitles(lines)
    }, [rawTitles])

    const [profitShare, setProfitShare] = useState<number>(0)
    const [revenueVnd, setRevenueVnd] = useState<number>(0)

    // Calculate Profit Share
    useEffect(() => {
        const rev = usd * rate
        setRevenueVnd(rev)
        if (rev > 0 && wage > 0) {
            setProfitShare((wage / rev) * 100)
        } else {
            setProfitShare(0)
        }
    }, [usd, wage, rate])

    const handleUsdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/\D/g, '')
        const num = parseFloat(raw)
        if (isNaN(num)) {
            setUsd(0); setUsdDisplay('')
        } else {
            setUsd(num); setUsdDisplay(num.toLocaleString('vi-VN'))
        }
    }

    const handleWageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/\D/g, '')
        const num = parseFloat(raw)
        if (isNaN(num)) {
            setWage(0); setWageDisplay('')
        } else {
            setWage(num); setWageDisplay(num.toLocaleString('vi-VN'))
        }
    }

    const handleSubmit = async () => {
        if (parsedTitles.length === 0) return alert('Vui lòng nhập ít nhất 1 tên task')
        if (!clientId) return alert('Vui lòng chọn khách hàng')

        setIsSubmitting(true)
        const res = await createBatchTasks({
            titles: parsedTitles,
            clientId,
            assigneeId: assigneeId || null,
            deadline: deadline || null,
            jobPriceUSD: usd,
            exchangeRate: rate,
            wageVND: wage,
            resources: resources || null,
            references: references || null,
            notes: notes || null,
            type
        })

        if (res.error) {
            alert(res.error)
        } else {
            alert(`✅ Đã tạo thành công ${res.count} task!`)
            setRawTitles('')
            if (onSuccess) onSuccess()
        }
        setIsSubmitting(false)
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} className="animate-in fade-in zoom-in duration-300">

            {/* 1. Common Info Section */}
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                <h4 className="text-sm uppercase tracking-widest text-blue-400 mb-4 font-bold">1. Thông tin chung (Áp dụng cho cả lô)</h4>

                <ClientSelector onSelect={setClientId} />

                <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                        <label className="text-xs text-gray-400">Loại Task</label>
                        <select value={type} onChange={e => setType(e.target.value)}
                            className="w-full p-2 bg-[#222] border border-[#333] rounded text-white text-sm">
                            <option value="Short form">Short form</option>
                            <option value="Long form">Long form</option>
                            <option value="Trial">Trial</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-gray-400">Deadline</label>
                        <input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)}
                            className="w-full p-2 bg-[#222] border border-[#333] rounded text-white text-sm" />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                        <label className="text-xs text-gray-400">Giá Job (USD)</label>
                        <input value={usdDisplay} onChange={handleUsdChange} placeholder="0"
                            className="w-full p-2 bg-[#222] border border-[#333] rounded text-white text-sm" />
                    </div>
                    <div>
                        <label className="text-xs text-gray-400">Thù lao Editor (VND)</label>
                        <input value={wageDisplay} onChange={handleWageChange} placeholder="0"
                            className="w-full p-2 bg-[#222] border border-[#333] rounded text-white text-sm" />
                    </div>
                </div>

                {/* Financial Info */}
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.8rem', borderRadius: '6px', fontSize: '0.85rem', marginTop: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', color: '#aaa' }}>
                        <span>ℹ️ Tỷ giá: 1 USD = {rate.toLocaleString()} VND</span>
                        <span>Doanh thu: {revenueVnd.toLocaleString()} ₫</span>
                    </div>
                    {usd > 0 && wage > 0 && (
                        <div style={{
                            color: profitShare > 50 ? '#4ade80' : (profitShare < 30 ? '#ef4444' : '#fbbf24'),
                            fontWeight: 'bold'
                        }}>
                            💰 User nhận được {profitShare.toFixed(1)}% so với doanh thu tổng.
                            {profitShare < 30 && <span style={{ marginLeft: '0.5rem' }}>⚠️ Thấp!</span>}
                            {profitShare > 50 && <span style={{ marginLeft: '0.5rem' }}>✅ Cao!</span>}
                        </div>
                    )}
                </div>

                <div className="mt-4">
                    <label className="text-xs text-gray-400">Link Tài nguyên (Folder Drive/Dropbox)</label>
                    <input value={resources} onChange={e => setResources(e.target.value)} placeholder="https://..."
                        className="w-full p-2 bg-[#222] border border-[#333] rounded text-white text-sm" />
                </div>

                <div className="mt-4">
                    <label className="text-xs text-gray-400">References (Link mẫu)</label>
                    <input value={references} onChange={e => setReferences(e.target.value)} placeholder="https://..."
                        className="w-full p-2 bg-[#222] border border-[#333] rounded text-white text-sm" />
                </div>

                <div className="mt-4">
                    <label className="text-xs text-gray-400">Giao cho nhân viên</label>
                    <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
                        className="w-full p-2 bg-[#222] border border-[#333] rounded text-white text-sm">
                        <option value="">-- Để trống (Kho Task) --</option>
                        {users.map((u) => (
                            <option key={u.id} value={u.id} disabled={u.role === 'LOCKED'}>
                                {u.username} ({u.reputation ?? 100}đ)
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* 2. Task List Section */}
            <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20">
                <h4 className="text-sm uppercase tracking-widest text-blue-400 mb-2 font-bold">2. Danh sách Task ({parsedTitles.length})</h4>
                <p className="text-xs text-gray-500 mb-2">Paste danh sách tên video vào đây (Mỗi dòng 1 video)</p>

                <textarea
                    value={rawTitles}
                    onChange={e => setRawTitles(e.target.value)}
                    placeholder={`Video Intro\nVideo Review 1\nVideo Review 2`}
                    rows={8}
                    className="w-full p-3 bg-[#111] border border-blue-500/30 rounded-lg text-white font-mono text-sm leading-relaxed focus:outline-none focus:border-blue-500"
                />

                {parsedTitles.length > 0 && (
                    <div className="mt-2 text-xs text-gray-400 flex justify-between items-center">
                        <span>Đang chuẩn bị tạo <strong className="text-white">{parsedTitles.length}</strong> task</span>
                    </div>
                )}
            </div>

            <button
                onClick={handleSubmit}
                disabled={isSubmitting || parsedTitles.length === 0}
                className="btn btn-primary w-full py-3 font-bold text-lg shadow-lg hover:shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] transition-all"
            >
                {isSubmitting ? 'Đang xử lý...' : `🚀 Tạo ${parsedTitles.length > 0 ? parsedTitles.length : ''} Task Ngay`}
            </button>
        </div>
    )
}
