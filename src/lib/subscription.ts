/**
 * SaaS Subscription Gating — enforce tier-based feature access.
 *
 * Profile.subscriptionTier values: FREE | TRIAL | STARTER | PRO | ENTERPRISE
 *
 * Tier semantics:
 * - FREE:       Legacy users (grandfathered) hoặc trial expired
 *               → READ-ONLY mode (xem được data, KHÔNG create/modify mới)
 * - TRIAL:      User mới signup — 14 ngày full features
 * - STARTER:    Paid tier cơ bản (Phase 5+ billing)
 * - PRO:        Paid tier cao (Phase 5+)
 * - ENTERPRISE: Custom contracts (Phase 5+)
 *
 * Audit finding #6 (CRITICAL fix): Trial expired không block data access.
 * Trước: cron set tier=FREE nhưng `canUseFeature()` chỉ check explicitly
 * EXPIRED state (không có) → user vẫn create task/invite/edit thoải mái.
 *
 * Sau: tier=FREE → block các action "WRITE/MUTATE" (createTask, inviteMember,
 * createWorkspace, ...). User vẫn xem được data, nhưng phải upgrade để tiếp tục.
 *
 * Server actions quan trọng MUST gate qua `requireFeature(profile, key)`:
 *   - createTask, updateTask
 *   - inviteMember, removeMember
 *   - createWorkspace
 *   - export PDF/Excel
 *   - audit log view (admin)
 */

export type SubscriptionTier = 'FREE' | 'TRIAL' | 'STARTER' | 'PRO' | 'ENTERPRISE'

export type ProfileSubscriptionState = {
    subscriptionTier: string
    trialStartedAt: Date | null
    trialEndsAt: Date | null
}

export function isTrialActive(profile: ProfileSubscriptionState): boolean {
    return profile.subscriptionTier === 'TRIAL'
        && profile.trialEndsAt !== null
        && profile.trialEndsAt.getTime() > Date.now()
}

export function isTrialExpired(profile: ProfileSubscriptionState): boolean {
    return profile.subscriptionTier === 'TRIAL'
        && profile.trialEndsAt !== null
        && profile.trialEndsAt.getTime() <= Date.now()
}

/**
 * Profile có quyền MUTATE (create/edit/delete) data không?
 *
 * - FREE: read-only (post-trial). Block writes.
 * - TRIAL active: full access.
 * - TRIAL expired: read-only (cron chưa chạy yet, vẫn block).
 * - STARTER/PRO/ENTERPRISE: full access.
 */
export function canMutate(profile: ProfileSubscriptionState): boolean {
    const tier = profile.subscriptionTier
    if (tier === 'STARTER' || tier === 'PRO' || tier === 'ENTERPRISE') {
        return true
    }
    if (tier === 'TRIAL') {
        return isTrialActive(profile)
    }
    // FREE = read-only mode
    return false
}

/**
 * Số ngày còn lại của trial (làm tròn xuống). 0 nếu hết hạn / không phải trial.
 */
export function trialDaysRemaining(profile: ProfileSubscriptionState): number {
    if (!isTrialActive(profile) || !profile.trialEndsAt) return 0
    const ms = profile.trialEndsAt.getTime() - Date.now()
    return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)))
}

export type FeatureKey =
    | 'unlimited_tasks'      // tạo task không giới hạn
    | 'export_pdf'           // export invoice/payroll PDF
    | 'export_excel'         // export Excel
    | 'team_invite'          // mời thành viên
    | 'audit_log_view'       // xem audit log
    | 'analytics_advanced'   // analytics dashboard
    | 'custom_branding'      // custom logo/banner
    | 'workspace_create'     // tạo workspace mới (sau workspace đầu tiên)

/**
 * Tier requirements per feature.
 * - 'mutate' = bất kỳ tier nào cho phép MUTATE (TRIAL active hoặc paid)
 * - 'paid' = chỉ STARTER/PRO/ENTERPRISE
 * - 'pro' = chỉ PRO/ENTERPRISE
 * - 'enterprise' = chỉ ENTERPRISE
 * - 'free' = ai cũng dùng được (read-only OK)
 */
const FEATURE_REQUIREMENTS: Record<FeatureKey, 'free' | 'mutate' | 'paid' | 'pro' | 'enterprise'> = {
    unlimited_tasks: 'mutate',
    export_pdf: 'mutate',
    export_excel: 'mutate',
    team_invite: 'mutate',
    audit_log_view: 'free',          // ADMIN xem audit log → cần quyền nghiệp vụ, không gate theo tier
    analytics_advanced: 'paid',      // Advanced analytics chỉ paid tier
    custom_branding: 'pro',
    workspace_create: 'mutate',
}

export function canUseFeature(
    profile: ProfileSubscriptionState,
    featureKey: FeatureKey,
): boolean {
    const requirement = FEATURE_REQUIREMENTS[featureKey]
    const tier = profile.subscriptionTier

    switch (requirement) {
        case 'free':
            return true
        case 'mutate':
            return canMutate(profile)
        case 'paid':
            return tier === 'STARTER' || tier === 'PRO' || tier === 'ENTERPRISE'
        case 'pro':
            return tier === 'PRO' || tier === 'ENTERPRISE'
        case 'enterprise':
            return tier === 'ENTERPRISE'
    }
}

/**
 * Throw lỗi rõ ràng nếu feature không available.
 * Dùng trong server actions để gate access.
 *
 * @example
 *   await requireFeature(profile, 'team_invite')
 *   // → throw 'SUBSCRIPTION_LIMIT' nếu trial hết hạn
 */
export class SubscriptionLimitError extends Error {
    code = 'SUBSCRIPTION_LIMIT' as const
    featureKey: FeatureKey

    constructor(featureKey: FeatureKey, message?: string) {
        super(message ?? `Tính năng "${featureKey}" yêu cầu nâng cấp gói.`)
        this.name = 'SubscriptionLimitError'
        this.featureKey = featureKey
    }
}

export function requireFeature(
    profile: ProfileSubscriptionState,
    featureKey: FeatureKey,
): void {
    if (!canUseFeature(profile, featureKey)) {
        if (isTrialExpired(profile)) {
            throw new SubscriptionLimitError(
                featureKey,
                `Trial đã hết hạn. Vui lòng nâng cấp tại /upgrade để tiếp tục sử dụng "${featureKey}".`,
            )
        }
        throw new SubscriptionLimitError(featureKey)
    }
}

/**
 * Helper async — fetch profile từ DB rồi check.
 * Dùng khi caller chỉ có workspaceId, chưa có profile object.
 */
export async function requireFeatureForWorkspace(
    prismaClient: { profile: { findFirst: (args: any) => Promise<any> } },
    workspaceId: string,
    featureKey: FeatureKey,
): Promise<void> {
    const profile = await prismaClient.profile.findFirst({
        where: { workspaces: { some: { id: workspaceId } } },
        select: { subscriptionTier: true, trialStartedAt: true, trialEndsAt: true },
    })
    if (!profile) {
        // Không tìm thấy profile = không trong SaaS plan → coi như FREE (block mutate)
        throw new SubscriptionLimitError(featureKey, 'Workspace không thuộc Profile nào.')
    }
    requireFeature(profile, featureKey)
}
