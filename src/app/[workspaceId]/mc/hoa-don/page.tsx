// [Giao diện 2 · Mission Control · M13 Tạo hóa đơn] Full-bleed invoice creator (không rail — màn tác vụ
// tập trung như M10 Add Task). Reuse InvoiceModal (embedded) qua McInvoiceBoard; InvoiceModal tự hydrate
// task chưa xuất + billing profiles + giá. Route chỉ bơm danh sách khách (id/name/depositBalance — KHÔNG
// jobPriceUSD) để chọn, + đọc ?clientId (vào thẳng từ nút "Tạo hóa đơn ▸ Màn 13" của CRM). Admin-gated
// fail-closed; toàn bộ luồng hóa đơn (getUnbilledTasks/createInvoiceRecord/PDF) cổng verifyFinanceAccess.
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { verifyProfileAdminAccess } from '@/lib/security'
import { getClients } from '@/actions/crm-actions'
import McInvoiceBoard, { type McInvoiceClient } from '@/components/mission-control/McInvoiceBoard'

export const dynamic = 'force-dynamic'

export default async function MissionControlInvoicePage({
    params,
    searchParams,
}: {
    params: Promise<{ workspaceId: string }>
    searchParams: Promise<{ clientId?: string }>
}) {
    const { workspaceId } = await params
    const sp = await searchParams
    const session = await getSession()
    if (!session) redirect('/login')
    try { await verifyProfileAdminAccess(workspaceId) } catch { redirect(`/${workspaceId}/dashboard`) }

    const clientsRes = await getClients(workspaceId)
    const raw = (clientsRes.data || []) as any[]

    // Phẳng hoá parent + brand con → mọi khách đều xuất hoá đơn được (getUnbilledTasks gộp cả sub).
    // Chỉ mang scalar an toàn (id/name/depositBalance) — KHÔNG mang mảng task/jobPriceUSD xuống client.
    const flat: McInvoiceClient[] = []
    for (const c of raw) {
        flat.push({ id: Number(c.id), name: String(c.name), depositBalance: Number(c.depositBalance || 0) })
        for (const s of c.subsidiaries || []) {
            flat.push({ id: Number(s.id), name: String(s.name), depositBalance: Number(s.depositBalance || 0), parentName: String(c.name) })
        }
    }
    flat.sort((a, b) => a.name.localeCompare(b.name, 'vi'))

    const parsed = sp.clientId ? Number(sp.clientId) : NaN
    const initialClientId = Number.isFinite(parsed) && flat.some((c) => c.id === parsed) ? parsed : null

    return <McInvoiceBoard clients={flat} workspaceId={workspaceId} initialClientId={initialClientId} />
}
