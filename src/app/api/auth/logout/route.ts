import { getSession, logout } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { headers } from 'next/headers'

/**
 * GET /api/auth/logout
 *
 * Audit fix #3.8: Logout không log → không trace được "ai logout khi nào".
 * Bug bảo mật nhỏ — nếu account bị compromise, không có dấu vết logout.
 *
 * Sau: log audit event 'auth.logout' với SYSTEM workspaceId trước khi clear cookie.
 */
export async function GET() {
    // Capture session info BEFORE clearing cookie (logout xoá session)
    try {
        const session = await getSession()
        const userId = session?.user?.id
        if (userId) {
            let ip: string | null = null
            let ua: string | null = null
            try {
                const h = await headers()
                ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null
                ua = h.get('user-agent')
            } catch { /* edge */ }

            await prisma.auditLog.create({
                data: {
                    workspaceId: 'SYSTEM',
                    actorUserId: userId,
                    userId: userId,
                    action: 'auth.logout',
                    targetType: 'User',
                    targetId: userId,
                    ipAddress: ip,
                    userAgent: ua,
                },
            }).catch(() => { /* non-blocking */ })
        }
    } catch {
        // Non-blocking — logout vẫn phải work even if audit fails
    }

    await logout()
    redirect('/login')
}
