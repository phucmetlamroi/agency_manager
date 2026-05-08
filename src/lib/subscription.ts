/**
 * Auth Phase 4 — SaaS subscription gating helpers.
 *
 * Profile.subscriptionTier values: FREE | TRIAL | STARTER | PRO | ENTERPRISE
 *
 * - FREE:       Legacy users — không bị giới hạn (grandfathered).
 * - TRIAL:      User mới signup — 14 ngày dùng full features. Sau hết hạn → FREE.
 * - STARTER:    Tier paid cơ bản (Phase 5+).
 * - PRO:        Tier paid cao hơn (Phase 5+).
 * - ENTERPRISE: Custom contracts (Phase 5+).
 *
 * Phase 4 chỉ cần:
 *   - isTrialActive / isTrialExpired
 *   - canUseFeature() stub — tất cả features hiện đều available cho mọi tier
 *     (gating thật sẽ enable khi billing live ở Phase 5).
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
 * Số ngày còn lại của trial (làm tròn xuống). Trả 0 nếu hết hạn / không phải trial.
 */
export function trialDaysRemaining(profile: ProfileSubscriptionState): number {
    if (!isTrialActive(profile) || !profile.trialEndsAt) return 0
    const ms = profile.trialEndsAt.getTime() - Date.now()
    return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)))
}

/**
 * Feature flag check. Phase 4: tất cả features đều available cho mọi tier.
 * Phase 5+: gate theo `featureKey` based trên tier.
 *
 * @example canUseFeature(profile, 'unlimited_tasks') → true (Phase 4)
 */
export type FeatureKey =
    | 'unlimited_tasks'
    | 'export_pdf'
    | 'team_invite'
    | 'audit_log_view'
    | 'analytics_advanced'
    | 'custom_branding'

export function canUseFeature(
    profile: ProfileSubscriptionState,
    _featureKey: FeatureKey
): boolean {
    // Phase 4: trial expired → block premium features (Phase 5 sẽ enable)
    // Hiện tại chỉ block khi explicitly EXPIRED tier (chưa có); FREE legacy = full.
    if (profile.subscriptionTier === 'TRIAL' && isTrialExpired(profile)) {
        // Trial đã hết hạn nhưng cron chưa chạy yet → block
        return false
    }
    // Tất cả case khác: available
    return true
}
