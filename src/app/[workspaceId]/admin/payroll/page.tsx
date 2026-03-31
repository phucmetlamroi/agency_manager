import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import BonusCalculator from './BonusCalculator'
import PayrollCard from '@/components/admin/PayrollCard'
import { serializeDecimal } from '@/lib/serialization'
import { SALARY_COMPLETED_STATUS, SALARY_PENDING_STATUSES } from '@/lib/task-statuses'

export const dynamic = 'force-dynamic'

export default async function PayrollPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params

    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()
    const startOfMonth = new Date(currentYear, currentMonth - 1, 1)
    const endOfMonth = new Date(currentYear, currentMonth, 5, 23, 59, 59, 999)

    const workspacePrisma = getWorkspacePrisma(workspaceId)

    const users = await workspacePrisma.user.findMany({
        where: {
            username: { not: 'admin' }
        },
        include: {
            tasks: {
                where: {
                    workspaceId,
                    status: { in: [SALARY_COMPLETED_STATUS, ...SALARY_PENDING_STATUSES] }
                },
                orderBy: { updatedAt: 'desc' },
                include: {
                    assignee: {
                        select: {
                            id: true,
                            username: true,
                            role: true,
                            nickname: true
                        }
                    }
                }
            },
            bonuses: {
                where: {
                    workspaceId,
                    month: currentMonth,
                    year: currentYear
                }
            },
            payrolls: {
                where: {
                    workspaceId,
                    month: currentMonth,
                    year: currentYear
                }
            }
        },
        orderBy: { username: 'asc' }
    })

    const activeUsers = users.filter(user => {
        const hasCompleted = user.tasks.some(
            task => task.status === SALARY_COMPLETED_STATUS && task.updatedAt >= startOfMonth && task.updatedAt <= endOfMonth
        )
        const hasPending = user.tasks.some(task => SALARY_PENDING_STATUSES.includes(task.status))
        const hasBonus = user.bonuses.length > 0
        return hasCompleted || hasPending || hasBonus
    })

    activeUsers.sort((a, b) => {
        const rankA = a.bonuses[0]?.rank || 999
        const rankB = b.bonuses[0]?.rank || 999
        if (rankA !== rankB) return rankA - rankB
        return a.username.localeCompare(b.username, 'vi')
    })

    const serializedUsers = serializeDecimal(activeUsers)

    const session = await getSession()
    if (!session) redirect('/login')

    const currentUser = await workspacePrisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true, isTreasurer: true }
    })
    const canCalculateBonus = currentUser?.role === 'ADMIN' || currentUser?.isTreasurer

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h2 className="title-gradient" style={{ fontSize: '2rem', margin: 0 }}>Bang Luong va Thu Nhap</h2>
                    <p style={{ color: '#888', marginTop: '0.5rem' }}>
                        Thang {currentMonth}/{currentYear} - Tinh tren cac task da "{SALARY_COMPLETED_STATUS}".
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ background: '#333', padding: '0.5rem 1rem', borderRadius: '12px', color: '#ccc', fontSize: '0.9rem' }}>
                        Ky luong hien tai
                    </div>
                </div>
            </div>

            {canCalculateBonus && (
                <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <BonusCalculator workspaceId={workspaceId} />
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {serializedUsers.map((user: any) => (
                    <PayrollCard
                        key={user.id}
                        user={user}
                        currentMonth={currentMonth}
                        currentYear={currentYear}
                        workspaceId={workspaceId}
                        startOfMonth={startOfMonth}
                        endOfMonth={endOfMonth}
                    />
                ))}

                {serializedUsers.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
                        Khong co du lieu luong trong thang nay.
                    </div>
                )}
            </div>
        </div>
    )
}
