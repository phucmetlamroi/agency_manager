'use server'

/**
 * [Quick Create] Pricing Rule CRUD server actions.
 *
 * Pricing rules define how Quick Create converts video duration → task price.
 * Each workspace may have multiple rules; one can be flagged as default.
 * Rules can optionally scope to a specific client (clientId), else apply
 * workspace-wide.
 *
 * Rule types:
 *   - flat: fixed price per video
 *   - per_minute: linear rate × duration
 *   - tiered_duration: brackets (Dr. Marwan's formula style)
 *   - custom: future user-defined formula (reserved)
 *
 * All admin-gated via `verifyWorkspaceAccess(workspaceId, 'ADMIN')`.
 */

import { prisma } from '@/lib/db'
import { verifyWorkspaceAccess } from '@/lib/security'
import { audit } from '@/lib/audit-log'
import { revalidatePath } from 'next/cache'

/* ──────────────────────────────────────────────────────────────────── */
/*  Types                                                              */
/* ──────────────────────────────────────────────────────────────────── */

export type RuleType = 'flat' | 'per_minute' | 'tiered_duration' | 'custom'

export interface FlatConfig {
    priceUSD: number
    wageVND: number
}

export interface PerMinuteConfig {
    ratePerMinuteUSD: number
    wagePerMinuteVND: number
    minimumUSD?: number
    minimumVND?: number
}

export interface TieredConfig {
    tiers: Array<{
        maxSeconds: number
        priceUSD: number
        wageVND: number
        extraPerBlock?: number
        extraBlockSeconds?: number
        extraWagePerBlock?: number
    }>
}

export interface CustomConfig {
    formula: string
    variables: Record<string, number>
}

export type PricingRuleConfig =
    | FlatConfig
    | PerMinuteConfig
    | TieredConfig
    | CustomConfig

export interface PricingRuleInput {
    name: string
    clientId?: number | null
    ruleType: RuleType
    config: PricingRuleConfig
    isDefault?: boolean
    sortOrder?: number
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Validation                                                         */
/* ──────────────────────────────────────────────────────────────────── */

function validateConfig(ruleType: RuleType, config: any): string | null {
    if (!config || typeof config !== 'object') {
        return 'Config phải là object.'
    }
    switch (ruleType) {
        case 'flat': {
            if (typeof config.priceUSD !== 'number' || config.priceUSD < 0)
                return 'priceUSD phải là số ≥ 0.'
            if (typeof config.wageVND !== 'number' || config.wageVND < 0)
                return 'wageVND phải là số ≥ 0.'
            return null
        }
        case 'per_minute': {
            if (
                typeof config.ratePerMinuteUSD !== 'number' ||
                config.ratePerMinuteUSD < 0
            )
                return 'ratePerMinuteUSD phải là số ≥ 0.'
            if (
                typeof config.wagePerMinuteVND !== 'number' ||
                config.wagePerMinuteVND < 0
            )
                return 'wagePerMinuteVND phải là số ≥ 0.'
            return null
        }
        case 'tiered_duration': {
            if (!Array.isArray(config.tiers) || config.tiers.length === 0)
                return 'tiers phải là mảng có ít nhất 1 tier.'
            for (const t of config.tiers) {
                if (typeof t.maxSeconds !== 'number' || t.maxSeconds <= 0)
                    return 'maxSeconds phải là số > 0.'
                if (typeof t.priceUSD !== 'number' || t.priceUSD < 0)
                    return 'tier.priceUSD phải là số ≥ 0.'
                if (typeof t.wageVND !== 'number' || t.wageVND < 0)
                    return 'tier.wageVND phải là số ≥ 0.'
            }
            return null
        }
        case 'custom': {
            if (typeof config.formula !== 'string' || !config.formula.trim())
                return 'formula phải là chuỗi không rỗng.'
            if (!config.variables || typeof config.variables !== 'object')
                return 'variables phải là object.'
            return null
        }
        default:
            return `ruleType không hợp lệ: ${ruleType}`
    }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  1. listPricingRules                                                */
/* ──────────────────────────────────────────────────────────────────── */

export async function listPricingRules(workspaceId: string) {
    try {
        // MEMBER role can READ pricing rules (needed for Quick Create dropdown
        // — non-admin doesn't see Settings page but may use Quick Create).
        await verifyWorkspaceAccess(workspaceId, 'MEMBER')

        const rules = await prisma.pricingRule.findMany({
            where: { workspaceId },
            include: {
                client: {
                    select: { id: true, name: true },
                },
            },
            orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        })

        return { rules }
    } catch (err: any) {
        if (err?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: 'Bạn không có quyền truy cập workspace này.' }
        }
        console.error('[listPricingRules]', err)
        return { error: err?.message ?? 'Lỗi khi load pricing rules.' }
    }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  2. createPricingRule                                               */
/* ──────────────────────────────────────────────────────────────────── */

export async function createPricingRule(
    workspaceId: string,
    data: PricingRuleInput,
) {
    try {
        const { userId } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        // Validate name
        if (!data.name?.trim()) {
            return { error: 'Tên pricing rule không được rỗng.' }
        }

        // Validate config shape
        const validationErr = validateConfig(data.ruleType, data.config)
        if (validationErr) return { error: validationErr }

        // Fetch workspace to get profileId
        const ws = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { profileId: true },
        })
        if (!ws?.profileId) {
            return { error: 'Workspace không có profileId.' }
        }
        const profileId = ws.profileId

        // If client specified, verify it belongs to this profile
        if (data.clientId != null) {
            const client = await prisma.client.findFirst({
                where: { id: data.clientId, profileId, status: 'ACTIVE' },
                select: { id: true },
            })
            if (!client) {
                return {
                    error: 'Client không tồn tại trong profile của workspace này.',
                }
            }
        }

        // If isDefault=true, unflag other defaults first (atomically)
        const rule = await prisma.$transaction(async (tx) => {
            if (data.isDefault) {
                await tx.pricingRule.updateMany({
                    where: { workspaceId, isDefault: true },
                    data: { isDefault: false },
                })
            }
            return tx.pricingRule.create({
                data: {
                    name: data.name.trim(),
                    clientId: data.clientId ?? null,
                    workspaceId,
                    profileId,
                    ruleType: data.ruleType,
                    config: data.config as any,
                    isDefault: data.isDefault ?? false,
                    sortOrder: data.sortOrder ?? 0,
                },
            })
        })

        await audit({
            workspaceId,
            actorUserId: userId,
            action: 'pricing_rule.created',
            targetType: 'PricingRule',
            targetId: rule.id,
            after: {
                name: rule.name,
                ruleType: rule.ruleType,
                isDefault: rule.isDefault,
            },
        })

        revalidatePath(`/${workspaceId}/admin/settings`)
        return { success: true, rule }
    } catch (err: any) {
        if (err?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: 'Chỉ admin mới được tạo pricing rule.' }
        }
        console.error('[createPricingRule]', err)
        return { error: err?.message ?? 'Lỗi khi tạo pricing rule.' }
    }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  3. updatePricingRule                                               */
/* ──────────────────────────────────────────────────────────────────── */

export async function updatePricingRule(
    ruleId: string,
    workspaceId: string,
    data: Partial<PricingRuleInput>,
) {
    try {
        const { userId } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        const existing = await prisma.pricingRule.findFirst({
            where: { id: ruleId, workspaceId },
        })
        if (!existing) {
            return { error: 'Pricing rule không tồn tại.' }
        }

        // If user updates config, validate against (possibly new) ruleType
        const effectiveRuleType = (data.ruleType ?? existing.ruleType) as RuleType
        if (data.config !== undefined) {
            const validationErr = validateConfig(effectiveRuleType, data.config)
            if (validationErr) return { error: validationErr }
        }

        // If client changing, verify ownership
        if (data.clientId !== undefined && data.clientId !== null) {
            const ws = await prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: { profileId: true },
            })
            const client = await prisma.client.findFirst({
                where: { id: data.clientId, profileId: ws?.profileId, status: 'ACTIVE' },
                select: { id: true },
            })
            if (!client) {
                return {
                    error: 'Client không tồn tại trong profile của workspace này.',
                }
            }
        }

        const updateData: any = {}
        if (data.name !== undefined) updateData.name = data.name.trim()
        if (data.clientId !== undefined) updateData.clientId = data.clientId
        if (data.ruleType !== undefined) updateData.ruleType = data.ruleType
        if (data.config !== undefined) updateData.config = data.config
        if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder

        const updated = await prisma.$transaction(async (tx) => {
            if (data.isDefault === true) {
                await tx.pricingRule.updateMany({
                    where: { workspaceId, isDefault: true, id: { not: ruleId } },
                    data: { isDefault: false },
                })
                updateData.isDefault = true
            } else if (data.isDefault === false) {
                updateData.isDefault = false
            }
            return tx.pricingRule.update({
                where: { id: ruleId },
                data: updateData,
            })
        })

        await audit({
            workspaceId,
            actorUserId: userId,
            action: 'pricing_rule.updated',
            targetType: 'PricingRule',
            targetId: ruleId,
            before: { name: existing.name, ruleType: existing.ruleType },
            after: { ...updateData },
        })

        revalidatePath(`/${workspaceId}/admin/settings`)
        return { success: true, rule: updated }
    } catch (err: any) {
        if (err?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: 'Chỉ admin mới được sửa pricing rule.' }
        }
        console.error('[updatePricingRule]', err)
        return { error: err?.message ?? 'Lỗi khi cập nhật pricing rule.' }
    }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  4. deletePricingRule                                               */
/* ──────────────────────────────────────────────────────────────────── */

export async function deletePricingRule(ruleId: string, workspaceId: string) {
    try {
        const { userId } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        const existing = await prisma.pricingRule.findFirst({
            where: { id: ruleId, workspaceId },
        })
        if (!existing) {
            return { error: 'Pricing rule không tồn tại.' }
        }

        await prisma.pricingRule.delete({ where: { id: ruleId } })

        await audit({
            workspaceId,
            actorUserId: userId,
            action: 'pricing_rule.deleted',
            targetType: 'PricingRule',
            targetId: ruleId,
            before: {
                name: existing.name,
                ruleType: existing.ruleType,
                clientId: existing.clientId,
            },
        })

        revalidatePath(`/${workspaceId}/admin/settings`)
        return { success: true }
    } catch (err: any) {
        if (err?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: 'Chỉ admin mới được xóa pricing rule.' }
        }
        console.error('[deletePricingRule]', err)
        return { error: err?.message ?? 'Lỗi khi xóa pricing rule.' }
    }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  5. setDefaultPricingRule                                           */
/* ──────────────────────────────────────────────────────────────────── */

export async function setDefaultPricingRule(
    ruleId: string,
    workspaceId: string,
) {
    try {
        const { userId } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        const existing = await prisma.pricingRule.findFirst({
            where: { id: ruleId, workspaceId },
        })
        if (!existing) {
            return { error: 'Pricing rule không tồn tại.' }
        }

        await prisma.$transaction(async (tx) => {
            await tx.pricingRule.updateMany({
                where: { workspaceId, isDefault: true },
                data: { isDefault: false },
            })
            await tx.pricingRule.update({
                where: { id: ruleId },
                data: { isDefault: true },
            })
        })

        await audit({
            workspaceId,
            actorUserId: userId,
            action: 'pricing_rule.set_default',
            targetType: 'PricingRule',
            targetId: ruleId,
            after: { name: existing.name },
        })

        revalidatePath(`/${workspaceId}/admin/settings`)
        return { success: true }
    } catch (err: any) {
        if (err?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: 'Chỉ admin mới được đặt default pricing rule.' }
        }
        console.error('[setDefaultPricingRule]', err)
        return { error: err?.message ?? 'Lỗi khi set default.' }
    }
}
