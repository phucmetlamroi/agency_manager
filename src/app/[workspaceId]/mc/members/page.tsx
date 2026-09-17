// [Giao diện 2 · Mission Control · M9 Thành viên] Data-wired member cards.
// Roster = getProfileMembers (org roles OWNER/ADMIN/USER); metrics hydrated from the
// workspace-scoped User (tasks/bonuses/presence + isTreasurer) exactly like
// /mc/tien. Salary is aggregated to a single VND number server-side — no jobPriceUSD / raw
// task value arrays reach the client. Admin-gated fail-closed (wages are admin-only).
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { verifyProfileAdminAccess } from '@/lib/security'
import { resolveActiveProfileId, getWorkspacePrisma } from '@/lib/prisma-workspace'
import { prisma } from '@/lib/db'
import { SALARY_COMPLETED_STATUS } from '@/lib/task-statuses'
import { getProfileMembers } from '@/actions/profile-member-actions'
import { getProfileRole } from '@/lib/profile-permissions'
import { getDisplayName } from '@/lib/display-name'
import { roleLabel } from '@/lib/display-labels'
import McMembersBoard, { type McMembersData, type McMember } from '@/components/mission-control/McMembersBoard'

export const dynamic = 'force-dynamic'

// [BO HANG S/A/B/C/D 2026-07-31] Bo bang mau hang RANK_HEX va moi chi so loi.
const GRADIENTS = [
    'linear-gradient(135deg,#6366F1,#8B5CF6)', 'linear-gradient(135deg,#10B981,#06B6D4)', 'linear-gradient(135deg,#EC4899,#F43F5E)',
    'linear-gradient(135deg,#A855F7,#EC4899)', 'linear-gradient(135deg,#F59E0B,#EAB308)', 'linear-gradient(135deg,#06B6D4,#3B82F6)',
]
function grad(seed: string): string { let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0; return GRADIENTS[h % GRADIENTS.length] }
function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return (name.trim().slice(0, 2) || '?').toUpperCase()
}
// Presence → { online, VI relative label }. ONLINE only if status ONLINE and heartbeat < 5'.
function presenceInfo(p?: { status: string; lastHeartbeat: Date } | null): { online: boolean; label: string } {
    if (!p) return { online: false, label: 'chưa hoạt động' }
    const ms = Date.now() - p.lastHeartbeat.getTime()
    if (p.status === 'ONLINE' && ms < 5 * 60 * 1000) return { online: true, label: 'ONLINE' }
    const mins = Math.floor(ms / 60000)
    if (mins < 1) return { online: false, label: 'vừa xong' }
    if (mins < 60) return { online: false, label: `${mins} phút trước` }
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return { online: false, label: `${hrs}h trước` }
    return { online: false, label: `${Math.floor(hrs / 24)} ngày trước` }
}

export default async function MissionControlMembersPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')

    // Admin gate — member cards surface period salary (wages). Fail closed → dashboard.
    try { await verifyProfileAdminAccess(workspaceId) } catch { redirect(`/${workspaceId}/dashboard`) }

    const profileId = await resolveActiveProfileId(session.user.id, workspaceId, (session.user as any).sessionProfileId)
    if (!profileId) redirect('/login')
    const wp = getWorkspacePrisma(workspaceId, profileId)

    const [profile, roster, currentUserRole] = await Promise.all([
        prisma.profile.findUnique({
            where: { id: profileId },
            // [M31] bannerUrl/logoUrl/settings feed the reused ProfileMembersPanel org-settings tab.
            select: { name: true, bannerUrl: true, logoUrl: true, settings: true } as any,
        }) as any,
        getProfileMembers(profileId),
        getProfileRole(session.user.id, profileId),
    ])
    const members = roster.members ?? []
    const userIds = members.map((m) => m.userId)

    // Hydrate per-member workspace metrics (workspace-scoped prisma → tasks already
    // scoped by workspace). Only completed tasks needed for salary; active count fetched separately.
    const [hydrated, activeGroups] = await Promise.all([
        userIds.length
            ? wp.user.findMany({
                where: { id: { in: userIds } },
                include: {
                    tasks: { where: { workspaceId, status: SALARY_COMPLETED_STATUS }, select: { value: true } },
                    bonuses: { where: { workspaceId }, select: { bonusAmount: true } },
                    presence: { select: { status: true, lastHeartbeat: true } },
                },
            })
            : Promise.resolve([] as any[]),
        userIds.length
            ? wp.task.groupBy({
                by: ['assigneeId'],
                where: { assigneeId: { in: userIds }, isArchived: false, status: { notIn: [SALARY_COMPLETED_STATUS, 'Đã hủy'] } },
                _count: true,
            })
            : Promise.resolve([] as { assigneeId: string | null; _count: number }[]),
    ])

    const byId = new Map<string, any>((hydrated as any[]).map((u) => [u.id, u]))
    const activeById = new Map<string, number>()
    for (const g of activeGroups as { assigneeId: string | null; _count: number }[]) {
        if (g.assigneeId) activeById.set(g.assigneeId, g._count)
    }
    const maxActive = Math.max(1, ...userIds.map((id) => activeById.get(id) ?? 0))

    const cards: McMember[] = members.map((m) => {
        const u = byId.get(m.userId)
        const salaryVND =
            (u?.tasks ?? []).reduce((s: number, t: any) => s + Number(t.value || 0), 0) +
            Number(u?.bonuses?.[0]?.bonusAmount || 0)
        // [BO HANG S/A/B/C/D 2026-07-31] Bo rank + errorRate + errorLabel + errorColor.

        const activeCount = activeById.get(m.userId) ?? 0
        const workloadPct = Math.round((activeCount / maxActive) * 100)
        let loadLabel: string | undefined
        let loadColor = '#D4D4D8'
        let barColor = '#34D399'
        if (activeCount === 0) { barColor = 'transparent' }
        else if (maxActive >= 3 && activeCount === maxActive) { loadLabel = 'đầy tải'; loadColor = '#FBBF24'; barColor = '#FBBF24' }
        else if (activeCount <= 1) { loadLabel = 'rảnh'; loadColor = '#34D399'; barColor = '#34D399' }

        const presence = presenceInfo(u?.presence)
        const name = getDisplayName(m.user as any)
        return {
            id: m.id, userId: m.userId, name, initials: initials(name), avatar: grad(m.userId),
            roleLabel: roleLabel(m.role).toUpperCase(),
            isTreasurer: Boolean(u?.isTreasurer),
            online: presence.online, presenceLabel: presence.label,
            activeCount, workloadPct, loadLabel, loadColor, barColor,
            salaryVND,
        }
    })

    // [M31] Org-settings tab data (OWNER-only — board hides the tab for non-owners; every org
    // action re-verifies OWNER server-side). Reuses the SAME getProfileMembers roster (raw rows).
    const profileSettings = {
        name: profile?.name || 'Tổ chức',
        bannerUrl: profile?.bannerUrl ?? null,
        logoUrl: profile?.logoUrl ?? null,
        portalAccent:
            profile?.settings && typeof profile.settings === 'object' && !Array.isArray(profile.settings)
                ? ((profile.settings as any).portalAccent ?? null)
                : null,
    }

    const data: McMembersData = {
        workspaceId,
        profileId,
        profileName: profile?.name || 'Tổ chức',
        backHref: `/${workspaceId}/admin`,
        trashHref: `/${workspaceId}/admin/profile-trash`,
        members: cards,
        currentUserId: session.user.id,
        currentUserRole: currentUserRole ?? undefined,
        orgMembers: members,
        profileSettings,
    }

    return <McMembersBoard data={data} />
}
