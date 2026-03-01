import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import BonusCalculator from './BonusCalculator'
import PayrollCard from '@/components/admin/PayrollCard'
import { serializeDecimal } from '@/lib/serialization'

export default async function PayrollPage() {
    // 1. Determine Current Month Range
    // TEMPORARY OVERRIDE: Hardcode to February 2026 to process payroll, 
    // and extend end date to March 5th to include early March completions into Feb payroll.
    const currentMonth = 2
    const currentYear = 2026
    const startOfMonth = new Date(2026, 1, 1) // Feb 1, 2026
    const endOfMonth = new Date(2026, 2, 5, 23, 59, 59, 999) // March 5, 2026

    // 2. Fetch Users and their COMPLETED tasks for this month
    const users = await prisma.user.findMany({
        where: {
            username: { not: 'admin' }
        },
        include: {
            tasks: {
                where: {
                    status: 'Hoàn tất', // Only completed tasks
                    updatedAt: {
                        gte: startOfMonth,
                        lte: endOfMonth
                    }
                },
                orderBy: { updatedAt: 'desc' },
                include: { assignee: true }
            },
            // Include bonuses for this month
            bonuses: {
                where: {
                    month: currentMonth,
                    year: currentYear
                }
            },
            // Payment Checks
            payrolls: {
                where: {
                    month: currentMonth,
                    year: currentYear
                }
            }
        },
        orderBy: { username: 'asc' }
    })

    // Filter out users with 0 income AND no bonus (active users only)
    const activeUsers = users.filter(user => user.tasks.length > 0 || user.bonuses.length > 0)

    // SERIALIZE DECIMAL FIELDS
    const serializedUsers = serializeDecimal(activeUsers)

    // Check permission for "Calculate Bonus" button
    const session = await getSession()
    if (!session) redirect('/login')

    const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true, isTreasurer: true }
    })

    const canCalculateBonus = currentUser?.role === 'ADMIN' || currentUser?.isTreasurer

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h2 className="title-gradient" style={{ fontSize: '2rem', margin: 0 }}>💰 Bảng Lương & Thu Nhập</h2>
                    <p style={{ color: '#888', marginTop: '0.5rem' }}>
                        Tháng {currentMonth}/{currentYear} • Tính trên các task đã "Hoàn tất".
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ background: '#333', padding: '0.5rem 1rem', borderRadius: '12px', color: '#ccc', fontSize: '0.9rem' }}>
                        📅 Kỳ lương hiện tại
                    </div>
                </div>
            </div>

            {canCalculateBonus && (
                <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <BonusCalculator />
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {serializedUsers.map((user: any) => (
                    <PayrollCard
                        key={user.id}
                        user={user}
                        currentMonth={currentMonth}
                        currentYear={currentYear}
                    />
                ))}

                {serializedUsers.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
                        Không có số liệu lương trong tháng này.
                    </div>
                )}
            </div>
        </div>
    )
}
