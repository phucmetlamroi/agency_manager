'use server'

import { prisma } from '@/lib/db'
import { cookies, headers } from 'next/headers'
import { getRequestIpOrNull } from '@/lib/request-ip'
import { getSession } from '@/lib/auth'

// Type definition for micro-events
export type TrackingEventPayload = {
    eventType: string
    featureName: string
    metadata?: Record<string, any>
}

// In-memory buffer for Batching (NOTE: In a true multi-instance serverless setup like Vercel, 
// this buffer resets per cold start. We'll use a timeout to flush before the lambda dies, 
// but for standard self-hosted/long-lived processes this is highly optimal).
let eventBuffer: Array<{
    sessionId: string;
    userId: string | null;
    eventType: string;
    featureName: string;
    metadata: any;
    createdAt: Date;
}> = []

const FLUSH_THRESHOLD = 5 
let flushTimeout: NodeJS.Timeout | null = null

export async function forceFlush() {
    await flushEvents()
}

async function flushEvents() {
    if (eventBuffer.length === 0) return

    // Clone and clear the buffer quickly to prevent race conditions
    const eventsToInsert = [...eventBuffer]
    eventBuffer = []
    
    if (flushTimeout) {
        clearTimeout(flushTimeout)
        flushTimeout = null
    }

    try {
        await prisma.event.createMany({
            data: eventsToInsert
        })
        console.log(`[Tracking] Flushed ${eventsToInsert.length} events to database.`)
    } catch (error) {
        console.error('[Tracking] Failed to flush events:', error)
    }
}

/*
 * [AUDIT SWEEP-2026-07-30] `trackEvent` ĐÃ ĐƯỢC XOÁ (quyết định của chủ dự án: gỡ mã chết).
 *
 * Nó là server action KHÔNG có cổng xác thực nào, và là NƠI GHI DUY NHẤT vào `eventBuffer` — một
 * biến cấp module dùng chung cho cả tiến trình. Không một component nào trong repo gọi nó, nên phễu
 * đo lường này về mặt cơ chế CHƯA TỪNG hoạt động; nhưng nếu có ai cắm lại thì nó vừa nhận dữ liệu
 * tuỳ ý từ người chưa đăng nhập, vừa có thể làm `createMany` của cả lô ném lỗi và mất luôn sự kiện
 * của người dùng thật trong cùng instance.
 *
 * ⚠️ BỘ ĐỆM BÊN TRÊN ĐƯỢC GIỮ LẠI CÓ CHỦ ĐÍCH, đừng dọn theo:
 * `forceFlush` vẫn có nơi gọi THẬT — `components/admin/analytics/EventLogTable.tsx:63` bấm nút là
 * flush rồi đọc lại log. (Phản biện của đợt quét kết luận "cả đường ghi Event là mã chết" — đúng nửa
 * đầu: không còn NƠI GHI, nhưng đường FLUSH thì vẫn nối vào giao diện đang chạy.)
 * Hệ quả hôm nay: `eventBuffer` luôn rỗng nên `forceFlush` là no-op. Bảng `Event` không nhận thêm
 * hàng nào — vốn đã như vậy từ trước, việc xoá này không đổi hành vi.
 * Muốn bật lại đo lường thì phải viết đường ghi MỚI có cổng phiên + rate-limit theo IP (limitDb),
 * chứ đừng phục hồi hàm cũ.
 */

/**
 * Pings the application with presence data (Heartbeat)
 */
export async function pingHeartbeat(status: 'ONLINE' | 'AWAY' | 'BUSY' | 'OFFLINE' = 'ONLINE', _currentUserId?: string) {
    try {
        // [AUDIT R1 — HIGH fix #16] The user id was taken from the CLIENT-supplied
        // `currentUserId` with no auth → anyone could forge presence/session rows for
        // any user. Always derive the user id from the authenticated session and
        // ignore the (now legacy) client-supplied argument.
        const session = await getSession()
        const currentUserId = session?.user?.id
        if (!currentUserId) return { success: false, reason: 'Unauthenticated' }
        // [AUDIT HT-033 fix] getSession() không đọc DB, nên nhịp tim của một tài khoản ĐÃ BỊ KHOÁ
        // vẫn ghi được UserPresence + Session. Hệ quả không chỉ là một dòng thừa: bảng hiện diện
        // là thứ admin nhìn để biết ai đang online, nên người vừa bị khoá vẫn hiện "đang hoạt
        // động" — vừa sai sự thật, vừa che mất chính việc lệnh khoá đã có hiệu lực hay chưa.
        const { isSessionLive } = await import('@/lib/profile-permissions')
        if (!(await isSessionLive(session))) return { success: false, reason: 'Unauthenticated' }

        await prisma.userPresence.upsert({
            where: { userId: currentUserId },
            update: {
                status,
                lastHeartbeat: new Date()
            },
            create: {
                userId: currentUserId,
                status,
                lastHeartbeat: new Date()
            }
        })

        // NOTE: Prisma Pulse will catch this Mutation and broadcast it if setup.
        
        // Also update Session info if we have a session cookie
        const cookieStore = await cookies()
        const trackingId = cookieStore.get('tracking_session_id')?.value
        if (trackingId) {
            const h = await headers()
            // [AUDIT HT-002 fix] `x-client-ip` không phải header của nền tảng nào — không ai đặt
            // và không ai ghi đè nó, nên nó hoàn toàn do người gọi tự khai. Giá trị đó chảy thẳng
            // vào Session.ipAddress, tức bảng dùng để truy vết lại về sau.
            const ip = (await getRequestIpOrNull()) ?? 'Unknown'
            const country = h.get('x-client-country') || 'Unknown'
            const city = h.get('x-client-city') || 'Unknown'

            // Upsert session (track duration)
            await prisma.session.upsert({
                where: { id: trackingId },
                update: {
                    endTime: new Date(),
                    // Optional: could calculate durationSec here but better done dynamically or in cron
                },
                create: {
                    id: trackingId,
                    userId: currentUserId,
                    ipAddress: ip,
                    countryCode: country,
                    city: city,
                    startTime: new Date()
                }
            })
        }

        return { success: true }
    } catch (error) {
        console.error('[Heartbeat Error]', error)
        return { success: false }
    }
}

/**
 * Get daily session counts for the line chart (last 24 hours/7 days)
 */
// [AUDIT HT-034 fix] Shared guard for the internal-analytics actions below. A CLIENT account
// (ProfileAccess.role='CLIENT', or a legacy User.role='CLIENT') can hold a valid sessionProfileId
// for its agency's profile, so gating only on sessionProfileId let it read staff presence/roles/
// activity logs/session trends. Returns true when the caller is a CLIENT (→ caller returns empty).
async function callerIsClient(userId: string | undefined, profileId: string): Promise<boolean> {
    if (!userId) return true
    const [user, pa] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
        prisma.profileAccess.findUnique({ where: { userId_profileId: { userId, profileId } }, select: { role: true } }),
    ])
    return user?.role === 'CLIENT' || pa?.role === 'CLIENT'
}

export async function getSessionTrends() {
    try {
        const authSession = await getSession();
        const profileId = (authSession?.user as any)?.sessionProfileId;
        // [Sprint Z] Super admin bypass removed. Reject if no profile context.
        if (!profileId) return [];
        // [AUDIT HT-034 fix] Block CLIENT accounts — these analytics expose internal staff data.
        if (await callerIsClient((authSession?.user as any)?.id, profileId)) return [];

        const now = new Date()
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

        // Raw query or group by hour
        // Note: Prisma doesn't have a built-in "groupBy hour" that works across all DBs easily 
        // without raw SQL or a lot of post-processing.
        const sessions = await prisma.session.findMany({
            where: {
                startTime: { gte: twentyFourHoursAgo },
                ...(profileId ? { workspace: { profileId } } : {})
            },
            select: {
                startTime: true
            },
            orderBy: {
                startTime: 'asc'
            }
        })

        // Group by hour
        const hourlyData: Record<string, number> = {}
        for (let i = 0; i < 24; i++) {
            const d = new Date(twentyFourHoursAgo.getTime() + i * 60 * 60 * 1000)
            const hourStr = `${d.getHours().toString().padStart(2, '0')}:00`
            hourlyData[hourStr] = 0
        }

        sessions.forEach((s: any) => {
            const hour = `${s.startTime.getHours().toString().padStart(2, '0')}:00`
            if (hourlyData[hour] !== undefined) hourlyData[hour]++
        })

        return Object.entries(hourlyData).map(([time, sessions]) => ({ time, sessions }))
    } catch (error) {
        console.error('[Tracking] Session trends fetch failed:', error)
        return []
    }
}

/**
 * Get recent event logs for the data table
 */
export async function getRecentEventLogs(limit = 20) {
    try {
        const authSession = await getSession();
        const profileId = (authSession?.user as any)?.sessionProfileId;
        // [Sprint Z] Super admin bypass removed. Reject if no profile context.
        if (!profileId) return [];
        // [AUDIT HT-034 fix] Block CLIENT accounts — these analytics expose internal staff data.
        if (await callerIsClient((authSession?.user as any)?.id, profileId)) return [];

        const logs = await prisma.event.findMany({
            take: limit,
            where: {
                ...(profileId ? { session: { workspace: { profileId } } } : {})
            },
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: {
                        username: true,
                        nickname: true,
                        avatarUrl: true
                    }
                }
            }
        })

        return logs.map((l: any) => ({
            id: l.id,
            time: l.createdAt.toLocaleTimeString('vi-VN'),
            user: l.user?.nickname || l.user?.username || 'Guest',
            avatarUrl: l.user?.avatarUrl,
            event: l.eventType,
            feature: l.featureName
        }))
    } catch (error) {
        console.error('[Tracking] Event logs fetch failed:', error)
        return []
    }
}

/**
 * Get friction heatmap data (Events group by hour/day)
 */
export async function getFrictionData() {
    try {
        const authSession = await getSession();
        const profileId = (authSession?.user as any)?.sessionProfileId;
        // [Sprint Z] Super admin bypass removed. Reject if no profile context.
        if (!profileId) return [];
        // [AUDIT HT-034 fix] Block CLIENT accounts — these analytics expose internal staff data.
        if (await callerIsClient((authSession?.user as any)?.id, profileId)) return [];

        const now = new Date()
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

        const events = await prisma.event.findMany({
            where: {
                createdAt: { gte: sevenDaysAgo },
                ...(profileId ? { session: { workspace: { profileId } } } : {})
            },
            select: {
                createdAt: true,
                eventType: true
            }
        })

        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        // Structure: [dayIndex][hourIndex] = count
        const matrix = Array.from({ length: 7 }, () => Array(24).fill(0))

        events.forEach((e: any) => {
            const day = e.createdAt.getDay()
            const hour = e.createdAt.getHours()
            
            // Weight certain events more if they indicate friction (e.g. REVISION, ERROR)
            let weight = 1
            if (e.eventType === 'REVISION') weight = 5
            if (e.eventType === 'ERROR') weight = 10
            
            matrix[day][hour] += weight
        })

        // Note: Client expects days starting with Monday in the UI mock, 
        // JavaScript getDay() starts with Sunday (0). We'll rotate or just handle in UI.
        return matrix
    } catch (error) {
        console.error('[Tracking] Friction data fetch failed:', error)
        return []
    }
}

/**
 * Get current live presence of all users
 */
export async function getLivePresence() {
    try {
        const authSession = await getSession();
        const profileId = (authSession?.user as any)?.sessionProfileId;
        // [Sprint Z] Super admin bypass removed. Reject if no profile context.
        if (!profileId) return [];
        // [AUDIT HT-034 fix] Block CLIENT accounts — these analytics expose internal staff data.
        if (await callerIsClient((authSession?.user as any)?.id, profileId)) return [];

        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

        const presence = await prisma.userPresence.findMany({
            where: {
                lastHeartbeat: { gte: fiveMinutesAgo },
                ...(profileId ? { user: { profileId } } : {})
            },
            include: {
                user: {
                    select: {
                        username: true,
                        nickname: true,
                        role: true,
                        avatarUrl: true
                    }
                }
            },
            orderBy: {
                lastHeartbeat: 'desc'
            }
        })

        return presence.map((p: any) => ({
            userId: p.userId,
            username: p.user?.nickname || p.user?.username || 'Unknown',
            avatarUrl: p.user?.avatarUrl,
            role: p.user?.role || 'USER',
            status: p.status, // ONLINE or AWAY
            lastSeen: p.lastHeartbeat.toLocaleTimeString('vi-VN')
        }))
    } catch (error) {
        console.error('[Tracking] Live presence fetch failed:', error)
        return []
    }
}
