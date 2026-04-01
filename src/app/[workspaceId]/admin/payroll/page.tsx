import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import BonusCalculator from './BonusCalculator'
import PayrollCard from '@/components/admin/PayrollCard'
import { serializeDecimal } from '@/lib/serialization'
import { SALARY_COMPLETED_STATUS, SALARY_PENDING_STATUSES } from '@/lib/task-statuses'

export const dynamic = 'force-dynamic'

function extractMonthParam(workspaceName?: string | null): string | null {
    if (!workspaceName) return null
    const match = workspaceName.match(/(\d{1,2})\s*\/\s*(\d{4})/)
    if (!match) return null
    const month = match[1].padStart(2, '0')
    const year = match[2]
    return `${year}-${month}`
}

export default async function PayrollPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params

    const workspacePrisma = getWorkspacePrisma(workspaceId)

    const workspace = await workspacePrisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true }
    })

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
                    workspaceId
                }
            },
            payrolls: {
                where: {
                    workspaceId
                }
            }
        },
        orderBy: { username: 'asc' }
    })

    const activeUsers = users.filter(user => {
        const hasCompleted = user.tasks.some(task => task.status === SALARY_COMPLETED_STATUS)
        const hasPending = user.tasks.some(task => SALARY_PENDING_STATUSES.includes(task.status))
        const hasBonus = user.bonuses.length > 0
        const hasPayroll = user.payrolls.length > 0
        return hasCompleted || hasPending || hasBonus || hasPayroll
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
    const canExportMonthlyXlsx = currentUser?.role === 'ADMIN'
    const monthParam = extractMonthParam(workspace?.name)
    const exportUrl = monthParam
        ? `/api/exports/monthly-tasks-xlsx?workspaceId=${workspaceId}&month=${monthParam}`
        : `/api/exports/monthly-tasks-xlsx?workspaceId=${workspaceId}`

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h2 className="title-gradient" style={{ fontSize: '2rem', margin: 0 }}>Bang Luong va Thu Nhap</h2>
                    <p style={{ color: '#888', marginTop: '0.5rem' }}>
                        Workspace: <span style={{ color: '#fff' }}>{workspace?.name}</span> - Tinh tren cac task da "{SALARY_COMPLETED_STATUS}".
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    {canExportMonthlyXlsx && (
                        <a
                            href={exportUrl}
                            style={{
                                background: '#0f172a',
                                border: '1px solid #334155',
                                color: '#e2e8f0',
                                padding: '0.55rem 1rem',
                                borderRadius: '12px',
                                fontSize: '0.9rem',
                                fontWeight: 700,
                                textDecoration: 'none'
                            }}
                        >
                            Export XLSX (Deadline Month)
                        </a>
                    )}
                    <div style={{ background: '#333', padding: '0.5rem 1rem', borderRadius: '12px', color: '#ccc', fontSize: '0.9rem' }}>
                        Workspace Mode: Isolated
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
                        currentMonth={0} // Irrelevant in workspace mode
                        currentYear={0}
                        workspaceId={workspaceId}
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
