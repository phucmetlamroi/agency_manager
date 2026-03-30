'use client'

import { useState, useEffect, useRef } from 'react'
import { createTask } from '@/actions/admin-actions'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'

type User = {
    id: string
    username: string
    role: string
}

import ClientSelector from '@/components/crm/ClientSelector'

export default function CreateTaskForm({ users, workspaceId }: { users: User[], workspaceId: string }) {
    const [rate, setRate] = useState<number>(25300)
    const [usd, setUsd] = useState<number>(0)
    const [usdDisplay, setUsdDisplay] = useState<string>('')

    const [wage, setWage] = useState<number>(0)
    const [wageDisplay, setWageDisplay] = useState<string>('')

    const [profitShare, setProfitShare] = useState<number>(0)
    const [revenueVnd, setRevenueVnd] = useState<number>(0)

    const [clientId, setClientId] = useState<number | null>(null)
    const notesViRef = useRef<HTMLTextAreaElement>(null)

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

    const handleUsdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        const rawDigits = val.replace(/\D/g, '')
        const num = parseFloat(rawDigits)

        if (isNaN(num)) {
            setUsd(0)
            setUsdDisplay('')
            return
        }

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
        await createTask(formData, workspaceId)
    }

    return (
        <form action={clientAction} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input type="hidden" name="exchangeRate" value={rate} />
            <input type="hidden" name="clientId" value={clientId || ''} />

            <ClientSelector onSelect={setClientId} workspaceId={workspaceId} />

            <div>
                <label style={{ fontSize: '0.8rem', color: '#888' }}>Tên công việc</label>
                <input name="title" required placeholder="Nhập tên task..."
                    style={{ width: '100%', padding: '0.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                    <label style={{ fontSize: '0.8rem', color: '#888' }}>Tiền Job (USD)</label>
                    <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#4ade80' }}>$</span>
                        <input
                            type="text"
                            value={usdDisplay}
                            onChange={handleUsdChange}
                            required
                            placeholder="0"
                            style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 1.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }}
                        />
                        <input type="hidden" name="jobPriceUSD" value={usd} />
                    </div>
                </div>
                <div>
                    <label style={{ fontSize: '0.8rem', color: '#888' }}>Thù lao Staff (VND)</label>
                    <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#fbbf24' }}>₫</span>
                        <input
                            type="text"
                            value={wageDisplay}
                            onChange={handleWageChange}
                            required
                            placeholder="0"
                            style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 1.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }}
                        />
                        <input type="hidden" name="value" value={wage} style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 1.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }} />
                    </div>
                </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.8rem', borderRadius: '6px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.3rem', color: '#aaa' }}>
                    <span>ℹ️ Tỷ giá: 1 USD = {rate.toLocaleString()} VND</span>
                    <span>💵 Doanh thu: {revenueVnd.toLocaleString()} ₫</span>
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ fontSize: '0.8rem', color: '#888' }}>Ghi chú (Tiếng Việt)</label>
                    <button
                        type="button"
                        onClick={() => {
                            if (notesViRef.current) {
                                navigator.clipboard.writeText(notesViRef.current.value);
                                toast.success('Đã copy nội dung tiếng Việt');
                            }
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: '#888', fontSize: '0.7rem' }}
                    >
                        <Copy size={12} /> Copy
                    </button>
                </div>
                <textarea
                    ref={notesViRef}
                    name="notes"
                    placeholder="Yêu cầu cụ thể bằng Tiếng Việt..."
                    rows={3}
                    style={{ width: '100%', padding: '0.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }}
                />
            </div>

            <div>
                <label style={{ fontSize: '0.8rem', color: '#888' }}>Nhập bản dịch (English Notes)</label>
                <textarea
                    name="notes_en"
                    placeholder="Dán nội dung tiếng Anh vào đây..."
                    rows={3}
                    style={{ width: '100%', padding: '0.5rem', background: '#1a1a1a', border: '1px solid #22c55e44', color: 'white', borderRadius: '6px' }}
                />
                <p style={{ fontSize: '0.65rem', color: '#555', marginTop: '4px' }}>ℹ️ Tự dán kết quả dịch vào ô này để tối ưu chi phí.</p>
            </div>

            <div>
                <label style={{ fontSize: '0.8rem', color: '#888' }}>Giao cho nhân viên</label>
                <select name="assigneeId"
                    style={{ width: '100%', padding: '0.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }}>
                    <option value="">-- Để trống (Vào Kho Task Đợi) --</option>
                    {users.filter((u: any) => u.role !== 'LOCKED').map((u: any) => {
                        return (
                            <option key={u.id} value={u.id} disabled={u.role === 'LOCKED'}>
                                {u.username}
                            </option>
                        )
                    })}
                </select>
            </div>

            <button className="btn btn-primary" type="submit">Tạo Task</button>
        </form>
    )
}
