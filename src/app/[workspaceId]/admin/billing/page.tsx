// [BILLING P5] Trang Gói cước — /{ws}/admin/billing
//
// Server component theo đúng khuôn admin/settings/page.tsx: gate verifyProfileAdminAccess
// (fail-closed qua try/catch → redirect), fetch tại trang, serialize hết Date/bigint/Set
// trước khi qua ranh giới client. Bảng giá KHÔNG fetch — plans.ts thuần dữ liệu, client
// panel import thẳng.
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { verifyProfileAdminAccess } from '@/lib/security'
import { resolveWorkspaceProfileId } from '@/lib/prisma-workspace'
import { getEntitlements, enforcementStart } from '@/lib/billing/entitlements'
import { getProfileUsage, formatBytes } from '@/lib/billing/usage'
import BillingPanel from '@/components/billing/BillingPanel'

export const dynamic = 'force-dynamic'

export default async function BillingPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')

    try {
        await verifyProfileAdminAccess(workspaceId)
    } catch {
        redirect(`/${workspaceId}/dashboard`)
    }

    const profileId = await resolveWorkspaceProfileId(workspaceId)
    if (!profileId) redirect(`/${workspaceId}/admin`)

    const [ent, usage] = await Promise.all([getEntitlements(profileId), getProfileUsage(profileId)])
    const start = enforcementStart()

    return (
        <div style={{ maxWidth: '980px', margin: '0 auto' }} className="px-4 pb-16">
            <BillingPanel
                workspaceId={workspaceId}
                entitlements={{
                    planCode: ent.planCode,
                    status: ent.status,
                    readOnly: ent.readOnly,
                    enforced: ent.enforced,
                    daysLeft: ent.daysLeft,
                    effectiveEnd: ent.effectiveEnd?.toISOString() ?? null,
                    graceEndsAt: ent.graceEndsAt?.toISOString() ?? null,
                    hasSubscription: ent.hasSubscription,
                    seatLimit: ent.seatLimit,
                    storageLimitBytes: ent.storageLimitBytes === null ? null : ent.storageLimitBytes.toString(),
                }}
                usage={{
                    seats: usage.seats,
                    workspaces: usage.workspaces,
                    liveBytes: usage.storage.liveBytes.toString(),
                    liveBytesLabel: formatBytes(usage.storage.liveBytes),
                }}
                enforcementStartISO={start ? start.toISOString() : null}
            />
        </div>
    )
}
