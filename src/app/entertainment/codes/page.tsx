// [Giải trí] Quản lý mã truy cập — CHỈ quản trị hệ thống (User.role === 'ADMIN').
// Người cầm mã ENT_ADMIN up phim được nhưng không tự phát mã cho người khác.

import { redirect } from 'next/navigation'
import { verifyActiveSession } from '@/lib/security'
import EntCodesPanel from '@/components/ent/EntCodesPanel'

export const dynamic = 'force-dynamic'

export default async function EntCodesPage() {
    const { status, dbUser } = await verifyActiveSession()
    if (status !== 'active' || !dbUser) redirect('/login')
    if (dbUser.role !== 'ADMIN') redirect('/entertainment')

    return <EntCodesPanel />
}
