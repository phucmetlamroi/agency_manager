'use client'

import { useState, useEffect } from 'react'
import { createTask } from '@/actions/admin-actions'



type User = {
    id: string
    username: string
    reputation: number
    role: string
}

import ClientSelector from '@/components/crm/ClientSelector'

export default function CreateTaskForm({ users }: { users: User[] }) {
    const [rate, setRate] = useState<number>(25300)
    const [usd, setUsd] = useState<number>(0)
    const [usdDisplay, setUsdDisplay] = useState<string>('')

    const [wage, setWage] = useState<number>(0)
    const [wageDisplay, setWageDisplay] = useState<string>('')

    const [profitShare, setProfitShare] = useState<number>(0)
    const [revenueVnd, setRevenueVnd] = useState<number>(0)

    const [clientId, setClientId] = useState<number | null>(null)

    useEffect(() => {
        // Fetch Exchange Rate
        async function fetchRate() {
            try {
                const res = await fetch('https://open.er-api.com/v6/latest/USD')
                const data = await res.json()
                if (data && data.rates && data.rates.VND) {
                    setRate(data.rates.VND)
                }
            } catch (e) {
                console.error("Failed to fetch rate, using default 25300")
            }
        }
        fetchRate()
    }, [])

    useEffect(() => {
        const rev = usd * rate
        setRevenueVnd(rev)
        if (rev > 0) {
            setProfitShare((wage / rev) * 100)
        } else {
            setProfitShare(0)
        }
    }, [usd, wage, rate])

    // Helper to format: 400000 -> 400.000
    const formatCurrency = (val: string) => {
        // Remove non-digit characters (except comma/dot if we want decimal support, but request emphasizes dots for grouping)
        // Let's assume Integer for VND and float for USD? 
        // User said: "nhập 400000 -> 400.000". This is dot separator.
        // For USD, let's allow decimals with comma separator? Or just standard?
        // Let's implement robust parser:
        // 1. Keep digits.
        if (!val) return ''
        const raw = val.replace(/\D/g, '')
        return Number(raw).toLocaleString('vi-VN')
    }

    // For USD which might need cents: 
    // If strict regex replace \D, we lose decimals.
    // Let's support inputting decimals for USD if needed? 
    // The user example is 400000 (VND-like). 
    // I will simplify -> Integer formatting for simplicity unless requested otherwise. 
    // Most "Job Price" are integers (e.g. $50, $100). If decimals needed, user usually types dot.
    // If I force 'vi-VN' locale, dot is thousands. So decimal must be comma.

    const handleUsdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        // Only allow digits and one comma/dot? 
        // Let's try simple integer first as per request demo "400.000"
        // If they need decimals, we need more complex logic. 
        // Assuming integer for now based on "400.000" pattern request.

        const raw = val.replace(/\./g, '').replace(/,/g, '.') // Convert VN format back to JS number check?
        // Actually, simple way: Just strip non-digits for integer fields.

        // Let's try to support decimal for USD properly.
        // If user types "10.5", and we force dot as thousands, then "10.5" looks like "10" (thousands??) NO.
        // Let's treat valid input as: 123456 (becomes 123.456).
        // If they type decimal, standard VN is comma. "123,45".

        // Simpler approach: 
        // Filter input: keep 0-9. 
        // Store as string. Format on blur? Real-time is tricky with cursor.
        // Real-time requested: "khi tôi nhập thế sẽ tự động thành".

        // Implementation: Integer-only grouping (Common for VND).
        const rawDigits = val.replace(/\D/g, '')
        const num = parseFloat(rawDigits)

        if (isNaN(num)) {
            setUsd(0)
            setUsdDisplay('')
            return
        }

        // For USD, maybe divide by 100 if typing cents? No, that's annoying.
        // Let's just do integer formatting for readability as requested.
        const formatted = Number(rawDigits).toLocaleString('vi-VN')
        setUsdDisplay(formatted)
        setUsd(Number(rawDigits))
    }

    const handleWageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        const rawDigits = val.replace(/\D/g, '')
        const num = parseFloat(rawDigits)

        if (isNaN(num)) {
            setWage(0)
            setWageDisplay('')
            return
        }

        const formatted = Number(rawDigits).toLocaleString('vi-VN')
        setWageDisplay(formatted)
        setWage(Number(rawDigits))
    }

    const clientAction = async (formData: FormData) => {
        // Appending computed exchange rate if not present (though we have hidden input)
        // Actually hidden input is enough.
        await createTask(formData)
    }

    return (
        <form action={clientAction} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Hidden Input for Rate & ClientId */}
            <input type="hidden" name="exchangeRate" value={rate} />
            <input type="hidden" name="clientId" value={clientId || ''} />

            {/* NEW: Client Selector */}
            <ClientSelector onSelect={setClientId} />

            <div>
                <label style={{ fontSize: '0.8rem', color: '#888' }}>Tên công việc</label>
                <input name="title" required placeholder="Nhập tên task..."
                    style={{ width: '100%', padding: '0.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }} />
            </div>

            {/* Financials Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                    <label style={{ fontSize: '0.8rem', color: '#888' }}>Tiền Job (USD)</label>
                    <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#4ade80' }}>$</span>
                        {/* Visible Formatted Input */}
                        <input
                            type="text"
                            value={usdDisplay}
                            onChange={handleUsdChange}
                            required
                            placeholder="0"
                            style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 1.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }}
                        />
                        {/* Hidden Inputs for Real Value */}
                        <input type="hidden" name="jobPriceUSD" value={usd} />
                    </div>
                </div>
                <div>
                    <label style={{ fontSize: '0.8rem', color: '#888' }}>Thù lao Staff (VND)</label>
                    <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#fbbf24' }}>₫</span>
                        {/* Visible Formatted Input */}
                        <input
                            type="text"
                            value={wageDisplay}
                            onChange={handleWageChange}
                            required
                            placeholder="0"
                            style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 1.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }}
                        />
                        {/* Hidden Inputs for Real Value */}
                        <input type="hidden" name="value" value={wage} style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 1.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }} />
                    </div>
                </div>
            </div>

            {/* Live Calculation Info */}
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.8rem', borderRadius: '6px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', color: '#aaa' }}>
                    <span>ℹ️ Tỷ giá: 1 USD = {rate.toLocaleString()} VND</span>
                    <span>Doanh thu: {revenueVnd.toLocaleString()} ₫</span>
                </div>
                {usd > 0 && (
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

            {/* New Fields Gen Z Style */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                    <label style={{ fontSize: '0.8rem', color: '#888' }}>Loại Task</label>
                    <select name="type" required
                        style={{ width: '100%', padding: '0.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }}>
                        <option value="Short form">Short form</option>
                        <option value="Long form">Long form</option>
                        <option value="Trial">Trial</option>
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: '0.8rem', color: '#888' }}>Deadline (Giờ + Ngày)</label>
                    <input name="deadline" type="datetime-local"
                        style={{ width: '100%', padding: '0.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }} />
                </div>
            </div>

            <div>
                <label style={{ fontSize: '0.8rem', color: '#888' }}>Resources (Raw/B-roll Link)</label>
                <input name="resources" placeholder="Link folder..."
                    style={{ width: '100%', padding: '0.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }} />
            </div>

            <div>
                <label style={{ fontSize: '0.8rem', color: '#888' }}>Collect Files Link (Nơi nộp file)</label>
                <input name="collectFilesLink" placeholder="Link Drive/Folder nộp file..."
                    style={{ width: '100%', padding: '0.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }} />
            </div>

            <div>
                <label style={{ fontSize: '0.8rem', color: '#888' }}>References (Sample Video)</label>
                <input name="references" placeholder="Link video mẫu..."
                    style={{ width: '100%', padding: '0.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }} />
            </div>

            <div>
                <label style={{ fontSize: '0.8rem', color: '#888' }}>Ghi chú (Notes)</label>
                <textarea name="notes" placeholder="Yêu cầu cụ thể..." rows={3}
                    style={{ width: '100%', padding: '0.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }} />
            </div>

            <div>
                <label style={{ fontSize: '0.8rem', color: '#888' }}>Giao cho nhân viên</label>
                <select name="assigneeId"
                    onChange={(e) => {
                        // Check availability if date is selected
                        // But we don't need real-time check here necessarily, or we can add a "Check" badge.
                        // Let's just create a quick client-side check if we had the data.
                        // Since we don't want to over-fetch, let's keep it simple:
                        // Just show a warning if their reputation is low or if they are "BUSY" (fetched via separate component/async?)
                        // For now, let's leave as is, and implement the conflict warning in the *Table* dropdown which is more interactive.
                    }}
                    style={{ width: '100%', padding: '0.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }}>
                    <option value="">-- Để trống (Vào Kho Task Đợi) --</option>
                    {users.filter((u: any) => !u.ownedAgency || u.ownedAgency.length === 0).map((u: any) => {
                        const score = u.reputation ?? 100
                        let badge = ''
                        if (score >= 90) badge = '🟣 Chuyên gia tin cậy'
                        else if (score < 50) badge = '⚠️ Cần giám sát'
                        else badge = '⚪ Thành viên tích cực'

                        if (u.role === 'LOCKED') badge = '❌ ĐÃ KHÓA'

                        return (
                            <option key={u.id} value={u.id} disabled={u.role === 'LOCKED'}>
                                {u.username} ({score}đ) - {badge}
                            </option>
                        )
                    })}
                </select>
                {/* Conflict Warning Hook Removed */}
            </div>

            <button className="btn btn-primary" type="submit">Tạo Task</button>
        </form>
    )
}
