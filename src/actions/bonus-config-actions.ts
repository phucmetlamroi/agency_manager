'use server'

import { prisma } from '@/lib/db'
import { verifyWorkspaceAccess } from '@/lib/security'
import { revalidatePath } from 'next/cache'

/**
 * Payroll Bonus Config — cấu hình tính thưởng riêng theo TEAM (profile).
 * 1 config / profile, dùng lại mọi tháng. Top 1/2/3: bật/tắt + %.
 * Gate quyền giống calculateMonthlyBonus (workspace ADMIN).
 */

// Hustly Team — giữ luật cũ làm mặc định khi team chưa cấu hình.
const HUSTLY_PROFILE_ID = '61f25775-eb95-4ece-96e8-99ae97542af1'

export interface BonusConfigDTO {
    top1Enabled: boolean
    top1Percent: number
    top2Enabled: boolean
    top2Percent: number
    top3Enabled: boolean
    top3Percent: number
}

function toNum(v: unknown): number {
    if (v == null) return 0
    const n = typeof v === 'object' && v !== null && 'toNumber' in v ? (v as { toNumber(): number }).toNumber() : Number(v)
    return Number.isFinite(n) ? n : 0
}

/** Cấu hình mặc định cho team chưa lưu (giữ hành vi cũ). */
function defaultConfig(profileId: string | null): BonusConfigDTO {
    const isHustly = profileId === HUSTLY_PROFILE_ID
    return {
        top1Enabled: true,
        top1Percent: isHustly ? 15 : 10,
        top2Enabled: true,
        top2Percent: isHustly ? 10 : 5,
        top3Enabled: false,
        top3Percent: 0,
    }
}

export async function getBonusConfig(
    workspaceId: string,
): Promise<{ config: BonusConfigDTO; isDefault: boolean } | { error: string }> {
    try {
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
    } catch {
        return { error: 'Không có quyền' }
    }

    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { profileId: true } })
    if (!ws?.profileId) return { error: 'Workspace chưa gắn profile' }

    const cfg = await prisma.bonusConfig.findUnique({ where: { profileId: ws.profileId } })
    if (!cfg) return { config: defaultConfig(ws.profileId), isDefault: true }

    return {
        config: {
            top1Enabled: cfg.top1Enabled,
            top1Percent: toNum(cfg.top1Percent),
            top2Enabled: cfg.top2Enabled,
            top2Percent: toNum(cfg.top2Percent),
            top3Enabled: cfg.top3Enabled,
            top3Percent: toNum(cfg.top3Percent),
        },
        isDefault: false,
    }
}

export async function updateBonusConfig(
    workspaceId: string,
    input: BonusConfigDTO,
): Promise<{ success: true } | { error: string }> {
    let userId: string
    try {
        const ctx = await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        userId = ctx.userId
    } catch {
        return { error: 'Không có quyền' }
    }

    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { profileId: true } })
    if (!ws?.profileId) return { error: 'Workspace chưa gắn profile' }

    // Validation: Top 1 bắt buộc; hạng Bật → % trong (0, 100].
    if (!input.top1Enabled) return { error: 'Phải bật ít nhất Top 1' }
    const checkTier = (enabled: boolean, percent: number, label: string): string | null => {
        if (!enabled) return null
        if (!(percent > 0)) return `${label}: đang bật thì phải nhập % lớn hơn 0`
        if (percent > 100) return `${label}: % tối đa là 100`
        return null
    }
    const err =
        checkTier(input.top1Enabled, input.top1Percent, 'Top 1') ||
        checkTier(input.top2Enabled, input.top2Percent, 'Top 2') ||
        checkTier(input.top3Enabled, input.top3Percent, 'Top 3')
    if (err) return { error: err }

    const round1 = (p: number) => Math.round(p * 10) / 10 // 1 chữ số thập phân
    const data = {
        top1Enabled: true,
        top1Percent: round1(input.top1Percent),
        top2Enabled: input.top2Enabled,
        top2Percent: input.top2Enabled ? round1(input.top2Percent) : 0,
        top3Enabled: input.top3Enabled,
        top3Percent: input.top3Enabled ? round1(input.top3Percent) : 0,
    }

    await prisma.bonusConfig.upsert({
        where: { profileId: ws.profileId },
        update: data,
        create: { profileId: ws.profileId, ...data },
    })

    try {
        await prisma.auditLog.create({
            data: {
                workspaceId,
                actorUserId: userId,
                action: 'bonus_config.updated',
                targetType: 'BonusConfig',
                targetId: ws.profileId,
                afterData: data,
            },
        })
    } catch {
        /* non-blocking */
    }

    revalidatePath(`/${workspaceId}/admin/payroll`)
    return { success: true }
}
