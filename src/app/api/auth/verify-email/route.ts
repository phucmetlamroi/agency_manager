/**
 * GET/POST /api/auth/verify-email?token=...
 *
 * Verify email token và set User.emailVerified = true.
 * Redirect → /login với toast (GET) hoặc trả JSON (POST).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hashToken } from '@/lib/otp'

const PURPOSE = 'EMAIL_VERIFICATION'

async function verifyToken(rawToken: string): Promise<{ ok: boolean; message: string }> {
    if (!rawToken || typeof rawToken !== 'string' || rawToken.length < 10) {
        return { ok: false, message: 'Liên kết xác thực không hợp lệ.' }
    }

    const tokenHash = hashToken(rawToken)

    // Atomic mark-as-used với optimistic lock
    try {
        const result = await prisma.$transaction(async (tx) => {
            const tokenRecord = await tx.emailVerificationToken.findFirst({
                where: {
                    tokenHash,
                    purpose: PURPOSE,
                    usedAt: null,
                    expiresAt: { gt: new Date() },
                },
                select: { id: true, userId: true, email: true },
            })

            if (!tokenRecord) {
                return { ok: false, message: 'Liên kết xác thực không hợp lệ hoặc đã hết hạn.' }
            }

            const updated = await tx.emailVerificationToken.updateMany({
                where: {
                    id: tokenRecord.id,
                    usedAt: null,
                },
                data: { usedAt: new Date() },
            })

            if (updated.count === 0) {
                return { ok: false, message: 'Liên kết xác thực đã được sử dụng.' }
            }

            await tx.user.update({
                where: { id: tokenRecord.userId },
                data: {
                    emailVerified: true,
                    emailVerifiedAt: new Date(),
                },
            })

            // Audit log
            await tx.auditLog.create({
                data: {
                    workspaceId: null,
                    actorUserId: tokenRecord.userId,
                    userId: tokenRecord.userId,
                    action: 'auth.email_verified',
                    targetType: 'User',
                    targetId: tokenRecord.userId,
                },
            })

            return { ok: true, message: 'Email đã được xác thực thành công.' }
        })
        return result
    } catch (err) {
        console.error('[/api/auth/verify-email] error:', err)
        return { ok: false, message: 'Đã xảy ra lỗi. Vui lòng thử lại.' }
    }
}

export async function GET(req: NextRequest) {
    const token = req.nextUrl.searchParams.get('token') ?? ''
    const result = await verifyToken(token)
    // L2 fix: dùng req.nextUrl.origin (same-origin) thay vì env (có thể misconfigured)
    // → loại bỏ open redirect risk nếu NEXT_PUBLIC_APP_URL bị set sai.
    const appUrl = req.nextUrl.origin
    const status = result.ok ? 'success' : 'error'
    const msg = encodeURIComponent(result.message)
    return NextResponse.redirect(`${appUrl}/login?verifyEmail=${status}&msg=${msg}`)
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}))
        const token = typeof body.token === 'string' ? body.token : ''
        const result = await verifyToken(token)
        return NextResponse.json(
            { success: result.ok, message: result.message },
            { status: result.ok ? 200 : 400 }
        )
    } catch (err) {
        console.error('[/api/auth/verify-email POST] error:', err)
        return NextResponse.json(
            { success: false, message: 'Đã xảy ra lỗi.' },
            { status: 500 }
        )
    }
}
