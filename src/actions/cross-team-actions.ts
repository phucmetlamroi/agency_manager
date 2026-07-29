'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { getProfileRole, isSessionLive } from '@/lib/profile-permissions'

/**
 * Gửi yêu cầu "Du học": Admin team gốc xin cấp quyền cho user vào team khác.
 */
export async function requestCrossTeamAccess(userId: string, targetProfileId: string, workspaceId: string) {
    try {
        const session = await getSession()
        const requestedById = session?.user?.id
        if (!requestedById) return { success: false, error: 'Chưa đăng nhập' }
        // [AUDIT MISS-2 — fix] Re-assert live account (reject LOCKED ban / stale sessionVersion).
        // These getSession()-only doors never reach verifyWorkspaceAccess, so without this a banned
        // or force-logged-out admin could still mint/strip cross-tenant access with a stale JWT.
        if (!(await isSessionLive(session))) return { success: false, error: 'Phiên đăng nhập đã hết hiệu lực hoặc tài khoản đã bị khóa.' }

        // [Sprint K P1] Verify target profile exists trước khi tạo request.
        // Trước đây create với targetProfileId không tồn tại → orphaned PENDING
        // request, không bao giờ duyệt được vì không có admin profile target.
        const targetProfile = await prisma.profile.findUnique({
            where: { id: targetProfileId },
            select: { id: true },
        })
        if (!targetProfile) return { success: false, error: 'Team đích không tồn tại' }

        // Kiểm tra xem user này đã thuộc Profile này chưa
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { profileId: true }
        })
        if (!user) return { success: false, error: 'Người dùng không tồn tại' }
        if (user.profileId === targetProfileId) return { success: false, error: 'User đã thuộc team này (team gốc)' }

        // [AUDIT R2 — fix] Authority check: the caller must be OWNER/ADMIN of the
        // user's ORIGIN profile to request cross-team ("du học") access on their
        // behalf. Previously ANY logged-in user could mint a request for an
        // arbitrary userId → arbitrary targetProfileId (cross-tenant escalation seed).
        if (!user.profileId) return { success: false, error: 'Người dùng không có team gốc.' }
        const callerOriginRole = await getProfileRole(requestedById, user.profileId)
        if (callerOriginRole !== 'OWNER' && callerOriginRole !== 'ADMIN') {
            return { success: false, error: 'Bạn không có quyền gửi yêu cầu du học cho người dùng này.' }
        }

        // Kiểm tra xem đã có access chưa
        const existingAccess = await prisma.profileAccess.findUnique({
            where: { userId_profileId: { userId, profileId: targetProfileId } }
        })
        if (existingAccess) return { success: false, error: 'User đã có quyền truy cập team này' }

        // Max 5 profiles per user
        const accessCount = await prisma.profileAccess.count({ where: { userId } })
        if (accessCount >= 5) return { success: false, error: 'User này đã đạt giới hạn tối đa 5 team du học' }

        // Kiểm tra request pending
        const existingRequest = await prisma.profileAccessRequest.findUnique({
            where: { userId_targetProfileId: { userId, targetProfileId } }
        })

        if (existingRequest) {
            if (existingRequest.status === 'PENDING') return { success: false, error: 'Đang có một yêu cầu chờ duyệt ch team này' }
            // Nếu REJECTED thì có thể update lại thành PENDING
            if (existingRequest.status === 'REJECTED') {
                await prisma.profileAccessRequest.update({
                    where: { id: existingRequest.id },
                    data: { status: 'PENDING', requestedById }
                })
                return { success: true }
            }
        }

        // Tạo yêu cầu mới
        await prisma.profileAccessRequest.create({
            data: {
                userId,
                targetProfileId,
                requestedById
            }
        })

        return { success: true }
    } catch (error) {
        console.error('requestCrossTeamAccess failed:', error)
        return { success: false, error: 'Lỗi hệ thống khi gửi yêu cầu' }
    }
}

/**
 * Duyệt yêu cầu "Du học" (chỉ Admin team đích mới được duyệt)
 */
export async function approveCrossTeamAccess(requestId: string, workspaceId: string) {
    try {
        const session = await getSession()
        const approvedById = session?.user?.id
        if (!approvedById) return { success: false, error: 'Chưa đăng nhập' }
        // [AUDIT MISS-2 — fix] Reject a LOCKED / force-logged-out caller (stale JWT) before granting.
        if (!(await isSessionLive(session))) return { success: false, error: 'Phiên đăng nhập đã hết hiệu lực hoặc tài khoản đã bị khóa.' }

        const request = await prisma.profileAccessRequest.findUnique({ where: { id: requestId } })
        if (!request || request.status !== 'PENDING') return { success: false, error: 'Yêu cầu không hợp lệ hoặc đã xử lý' }

        // [AUDIT R2 — BLOCKER fix] Authority check: only an OWNER/ADMIN of the TARGET
        // profile may approve a request that grants access into it. Previously any
        // logged-in user could approve any PENDING request → mint cross-tenant
        // ProfileAccess into a profile they have no authority over.
        const approverRole = await getProfileRole(approvedById, request.targetProfileId)
        if (approverRole !== 'OWNER' && approverRole !== 'ADMIN') {
            return { success: false, error: 'Bạn không có quyền duyệt yêu cầu vào team này.' }
        }

        // [AUDIT HT-023 fix] Từ chối duyệt khi người đó ĐÃ có quyền truy cập profile này.
        //
        // `requestCrossTeamAccess` đã kiểm điều này lúc TẠO yêu cầu (dòng 49-52), nhưng chỗ DUYỆT
        // thì không — và giữa hai thời điểm đó người ta có thể đã vào profile bằng cửa chính tắc
        // (lời mời → acceptWorkspaceInvitation), vốn không hề dọn yêu cầu PENDING còn treo.
        // Khi ấy `upsert` bên dưới là no-op (`update: {}`) nhưng trạng thái vẫn lật thành APPROVED,
        // tức là ĐÓNG DẤU "du học" lên một thành viên được mời bình thường.
        //
        // Nguy hiểm vì kể từ bản vá HT-023, dấu APPROVED CHÍNH LÀ thứ cho phép ADMIN gỡ người đó.
        // Không có chốt này thì một ADMIN chỉ cần duyệt một yêu cầu cũ là lấy lại được quyền gỡ
        // thành viên vốn dành riêng cho OWNER — HT-023 mở lại. Và người duyệt cũng chính là người
        // hưởng lợi, nên không thể trông vào thiện chí.
        const existingAccess = await prisma.profileAccess.findUnique({
            where: { userId_profileId: { userId: request.userId, profileId: request.targetProfileId } },
            select: { role: true },
        })
        if (existingAccess) {
            // Đánh dấu TỪ CHỐI luôn thay vì chỉ báo lỗi: nếu để nguyên PENDING thì yêu cầu này nằm
            // lại trong hàng chờ của người duyệt, trông như bấm được nhưng bấm là lỗi — vĩnh viễn.
            // REJECTED cũng là trạng thái DUY NHẤT mà requestCrossTeamAccess hồi sinh lại được,
            // nên nếu sau này người đó rời profile rồi cần xin lại thì vẫn còn đường.
            await prisma.profileAccessRequest.update({
                where: { id: requestId },
                data: { status: 'REJECTED', approvedById },
            }).catch(() => { /* không chặn phản hồi vì một lần ghi dọn dẹp */ })
            return { success: false, error: 'Người này đã có quyền truy cập profile — không cần duyệt yêu cầu du học.' }
        }

        // Thêm quyền truy cập
        await prisma.$transaction([
            // `create` chứ KHÔNG `upsert(update:{})`: chốt kiểm ở trên chạy TRƯỚC transaction, nên
            // vẫn còn khe cho một lời mời chính tắc chen vào giữa. Với upsert, khe đó là no-op im
            // lặng mà trạng thái vẫn lật thành APPROVED — đúng lỗ vừa bịt, chỉ hẹp hơn. Với create,
            // hàng vừa chen vào gây P2002 và cả transaction rollback: nguyên tử và fail-closed.
            prisma.profileAccess.create({
                data: { userId: request.userId, profileId: request.targetProfileId }
            }),
            prisma.profileAccessRequest.update({
                where: { id: requestId },
                data: { status: 'APPROVED', approvedById }
            })
        ])

        return { success: true }
    } catch (error) {
        console.error('approveCrossTeamAccess failed:', error)
        return { success: false, error: 'Lỗi hệ thống khi duyệt yêu cầu' }
    }
}

/**
 * Từ chối yêu cầu "Du học"
 */
export async function rejectCrossTeamAccess(requestId: string, workspaceId: string) {
    try {
        const session = await getSession()
        const approvedById = session?.user?.id
        if (!approvedById) return { success: false, error: 'Chưa đăng nhập' }
        // [AUDIT MISS-2 — fix] Reject a LOCKED / force-logged-out caller (stale JWT).
        if (!(await isSessionLive(session))) return { success: false, error: 'Phiên đăng nhập đã hết hiệu lực hoặc tài khoản đã bị khóa.' }

        // [AUDIT R2 — fix] Only an OWNER/ADMIN of the target profile may reject a
        // request into it (mirrors approveCrossTeamAccess).
        const request = await prisma.profileAccessRequest.findUnique({ where: { id: requestId } })
        if (!request) return { success: false, error: 'Yêu cầu không tồn tại' }
        const approverRole = await getProfileRole(approvedById, request.targetProfileId)
        if (approverRole !== 'OWNER' && approverRole !== 'ADMIN') {
            return { success: false, error: 'Bạn không có quyền từ chối yêu cầu vào team này.' }
        }

        await prisma.profileAccessRequest.update({
            where: { id: requestId },
            data: { status: 'REJECTED', approvedById }
        })

        return { success: true }
    } catch (error) {
        console.error('rejectCrossTeamAccess failed:', error)
        return { success: false, error: 'Lỗi hệ thống khi từ chối yêu cầu' }
    }
}

/**
 * Hủy bỏ quyền "Du học" (Cả admin team gốc và team đích đều có thể gỡ)
 */
export async function removeCrossTeamAccess(userId: string, profileId: string, workspaceId: string) {
    try {
        // [AUDIT R2 — fix] Only an OWNER/ADMIN of the profile, or the user revoking
        // their OWN cross-team access, may remove. Previously this had NO auth at all
        // → any caller could delete ANY user's ProfileAccess in ANY profile.
        const session = await getSession()
        const callerId = session?.user?.id
        if (!callerId) return { success: false, error: 'Chưa đăng nhập' }
        // [AUDIT MISS-2 — fix] Reject a LOCKED / force-logged-out caller (stale JWT).
        if (!(await isSessionLive(session))) return { success: false, error: 'Phiên đăng nhập đã hết hiệu lực hoặc tài khoản đã bị khóa.' }
        const callerRole = await getProfileRole(callerId, profileId)
        const isProfileAdmin = callerRole === 'OWNER' || callerRole === 'ADMIN'
        if (!isProfileAdmin && callerId !== userId) {
            return { success: false, error: 'Bạn không có quyền gỡ quyền du học này.' }
        }

        // [AUDIT R11 — HIGH fix] Never strip a profile OWNER's access via this path. The
        // profile OWNER's authority is stored in this same ProfileAccess table, so without
        // this guard a profile ADMIN (isProfileAdmin === true) could delete the OWNER's row
        // — orphaning the tenant and bypassing the OWNER-only last-owner protection that
        // the dedicated removeFromProfileAction enforces. Mirror that protection here.
        const targetAccess = await prisma.profileAccess.findUnique({
            where: { userId_profileId: { userId, profileId } },
            select: { role: true },
        })
        if (!targetAccess) {
            return { success: false, error: 'Người dùng không có quyền du học tại profile này.' }
        }
        if (targetAccess.role === 'OWNER') {
            return { success: false, error: 'Không thể gỡ quyền của chủ sở hữu (OWNER) profile.' }
        }
        // [AUDIT HT-023 fix] Removing a peer ADMIN's access is OWNER-only, matching
        // removeFromProfileAction / canRemoveMember ('Xóa member | OWNER ✅ | ADMIN ❌'). Without
        // this a profile ADMIN could strip another ADMIN here. Self-removal stays allowed.
        if (targetAccess.role === 'ADMIN' && callerRole !== 'OWNER' && callerId !== userId) {
            return { success: false, error: 'Chỉ chủ sở hữu (OWNER) mới được gỡ quyền của quản trị viên (ADMIN).' }
        }
        // [AUDIT HT-023 fix — vế còn thiếu] Chốt trên mới chặn được target ADMIN. Tiêu đề finding
        // ghi rõ 'gỡ đồng-cấp ADMIN / THÀNH VIÊN', và vế THÀNH VIÊN vẫn hở.
        //
        // Đây là cửa gỡ quyền DU HỌC, nhưng nó chưa bao giờ kiểm target có thật sự là người du học
        // hay không — nó xoá BẤT KỲ hàng ProfileAccess nào khác OWNER. Nên một ADMIN dùng chính
        // hàm này để gỡ THÀNH VIÊN NHÀ của profile, tức là làm được đúng việc mà ma trận quyền
        // dành riêng cho OWNER (profile-permissions.ts: 'Xóa member | OWNER ✅ | ADMIN ❌', thực thi
        // ở removeFromProfileAction). Cửa chính khoá, cửa bên mở.
        //
        // ⚠️ Vòng trước tôi phân biệt bằng `User.profileId` — đúng như đề xuất (a) trong FINDINGS.
        // ĐỀ XUẤT ĐÓ SAI VỚI SCHEMA NÀY, và bản vá theo nó gần như không bao giờ kích hoạt:
        // `User.profileId` CHỈ được ghi lúc tạo tài khoản và KHÔNG hề được ghi lại khi tham gia
        // profile khác. Đường tham gia chính tắc (mời → acceptWorkspaceInvitation) chỉ upsert
        // ProfileAccess; grep `user.update` trong member-actions.ts = 0 kết quả. Nên mọi thành viên
        // được mời vào P vẫn mang profileId trỏ về profile do chính họ tạo lúc đăng ký ≠ P → điều
        // kiện cũ luôn false → ADMIN vẫn gỡ được họ y như trước.
        //
        // Nay dùng ĐỀ XUẤT (b) của FINDINGS, cài bằng một vị từ KHẲNG ĐỊNH: du học là thứ DUY NHẤT
        // để lại một ProfileAccessRequest đã APPROVED (approveCrossTeamAccess ghi nó; luồng mời
        // không bao giờ ghi). Không chứng minh được là du học thì việc gỡ thuộc về cửa chính tắc
        // removeFromProfileAction, tức OWNER-only.
        const duHocGrant = await prisma.profileAccessRequest.findUnique({
            where: { userId_targetProfileId: { userId, targetProfileId: profileId } },
            select: { status: true },
        })
        if (duHocGrant?.status !== 'APPROVED' && callerRole !== 'OWNER' && callerId !== userId) {
            return {
                success: false,
                error: 'Người này không phải diện du học tại profile. Chỉ chủ sở hữu (OWNER) mới được gỡ thành viên.',
            }
        }

        // [AUDIT OGS-1 — fix HIGH] ProfileAccess is NOT the only grant: task assignment mints a
        // real WorkspaceMember row (ensureWorkspaceMembership) for a du-học user, and
        // verifyWorkspaceAccess honors a bare WorkspaceMember row → a "revoked" cross-team user
        // would keep ghost MEMBER access to this profile's workspaces. Delete those rows (and
        // hard-delete invitation rows) in the SAME transaction, mirroring removeFromProfileAction.
        const workspaces = await prisma.workspace.findMany({
            where: { profileId },
            select: { id: true },
        })
        const workspaceIds = workspaces.map((w) => w.id)

        // Xóa ProfileAccess và Reset luôn ProfileAccessRequest để có thể xin lại sau
        await prisma.$transaction([
            prisma.workspaceMember.deleteMany({
                where: { userId, workspaceId: { in: workspaceIds } }
            }),
            prisma.workspaceInvitation.deleteMany({
                where: { workspaceId: { in: workspaceIds }, invitedUserId: userId }
            }),
            // deleteMany (not delete) → idempotent under concurrent revokes (no P2025 rollback).
            prisma.profileAccess.deleteMany({
                where: { userId, profileId, role: { not: 'OWNER' } }
            }),
            prisma.profileAccessRequest.deleteMany({
                where: { userId, targetProfileId: profileId }
            })
        ])

        return { success: true }
    } catch (error) {
        console.error('removeCrossTeamAccess failed:', error)
        return { success: false, error: 'Lỗi hệ thống khi gỡ quyền du học' }
    }
}
