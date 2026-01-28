'use client'

import { calculateMonthlyBonus } from '@/actions/bonus-actions'
import { useState } from 'react'

export default function BonusCalculator() {
    const [isLoading, setIsLoading] = useState(false)

    const handleCalculate = async () => {
        if (!confirm('Bạn có chắc chắn muốn TÍNH THƯỞNG THÁNG NÀY?\n\nHệ thống sẽ chốt số liệu doanh thu tại thời điểm hiện tại và xếp hạng nhân viên.')) {
            return
        }

        setIsLoading(true)
        try {
            const res = await calculateMonthlyBonus()
            if (res.success) {
                alert(`Đã tính xong thưởng tháng ${res.month}/${res.year}!\n\nTop 1, 2, 3 đã được cập nhật thưởng.`)
                // Page will likely be revalidated by the server action
            } else {
                alert('Lỗi: ' + res.error)
            }
        } catch (error) {
            console.error(error)
            alert('Có lỗi xảy ra khi tính thưởng.')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <button
            onClick={handleCalculate}
            disabled={isLoading}
            className="btn glass-panel"
            style={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: 'white',
                fontWeight: 'bold',
                border: 'none',
                padding: '0.8rem 1.5rem',
                fontSize: '1rem',
                boxShadow: '0 4px 15px rgba(245, 158, 11, 0.3)',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.7 : 1,
                display: 'flex', alignItems: 'center', gap: '0.5rem'
            }}
        >
            {isLoading ? 'Đang tính toán...' : '🏆 Tính Thưởng Tháng Này'}
        </button>
    )
}
