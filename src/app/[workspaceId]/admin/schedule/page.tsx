import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth-guard'
import { getAdminAvailabilityMatrix } from '@/actions/availability-actions'
import AdminAvailabilityClient from '@/components/schedule/AdminAvailabilityClient'
import { getVietnamDateKey } from '@/lib/date-utils'

export const dynamic = 'force-dynamic'

export default async function AdminSchedulePage({
    params,
    searchParams
}: {
    params: Promise<{ workspaceId: string }>
    searchParams?: Promise<{ date?: string }>
}) {
    const { workspaceId } = await params
    const query = await searchParams
    const user = await getCurrentUser()

    if (user.role !== 'ADMIN') {
        redirect(`/${workspaceId}/dashboard`)
    }

    const dateKey = query?.date || getVietnamDateKey()
    const data = await getAdminAvailabilityMatrix(dateKey, workspaceId)
    const users = 'users' in data ? data.users : []

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-white">Lịch nhân sự</h1>
                <p className="text-sm text-zinc-500">Ma trận 24 giờ cho toàn bộ nhân sự trong workspace.</p>
            </div>

            <AdminAvailabilityClient
                workspaceId={workspaceId}
                dateKey={dateKey}
                users={users}
            />
        </div>
    )
}
