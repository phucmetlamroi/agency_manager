'use client'

import { useState, useEffect } from 'react'
import { createTask } from '@/actions/admin-actions'

type User = {
    id: string
    username: string
    reputation: number
    role: string
}

export default function CreateTaskForm({ users }: { users: User[] }) {
    const [rate, setRate] = useState<number>(25300)
    const [usd, setUsd] = useState<number>(0)
    const [wage, setWage] = useState<number>(0)
    const [profitShare, setProfitShare] = useState<number>(0)
    const [revenueVnd, setRevenueVnd] = useState<number>(0)

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

    const clientAction = async (formData: FormData) => {
        // Appending computed exchange rate if not present (though we have hidden input)
        // Actually hidden input is enough.
        await createTask(formData)
    }

    return (
        <form action={clientAction} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Hidden Input for Rate */}
            <input type="hidden" name="exchangeRate" value={rate} />

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
                        <input name="jobPriceUSD" type="number" step="0.01" required placeholder="0.00"
                            onChange={(e) => setUsd(parseFloat(e.target.value) || 0)}
                            style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 1.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }} />
                    </div>
                </div>
                <div>
                    <label style={{ fontSize: '0.8rem', color: '#888' }}>Thù lao Staff (VND)</label>
                    <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#fbbf24' }}>₫</span>
                        <input name="value" type="number" required placeholder="0"
                            onChange={(e) => setWage(parseFloat(e.target.value) || 0)}
                            style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 1.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }} />
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
                    style={{ width: '100%', padding: '0.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }}>
                    <option value="">-- Để trống (Vào Kho Task Đợi) --</option>
                    {users.map((u: any) => {
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
            </div>

            <button className="btn btn-primary" type="submit">Tạo Task</button>
        </form>
    )
}
