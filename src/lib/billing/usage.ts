// [BILLING P1.1 + P1.4] ĐO mức sử dụng của một tổ chức (Profile).
//
// Bước "đo" cố ý tách rời bước "chặn". File này CHỈ đếm, không bao giờ từ chối ai — nhờ vậy
// bật được nó lên chạy trước, xem số thật vài tuần, rồi mới cắm chốt chặn. Bật chặn mà chưa
// biết số thật thì cách phát hiện sai sót sẽ là khách gọi điện báo hỏng.
//
// Đây cũng là lý do file này KHÔNG import gì từ tầng gói/entitlement: đo được ngay bây giờ,
// không phải chờ đổi schema.

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

/* ────────────────────────────────────────────────────────────────────────── */
/*  Ghế (seat)                                                                */
/* ────────────────────────────────────────────────────────────────────────── */

// [Định nghĩa ghế] Một ghế = một hàng ProfileAccess của NHÂN SỰ NỘI BỘ còn hoạt động.
// Hai lớp loại trừ, cả hai đều bắt buộc:
//
//  1. `ProfileAccess.role !== 'CLIENT'` — hàng CLIENT là quyền xem cổng portal cấp cho khách
//     hàng của agency, không phải nhân sự. Bảng giá ghi "Guest reviewer + Client: không giới
//     hạn, miễn phí, MỌI TIER" nên tính nó thành ghế là thu sai tiền.
//
//  2. `User.role NOT IN ('LOCKED','CLIENT')` — `deactivateUser` (user-actions.ts:330) đặt
//     `User.role = 'LOCKED'` nhưng KHÔNG xoá hàng ProfileAccess. Bỏ vế này thì nhân viên đã
//     nghỉ vẫn chiếm ghế trả tiền, và khách chỉ có cách phá dữ liệu phân quyền để hạ ghế.
//     `User.role='CLIENT'` là dạng khách cũ ở cấp toàn cục, có trước khi chuyển sang mô hình
//     CLIENT theo từng profile — vẫn còn hàng trên prod nên vẫn phải loại.
//
// Vế 2 khớp đúng nếp đã dùng khắp nơi trong mã: `role: { notIn: ['LOCKED','CLIENT'] }`
// (member-actions.ts:166, username-actions.ts:210, availability-actions.ts:207…).
//
// [Vì sao đếm trên bảng User chứ không phải bảng ProfileAccess]
// Đếm thẳng ProfileAccess sẽ ĐẾM HỤT. `createUser` (create-user.ts) tạo tài khoản chỉ với
// `User.profileId`, KHÔNG sinh hàng ProfileAccess nào — mà `isAssigneeInWorkspaceProfile`
// (workspace-membership.ts:87) công nhận `user.profileId === pid` là thành viên đầy đủ. Người
// đó làm việc được bình thường nhưng vô hình với bảng thành viên. Tính tiền theo ghế mà bỏ sót
// họ là thu hụt, và tệ hơn: đó thành cách lách trần ghế mà không ai cố ý nghĩ ra.
//
// Nên mệnh đề dưới đây soi đúng thứ `isAssigneeInWorkspaceProfile` soi — thuộc tổ chức qua
// NHÀ (User.profileId) HOẶC qua hàng thành viên — và loại CLIENT ở CẢ HAI cấp. Thứ tự loại trừ
// quan trọng: một người vừa có `User.profileId = X` vừa có `ProfileAccess(X, 'CLIENT')` thì
// vế CLIENT phải THẮNG, đúng như workspace-membership.ts:86 làm.
//
// Kiểu trả về PHẢI ghi rõ là `Prisma.UserWhereInput`. `User.role` là enum `UserRole` chứ không
// phải chuỗi; không có chú thích kiểu thì TypeScript nới `['LOCKED','CLIENT']` thành `string[]`
// và Prisma từ chối. Các file khác viết mệnh đề này thẳng trong lời gọi nên được suy kiểu theo
// ngữ cảnh và không gặp vấn đề — tách ra thành hàm thì mất lợi thế đó.
function billableSeatWhere(profileId: string): Prisma.UserWhereInput {
    return {
        role: { notIn: ['LOCKED', 'CLIENT'] },
        OR: [
            { profileId },
            { profileAccesses: { some: { profileId, role: { not: 'CLIENT' as const } } } },
        ],
        NOT: { profileAccesses: { some: { profileId, role: 'CLIENT' as const } } },
    }
}

/**
 * Số ghế nội bộ đang tính tiền của một tổ chức.
 *
 * Đây là hàm DUY NHẤT được phép định nghĩa "ghế". Nếu chỗ khác cần con số này thì gọi vào đây,
 * đừng tự viết truy vấn — hai công thức đếm khác nhau trên cùng một tổ chức là cách chắc chắn
 * nhất để hoá đơn và giao diện nói hai điều khác nhau.
 */
export async function countBillableSeats(profileId: string): Promise<number> {
    return prisma.user.count({ where: billableSeatWhere(profileId) })
}

export interface SeatHolder {
    userId: string
    username: string
    displayName: string | null
    /** Vai trong tổ chức. `null` khi người này chưa có hàng ProfileAccess — xem `membershipRowMissing`. */
    profileRole: string | null
    grantedAt: Date | null
    /**
     * `true` = người này thuộc tổ chức CHỈ qua `User.profileId`, không có hàng ProfileAccess.
     *
     * Họ vẫn làm việc được bình thường, nhưng KHÔNG hiện trong danh sách "Thành viên tổ chức"
     * (getProfileMembers đọc ProfileAccess). Đây là hệ quả của `createUser`, có từ trước và
     * không liên quan tới việc thu phí. Phơi ra đây thay vì giấu đi, vì khi khách nhìn hoá đơn
     * và thấy số ghế nhiều hơn số người trong danh sách thì đây chính là lời giải thích.
     */
    membershipRowMissing: boolean
}

/**
 * Danh sách người đang chiếm ghế — để màn hình "bạn đang dùng bao nhiêu ghế" chỉ đúng tên,
 * và để khách tự biết phải gỡ ai khi muốn hạ gói. Cùng một mệnh đề lọc với `countBillableSeats`
 * nên hai con số không bao giờ lệch.
 */
export async function listSeatHolders(profileId: string): Promise<SeatHolder[]> {
    const rows = await prisma.user.findMany({
        where: billableSeatWhere(profileId),
        orderBy: [{ username: 'asc' }],
        select: {
            id: true,
            username: true,
            displayName: true,
            profileAccesses: {
                where: { profileId },
                select: { role: true, grantedAt: true },
                take: 1,
            },
        },
    })
    return rows.map((u) => {
        const access = u.profileAccesses[0]
        return {
            userId: u.id,
            username: u.username,
            displayName: u.displayName,
            profileRole: access?.role ?? null,
            grantedAt: access?.grantedAt ?? null,
            membershipRowMissing: !access,
        }
    })
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Dung lượng                                                                */
/* ────────────────────────────────────────────────────────────────────────── */

export interface StorageUsage {
    /** Byte của video người dùng NHÌN THẤY. Đây là con số nên hiện trên giao diện. */
    liveBytes: bigint
    /** Byte đã bỏ thùng rác nhưng cron dọn chưa chạy tới. Người dùng không thấy, R2 VẪN TÍNH TIỀN. */
    trashedBytes: bigint
    /** liveBytes + trashedBytes. Đây là con số khớp với hoá đơn R2 thật. */
    totalBytes: bigint
    /** Số phiên bản video đã cộng — để đối chiếu khi nghi số sai. */
    versionCount: number
}

/**
 * Tổng dung lượng đã dùng của một tổ chức, cộng trên MỌI workspace của tổ chức đó.
 *
 * Đi thẳng qua `ReviewVersion.workspaceId` (cột denormalized, schema.prisma:1726 ghi rõ nó tồn
 * tại để phục vụ "trash/usage queries") rồi JOIN sang Workspace lấy profileId. KHÔNG dùng
 * `ReviewFolder.totalSizeBytes`: bộ đếm dồn đó chỉ được luồng XOÁ trừ đi mà luồng UPLOAD không
 * cộng vào (chính folders.ts:1326 tự khai điều này), nên giá trị của nó có thể ÂM.
 */
export async function getStorageUsage(profileId: string): Promise<StorageUsage> {
    const [row] = await prisma.$queryRaw<{ live: string; trashed: string; cnt: number }[]>`
        SELECT
            COALESCE(SUM(CASE WHEN v."deletedAt" IS NULL     THEN v."sizeBytes" ELSE 0 END), 0)::text AS live,
            COALESCE(SUM(CASE WHEN v."deletedAt" IS NOT NULL THEN v."sizeBytes" ELSE 0 END), 0)::text AS trashed,
            COUNT(*)::int AS cnt
        FROM "ReviewVersion" v
        JOIN "Workspace" w ON w.id = v."workspaceId"
        WHERE w."profileId" = ${profileId}
    `
    return {
        liveBytes: BigInt(row?.live ?? '0'),
        trashedBytes: BigInt(row?.trashed ?? '0'),
        totalBytes: BigInt(row?.live ?? '0') + BigInt(row?.trashed ?? '0'),
        versionCount: Number(row?.cnt ?? 0),
    }
}

// ── ĐÃ CỐ Ý BỎ QUA khi cộng dung lượng ───────────────────────────────────────
// Hai nguồn byte nhỏ hơn KHÔNG được cộng vào:
//   • CommentAttachment.sizeBytes — ảnh đính kèm bình luận. Không có cột workspaceId/profileId,
//     muốn quy về tổ chức phải JOIN qua bình luận → phiên bản → workspace. Trần mỗi ảnh là 100MB.
//   • Attachment.sizeBytes — tệp đính kèm trang wiki. CÓ profileId nên dễ cộng, nhưng kiểu là
//     Int (trần ~2,1GB) trong khi ba nguồn kia là BigInt — cộng gộp mà không ép kiểu thống nhất
//     sẽ sai ở tổ chức gói Scale 3TB.
// Hệ quả: con số đo được THẤP HƠN thực tế một chút. Với hạn mức thì lệch về phía này là an
// toàn — ta không bao giờ chặn nhầm người chưa thật sự vượt trần. Ghi ra đây để người sau biết
// đây là lựa chọn có chủ đích, không phải bỏ sót.

/* ────────────────────────────────────────────────────────────────────────── */
/*  Tổ chức & chẩn đoán                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

/** Số workspace đang hoạt động của tổ chức (không tính đã xoá mềm). */
export async function countActiveWorkspaces(profileId: string): Promise<number> {
    return prisma.workspace.count({ where: { profileId, status: 'ACTIVE' } })
}

export interface ProfileUsage {
    profileId: string
    seats: number
    storage: StorageUsage
    workspaces: number
    /** Byte KHÔNG quy được về tổ chức nào — xem `countOrphanStorage`. */
    orphanBytes: bigint
}

/** Một lần gọi lấy toàn cảnh, cho màn hình mức sử dụng và cho lần chạy đo thử. */
export async function getProfileUsage(profileId: string): Promise<ProfileUsage> {
    const [seats, storage, workspaces, orphanBytes] = await Promise.all([
        countBillableSeats(profileId),
        getStorageUsage(profileId),
        countActiveWorkspaces(profileId),
        countOrphanStorage(),
    ])
    return { profileId, seats, storage, workspaces, orphanBytes }
}

/**
 * Byte nằm trên workspace KHÔNG thuộc tổ chức nào (`Workspace.profileId IS NULL`).
 *
 * `Workspace.profileId` là cột nullable (schema.prisma:64), nên số byte này lọt khỏi MỌI bộ đếm
 * theo tổ chức — kể cả bộ đếm ở trên. Không phải lỗi của truy vấn, mà là dữ liệu mồ côi có thật.
 * Trả về đây để lần chạy đo thử nhìn thấy nó thay vì để nó biến mất im lặng: nếu con số này lớn,
 * phải vá dữ liệu TRƯỚC khi bật chặn, không thì tổng cộng lại sẽ không khớp hoá đơn R2.
 */
export async function countOrphanStorage(): Promise<bigint> {
    const [row] = await prisma.$queryRaw<{ bytes: string }[]>`
        SELECT COALESCE(SUM(v."sizeBytes"), 0)::text AS bytes
        FROM "ReviewVersion" v
        JOIN "Workspace" w ON w.id = v."workspaceId"
        WHERE w."profileId" IS NULL
    `
    return BigInt(row?.bytes ?? '0')
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Hiển thị                                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

/** Đổi byte thành chuỗi dễ đọc. Dùng GB thập phân cho khớp đơn vị của bảng giá và hoá đơn R2. */
export function formatBytes(bytes: bigint): string {
    const n = Number(bytes)
    if (n < 1_000) return `${n} B`
    if (n < 1_000_000) return `${(n / 1_000).toFixed(1)} KB`
    if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)} MB`
    if (n < 1_000_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} GB`
    return `${(n / 1_000_000_000_000).toFixed(2)} TB`
}

// ── QUYẾT ĐỊNH CÒN BỎ NGỎ, cần chủ sản phẩm chốt ────────────────────────────
// Hạn mức dung lượng nên tính theo `liveBytes` hay `totalBytes`?
//   • liveBytes  — công bằng với khách: họ chỉ trả cho thứ họ còn nhìn thấy. Nhưng byte trong
//     thùng rác 30 ngày vẫn nằm trên R2 và ta vẫn trả tiền cho nó.
//   • totalBytes — khớp hoá đơn thật. Nhưng khách xoá video rồi mà vẫn bị báo đầy dung lượng
//     trong 30 ngày là chuyện chắc chắn sinh khiếu nại, trừ khi giao diện nói rõ.
// Hàm này trả về CẢ HAI và không chọn hộ. Khi cắm chốt chặn thì phải chốt một con số và
// nói rõ trong Điều khoản sử dụng.
