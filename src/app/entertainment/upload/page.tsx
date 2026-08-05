// [Giải trí] Trang UP PHIM — giao diện người up.
//
// Gác kép: chưa có mã ⇒ màn nhập mã; có mã nhưng chỉ là mã xem ⇒ đá về kho phim.
// Người xem gõ thẳng URL này cũng không vào được.

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { resolveEntSession } from '@/lib/ent/auth'
import { isEntCodeManager } from '@/lib/ent/is-global-admin'
import EntCodeGate from '@/components/ent/EntCodeGate'
import EntUploadManager from '@/components/ent/EntUploadManager'

export const dynamic = 'force-dynamic'

export default async function EntUploadPage() {
    // Lối vào trang quản lý mã chỉ hiện với quản trị hệ thống — người cầm mã
    // ENT_ADMIN up phim được nhưng không tự phát mã cho người khác.
    const isGlobalAdmin = await isEntCodeManager()

    const session = await resolveEntSession(await cookies())
    if (!session) return <EntCodeGate canManageCodes={isGlobalAdmin} />
    if (session.role !== 'ENT_ADMIN') redirect('/entertainment')

    return <EntUploadManager role={session.role} isGlobalAdmin={isGlobalAdmin} />
}
