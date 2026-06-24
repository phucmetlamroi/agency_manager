# Invite / Membership Flow — Security Audit & Regression Round

**Branch:** `claude/cranky-austin` · **Date:** 2026-06-24 · **Scope:** the full user-invite / membership / cross-team surface after the per-workspace → org-level (`ProfileAccess`) membership merge.

Goal (user): *"tổ chức vòng bảo mật và luồng mời người dùng từ nhiều nguồn và trường hợp khác nhau và tổ chức test thật kĩ để ko xảy ra sai sót nữa… tôi tin chắc chắn vẫn sẽ có lỗi."* — and there were real bugs.

## Method

1. **A0 — adversarial audit** (multi-agent): 10 lens-based finders (privilege-escalation, cross-tenant, enumeration-oracle, CLIENT/LOCKED-bypass, orphan/ghost-state, consent-bypass, idempotency/replay, rate-limit, OAuth-link, session-integrity) → each finding cross-examined by **2 independent skeptics defaulting to REFUTE** (kept only if both confirmed a concrete repro) → completeness critic → 2nd verify wave. **14 candidates → 12 confirmed** (5 High, 5 Medium, 2 Low); 3 refuted (already covered by R1–R14).
2. **A2 — surgical fixes** for all 12 + 1 sibling (MISS-3) surfaced by the integration check. No prior R1–R14 hardening weakened — every fix is additive with a `[AUDIT <id> — fix]` comment.
3. **Re-verify** (multi-agent): each patch independently checked for *(a)* repro now closed, *(b)* no legit-flow regression / over-block, *(c)* prior hardening intact + a cross-cutting seam/missed-door check. Result: **13/13 PASS, 0 regression, all seams hold.**
4. **A1 — regression harness** `scripts/test-invite-security.ts` locks the highest-impact fixes on the Neon **test** branch.
5. Gates: `npx tsc --noEmit` clean · `npm run build` (webpack) green · **`npm run test:invite-security` → 75 passed / 0 failed** on the Neon test branch.

## Confirmed findings & fixes

| ID | Sev | Title | Fix location |
|----|-----|-------|--------------|
| **PE-1** | High | `verifyWorkspaceAccess` honored a `WorkspaceMember` row *before* the CLIENT exclusion → a CLIENT with a stray membership row got internal MEMBER/ADMIN access (and finance/`jobPriceUSD`) | `src/lib/security.ts` — CLIENT branch moved **before** the membership lookup; a CLIENT can never be overridden by a membership row (mirrors `canAccessWorkspace`) |
| **CLB-1** | High | Task-assignment back-door: `isAssigneeInWorkspaceProfile` admitted a CLIENT, then `ensureWorkspaceMembership` minted a `WorkspaceMember(MEMBER)` row that overrode the CLIENT restriction | `src/lib/workspace-membership.ts` — both functions now reject `User.role` CLIENT/LOCKED and `ProfileAccess.role==='CLIENT'` before admitting/minting |
| **OGS-1** | High | `removeCrossTeamAccess` (du-học revoke) deleted only `ProfileAccess` → the revoked user kept ghost `WorkspaceMember` access | `src/actions/cross-team-actions.ts` — also deletes `WorkspaceMember` + `WorkspaceInvitation` rows in the profile's workspaces (same tx), mirroring `removeFromProfileAction` |
| **OAUTH-LINK-001** | High | OAuth link used non-deterministic `findFirst` on the non-`@unique` email → could burn the unique `googleId` onto a LOCKED/CLIENT/foreign-tenant duplicate (permanent lock-out / wrong-tenant login) | `src/lib/google-auth.ts` — routes through `findUserByEmailOrUsername` (deterministic), throws on `matchCount>1`, never writes `googleId` onto a LOCKED/CLIENT row |
| **SI-1** | High | Canonical profile-member doors (`invite/remove/changeRole/transfer/grant`) authenticated by `getSession()` only — no `sessionVersion`/LOCKED re-check → a banned/force-logged-out OWNER kept full control with a stale JWT | `src/actions/profile-member-actions.ts` — `requireAuthenticated()` now calls `isSessionLive()` |
| **SI-2** | Med | `getProfileMembers` leaked the staff roster + emails to a revoked OWNER/ADMIN (same gap, read side) | same `requireAuthenticated()` fix (covers the read door) |
| **MISS-2** | Med | All 4 `cross-team-actions` mutations had the same liveness gap | `src/actions/cross-team-actions.ts` — `isSessionLive()` on all 4 |
| **MISS-3** | Med | `profile-actions` (`updateProfileSettings`/`deleteProfileAction`/`restoreProfileAction`) — same gap on self-tenant settings/soft-delete (surfaced by the re-verify integration check) | `src/actions/profile-actions.ts` — `isSessionLive()` on all 3 |
| **CONSENT-1** | Med | Consent gate (`allowExternalInvites`) was skipped for null-home-profile users (`targetUser.profileId &&` short-circuit) → force-add despite consent-off | `src/actions/profile-member-actions.ts` + `src/actions/member-actions.ts` — dropped the `profileId &&` precondition (`profileId !== profileId` is true for null) |
| **IR-1** | Med | `transferProfileOwnershipAction` had no CAS/lock → two concurrent transfers minted a 2nd, unremovable co-OWNER | `src/actions/profile-member-actions.ts` — interactive tx with CAS `updateMany(where role='OWNER')`, `count!==1 → abort` |
| **ENUM-1** | Med | `createUser` was an unthrottled global email-existence oracle (sibling invite doors got `checkInviteCallerRate`; this one was missed) | `src/actions/create-user.ts` — `checkInviteCallerRate` before the email lookup |
| **IR-2** | Low | `removeFromProfileAction` could race a transfer → 0-OWNER profile (unrecoverable) | `src/actions/profile-member-actions.ts` — delete scoped to `role: { not: 'OWNER' }` (also mirrored in `removeCrossTeamAccess`) |
| **RL-1** | Low | Rate-limiter fails **OPEN** when Upstash env is missing; the "deploy WILL FAIL" comment was false (no such guard exists) | `src/lib/rate-limit-upstash.ts` — now **fail-CLOSED in production** (`noLimiterResult()`), fail-open in dev; comment corrected (operator confirmed Upstash is provisioned in prod) |

### Refuted (already covered — no change)
Google OAuth account-takeover (callback already gates `verifiedEmail` + blocks LOCKED/CLIENT, R14) · `changeProfileRoleAction` privilege-escalation (OWNER-only, blocks OWNER/CLIENT targets) · one critic candidate that re-stated an R3-covered path.

## RL-1 — resolved (fail-closed in production)

The operator confirmed Upstash Redis **is** provisioned in production, so `src/lib/rate-limit-upstash.ts` now **fails CLOSED in production** when the limiter is unavailable (`noLimiterResult()` returns `success:false`) — a null limiter in prod means a real outage, and refusing is safer than silently dropping every signup/login/OTP/invite-caller throttle. Dev still fails open so local work without Upstash is unaffected.

> ⚠️ **Operational note:** because the limiters are now fail-closed in production, if `UPSTASH_REDIS_REST_URL/TOKEN` are ever unset/rotated-out in prod, signup/login/OTP/invite will start returning rate-limit errors until the vars are restored. Keep the Upstash credentials present in every production environment (they're listed in `RAILWAY_MIGRATION.md`).

## Test strategy & how to run

`scripts/test-invite-security.ts` runs **only** against the Neon `test` branch (`.env.test`); it hard-aborts unless `DATABASE_URL` contains the test-branch marker and never the prod marker. It seeds an isolated `__invsec__`-prefixed fixture graph, asserts, and deletes it (pre + post, idempotent).

```bash
npm run test:invite-security      # tsx scripts/test-invite-security.ts (.env.test)
```

It pins the **session-free authorization core** — where every security decision actually lives:
- **R1** `findUserByEmailOrUsername` (deterministic winner + `matchCount>1`).
- **SI/MISS** `isSessionLive` (LOCKED + stale `sessionVersion` rejected; legacy `null→0` not locked out).
- **CLB-1** `isAssigneeInWorkspaceProfile` + `ensureWorkspaceMembership` reject CLIENT/LOCKED (and assert **no** WorkspaceMember row is written).
- **PE-1 (rule)** `canAccessWorkspace` — CLIENT denied even **with** a stray WorkspaceMember row.
- **OAUTH-LINK-001** `findOrCreateGoogleUser` — links a single account, **refuses** duplicate-email, **never burns** `googleId` onto a LOCKED row.
- **Matrix** `canInvite/Remove/ChangeRole/TransferOwnership`; owner-floor invariant (1 OWNER/profile).

The cookie-bound server-action wrappers (`getSession()` via `next/headers`) can't be invoked from a plain `tsx` script, so their **action-internal** wiring (consent gate, transfer CAS, IR-2 scoped delete, liveness wiring) is covered instead by the multi-agent re-verify pass (13/13 PASS) + `tsc`/`build`. End-to-end cookie coverage remains deferred to Playwright.

## Files touched
`src/lib/security.ts` · `src/lib/workspace-membership.ts` · `src/lib/google-auth.ts` · `src/lib/profile-permissions.ts` (new `isSessionLive`) · `src/lib/rate-limit-upstash.ts` · `src/actions/profile-member-actions.ts` · `src/actions/cross-team-actions.ts` · `src/actions/member-actions.ts` · `src/actions/create-user.ts` · `src/actions/profile-actions.ts` · `scripts/test-invite-security.ts`.
