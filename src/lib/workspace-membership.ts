import { prisma } from '@/lib/db'

/**
 * [Sprint Z+1 hotfix] Ensure user has WorkspaceMember row in given workspace.
 *
 * Use case: when admin assigns task to user (or user claims from marketplace),
 * user needs WorkspaceMember row to access the workspace. Sprint Z removed
 * "same profile = auto-MEMBER" fallback in verifyWorkspaceAccess → assignees
 * without explicit row bị block khi update task.
 *
 * Call this AFTER successful task.create/update với assigneeId set.
 *
 * Idempotent: upsert pattern. Won't override existing role (e.g. don't downgrade
 * an OWNER—already converted to ADMIN—to MEMBER).
 *
 * [Z+1.fix5] Also ensures ProfileAccess exists for workspace's profile.
 * Without this, user is "a member" but INVISIBLE in profile-scoped queries
 * (admin page users list, assignee dropdown, etc.) — the "orphan membership" bug.
 *
 * @returns true if row was created, false if already existed
 */
/**
 * [AUDIT R14 — fix] True if `userId` already belongs to the workspace's PROFILE — a
 * native member (User.profileId), a ProfileAccess holder, or a WorkspaceMember row.
 * Gate assigneeId on this BEFORE createTask/assignTask provisions it via
 * ensureWorkspaceMembership (which upserts a ProfileAccess for any global userId, an
 * unsanctioned cross-tenant member-injection primitive). A user with NO profile
 * affiliation at all is also rejected — net-new people must come through the gated
 * invite flow, not task assignment.
 *
 * ⚠️ [PHẢN BIỆN 2026-07-30 · CS-1] THAM SỐ `profileId` ĐÃ BỊ XOÁ — ĐỪNG THÊM LẠI.
 *
 * Trước đây hàm này nhận `profileId?` tuỳ chọn và chỉ tự tra `workspace.profileId` khi bỏ trống.
 * 5 trên 8 nơi gọi truyền vào claim `sessionProfileId` của JWT — và chính điều đó LẬT NGƯỢC cái
 * chốt này: nó sinh ra để TỪ CHỐI userId của tenant khác, nhưng khi được đưa claim của tenant
 * NẠN NHÂN, nhánh `user.profileId === pid` lại trả TRUE cho đúng những người nó phải chặn.
 *
 * Hệ quả đã dựng lại được: kẻ tấn công giữ MỘT hàng ProfileAccess bất kỳ trên profile A (ghế USER,
 * hoặc cả ghế CLIENT — /api/profile/select chỉ kiểm hàng đó TỒN TẠI, không đọc vai) tự tạo profile
 * B + workspace W_B, trỏ claim về A, rồi gọi createTask/createTasksFromBatch/createBatchTasks với
 * workspaceId = W_B. Chốt này gật đầu ⇒ `ensureWorkspaceMembership` chạy vô điều kiện ngay sau đó,
 * GHI `WorkspaceMember(nạn nhân, W_B)` + `ProfileAccess(nạn nhân, B, 'USER')`. Có hai hàng đó rồi
 * thì `deactivateUser(nạn nhân, W_B)` qua được mọi chốt và đặt `role='LOCKED'` + bump
 * sessionVersion — nạn nhân mất quyền đăng nhập TOÀN NỀN TẢNG, kể cả vào tenant của chính họ, và
 * chốt "không được khoá OWNER" không cứu vì nó chỉ soi vai trên profile B.
 *
 * Nói cách khác: gọi bằng nguồn ĐÚNG thì chính chốt này chặn được: sự LỆCH NGUỒN là thứ mở cửa.
 * Nên nguồn không còn là lựa chọn của nơi gọi. Hàm LUÔN tự tra `workspace.profileId` — cùng đúng
 * hàng Workspace mà `verifyWorkspaceAccess` đã dùng để chấm quyền (security.ts:84-99), nên cổng và
 * dữ liệu vĩnh viễn cùng một nguồn. Đây là bài học lặp lại của cả chiến dịch: bắt từng nơi gọi tự
 * nhớ chính là cách lỗ hổng sinh ra.
 */
export async function isAssigneeInWorkspaceProfile(
    userId: string,
    workspaceId: string,
): Promise<boolean> {
    if (!userId || !workspaceId) return false
    const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { profileId: true },
    })
    const pid = ws?.profileId ?? null
    const [user, member, access] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { profileId: true, role: true } }),
        prisma.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId, workspaceId } },
            select: { role: true },
        }),
        pid
            ? prisma.profileAccess.findUnique({
                  where: { userId_profileId: { userId, profileId: pid } },
                  select: { role: true },
              })
            : Promise.resolve(null),
    ])
    if (!user) return false
    // [AUDIT CLB-1 — fix HIGH] A CLIENT (view-only portal) — whether legacy global (User.role)
    // or per-profile (ProfileAccess.role==='CLIENT') — must NEVER be admitted as an assignable
    // internal member, or task assignment becomes a CLIENT→WorkspaceMember back-door (the row it
    // mints would then override the CLIENT exclusion in verifyWorkspaceAccess). A LOCKED account
    // is likewise never provisionable. This guard runs BEFORE every admit clause below, so the
    // home-profile clause (a per-profile CLIENT has user.profileId === pid) and the `!!access`
    // clause can no longer let a CLIENT through. Mirrors every sibling door's CLIENT reject.
    if (user.role === 'CLIENT' || user.role === 'LOCKED') return false
    if (access?.role === 'CLIENT') return false
    return (!!pid && user.profileId === pid) || !!member || !!access
}

export async function ensureWorkspaceMembership(
    userId: string,
    workspaceId: string,
    defaultRole: 'MEMBER' | 'ADMIN' = 'MEMBER',
): Promise<boolean> {
    if (!userId || !workspaceId) return false

    const existing = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId, workspaceId } },
        select: { id: true },
    })

    if (existing) return false

    // [AUDIT CLB-1 — fix HIGH] Defense-in-depth: never mint an internal WorkspaceMember for a
    // CLIENT/LOCKED principal, even if a caller reached here without the isAssigneeInWorkspaceProfile
    // gate. A CLIENT of this workspace's profile is view-only; a LOCKED account is banned. Mirrors
    // the M8 accept guard (member-actions.ts) + the inviteToWorkspace CLIENT reject.
    const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { profileId: true },
    })
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    if (u?.role === 'CLIENT' || u?.role === 'LOCKED') return false
    if (ws?.profileId) {
        const pa = await prisma.profileAccess.findUnique({
            where: { userId_profileId: { userId, profileId: ws.profileId } },
            select: { role: true },
        })
        if (pa?.role === 'CLIENT') return false
    }

    try {
        await prisma.workspaceMember.create({
            data: { userId, workspaceId, role: defaultRole },
        })

        // [Z+1.fix5] Also ensure ProfileAccess exists for workspace's profile.
        // Without this, user has WorkspaceMember but is INVISIBLE in all
        // profile-scoped queries (workspacePrisma.user.findMany filters by
        // profileId OR profileAccesses). This caused the "orphan membership" bug
        // where inviteToWorkspace sees existingMember but admin page doesn't
        // show user in assignee dropdown.
        try {
            if (ws?.profileId) {
                await prisma.profileAccess.upsert({
                    where: { userId_profileId: { userId, profileId: ws.profileId } },
                    create: { userId, profileId: ws.profileId, role: 'USER' },
                    update: {},  // don't override existing role (OWNER/ADMIN stays)
                })
            }
        } catch (paErr: any) {
            // Non-fatal — WorkspaceMember was created successfully.
            // ProfileAccess creation is best-effort (race condition P2002 OK).
            if (paErr?.code !== 'P2002') {
                console.warn(`[ensureWorkspaceMembership] ProfileAccess upsert failed for user=${userId} ws=${workspaceId}:`, paErr?.message)
            }
        }

        return true
    } catch (e: any) {
        // P2002 unique constraint — race condition, treat as success
        if (e?.code !== 'P2002') {
            console.warn(`[ensureWorkspaceMembership] failed for user=${userId} ws=${workspaceId}:`, e?.message)
        }
        return false
    }
}
