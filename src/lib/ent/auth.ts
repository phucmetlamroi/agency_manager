// [Giải trí] Cổng vào kho phim — mọi trang /entertainment và mọi route /api/ent/*
// đi qua đúng một cửa này.
//
// Hai lớp, cả hai đều bắt buộc:
//   1. Phiên đăng nhập HustlyTasker (getSession) — biết ai đang xem, và cho phép
//      chặn dò code theo từng tài khoản chứ không chỉ theo IP.
//   2. Cookie `ent_access` — JWT HS256 chứng minh đã nhập đúng code.
//
// Cookie CHỈ mang `codeId`, KHÔNG mang vai trò. Vai trò đọc lại từ EntAccessCode ở
// mỗi request. Nhét role vào token thì nhanh hơn một truy vấn, nhưng đổi lại chủ
// hệ thống thu hồi code xong vẫn phải chờ tối đa 30 ngày cookie hết hạn mới cắt
// được quyền — đúng thứ không được phép xảy ra với một tính năng phát vé tay.

import { SignJWT, jwtVerify } from 'jose'
import type { EntCodeRole } from '@prisma/client'
import { prisma } from '@/lib/db'
import { apiError } from '@/lib/review/errors'

/** Khớp cả NextRequest.cookies lẫn cookies() của next/headers. */
export interface CookieReader {
    get(name: string): { value: string } | undefined
}

export const ENT_COOKIE = 'ent_access'
export const ENT_COOKIE_TTL_SEC = 30 * 24 * 60 * 60 // 30 ngày

export interface EntSession {
    codeId: string
    role: EntCodeRole
}

function cookieSecret(): Uint8Array {
    // Dùng chung secret với cookie khách của module review — cùng máy, cùng vòng đời,
    // thêm một biến môi trường nữa chỉ tăng chỗ để quên khi deploy.
    const raw = process.env.REVIEW_COOKIE_SECRET
    if (!raw || raw.length < 16) {
        throw new Error('[ent/auth] REVIEW_COOKIE_SECRET thiếu hoặc quá ngắn (cần 32+ byte ngẫu nhiên)')
    }
    return new TextEncoder().encode(raw)
}

export async function signEntCookie(codeId: string): Promise<string> {
    return new SignJWT({ cid: codeId })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${ENT_COOKIE_TTL_SEC}s`)
        .sign(cookieSecret())
}

/** Trả codeId nếu cookie hợp lệ và chưa hết hạn; null nếu không (không throw). */
export async function readEntCookie(cookies: CookieReader): Promise<string | null> {
    const raw = cookies.get(ENT_COOKIE)?.value
    if (!raw) return null
    try {
        const { payload } = await jwtVerify(raw, cookieSecret())
        const cid = payload.cid
        return typeof cid === 'string' && cid.length > 0 ? cid : null
    } catch {
        return null // hết hạn / chữ ký sai / secret đổi — coi như chưa nhập code
    }
}

/**
 * Phân giải phiên kho phim mà KHÔNG ném lỗi — dùng cho trang RSC để chọn giữa
 * màn nhập code và giao diện kho.
 */
export async function resolveEntSession(cookies: CookieReader): Promise<EntSession | null> {
    const codeId = await readEntCookie(cookies)
    if (!codeId) return null
    const code = await prisma.entAccessCode.findUnique({
        where: { id: codeId },
        select: { id: true, role: true, revokedAt: true },
    })
    // Code bị thu hồi (hoặc bị xoá) ⇒ cookie thành giấy lộn ngay request kế tiếp.
    if (!code || code.revokedAt) return null
    return { codeId: code.id, role: code.role }
}

/**
 * Bản NÉM LỖI cho route API. `opts.role` yêu cầu đúng vai trò — hiện chỉ dùng
 * 'ENT_ADMIN' cho mọi thao tác ghi (up/sửa/gỡ/phụ đề).
 *
 * Lưu ý: hàm này KHÔNG kiểm tra phiên đăng nhập — route nào cũng phải tự gọi
 * `getSession()` trước. Tách ra vì hai lớp trả về hai loại lỗi khác nhau
 * (chưa đăng nhập ⇒ về /login; chưa có code ⇒ về màn nhập code).
 */
export async function requireEntSession(
    cookies: CookieReader,
    opts: { role?: EntCodeRole } = {},
): Promise<EntSession> {
    const session = await resolveEntSession(cookies)
    if (!session) {
        throw apiError(401, 'UNAUTHORIZED', 'Cần nhập mã truy cập kho phim.')
    }
    if (opts.role && session.role !== opts.role) {
        throw apiError(403, 'FORBIDDEN', 'Mã của bạn chỉ được xem, không được thay đổi kho phim.')
    }
    return session
}

/** Thuộc tính chuẩn cho cookie kho phim. Path '/' vì API nằm ở /api/ent/*. */
export function entCookieAttrs(maxAgeSec: number) {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
        maxAge: maxAgeSec,
    }
}
