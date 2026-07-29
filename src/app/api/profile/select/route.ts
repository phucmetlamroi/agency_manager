import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession, decrypt } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { profileId, sessionToken } = body;

        if (!profileId) {
            return NextResponse.json({ success: false, error: 'Missing profileId' }, { status: 400 });
        }

        // [AUDIT HT-018 fix] ĐÃ GỠ đường "nhận chuỗi JWT từ BODY rồi decrypt" (workaround cache
        // của Vercel). Nó là cỗ máy giặt token: route này KÝ LẠI một JWT mới từ claim cũ rồi
        // Set-Cookie (xem cuối hàm), nên ai cầm được chuỗi token — không cần cắm cookie, chỉ cần
        // dán vào body — là biến một token ĐÃ BỊ THU HỒI thành phiên hợp lệ hoàn toàn mới.
        // Nói cách khác: chừng nào đường này còn, "đăng xuất" không thu hồi được gì cả, và bản
        // vá HT-018 chỉ là hình thức. Cookie là nơi duy nhất hợp lệ để lấy phiên.
        void sessionToken; // giữ tên biến để body cũ không vỡ, nhưng KHÔNG dùng
        const session = await getSession();

        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized Session' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id }
        });

        if (!user) {
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        }

        // [AUDIT HT-018 fix] Route này ký lại cookie phiên, tức nó GIA HẠN quyền truy cập — nên
        // phải kiểm phiên còn sống, đúng như mọi cổng khác. Trước đây nó đọc cả hàng User mà
        // không hề nhìn `sessionVersion` lẫn `role === 'LOCKED'`: một tài khoản vừa bị khoá, hoặc
        // một token vừa bị thu hồi, vẫn đổi được profile và nhận cookie mới.
        if (user.role === 'LOCKED') {
            return NextResponse.json({ success: false, error: 'Unauthorized Session' }, { status: 401 });
        }
        if (((session.user as any)?.sessionVersion ?? 0) < (user.sessionVersion ?? 0)) {
            return NextResponse.json({ success: false, error: 'Unauthorized Session' }, { status: 401 });
        }

        let hasAccess = false;
        // [AUDIT R1 — CRITICAL fix] Removed the legacy global `role === 'ADMIN'`
        // super-admin bypass (Sprint Z removed the super-admin model). Access now
        // requires the profile to be the user's own OR an explicit ProfileAccess row
        // (the cross-team check below).
        if ((user as any).profileId === profileId) {
            hasAccess = true;
        }

        if (!hasAccess) {
            // Check cross-team 'Du học' access
            const crossTeamAccess = await prisma.profileAccess.findUnique({
                where: { userId_profileId: { userId: user.id, profileId } }
            });
            if (crossTeamAccess) {
                hasAccess = true;
            }
        }

        if (!hasAccess) {
            return NextResponse.json({ success: false, error: 'Bạn không có quyền truy cập vào Team này.' }, { status: 403 });
        }

        const role = session.user.role || 'USER';

        // --- VERCEL FIX 4: SESSION-BASED PROFILE ID ---
        // Instead of a separate cookie that gets lost in the race condition,
        // we embed the verified profileId directly into a fresh Session JWT.
        const newPayload = {
            ...session,
            user: {
                ...session.user,
                sessionProfileId: profileId 
            }
        };

        // Preserve expiration from original session if it exists, else 7 days
        const expires = session.expires ? new Date(session.expires) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        newPayload.expires = expires;

        // Re-sign the JWT
        const { encrypt } = await import('@/lib/auth');
        const newSessionToken = await encrypt(newPayload);

        // Explicitly create response 
        const response = NextResponse.json({ success: true, role });
        
        // Write the new 'session' cookie, completely overriding the old one
        const isProd = process.env.NODE_ENV === 'production';
        const sessionCookieString = `session=${newSessionToken}; Path=/; HttpOnly; SameSite=Lax${isProd ? '; Secure' : ''}; Expires=${expires.toUTCString()}`;
        response.headers.append('Set-Cookie', sessionCookieString);
        
        // We still attempt to set current_profile_id just for backward compatibility during transition,
        // but it is no longer the source of truth.
        const profileCookieString = `current_profile_id=${profileId}; Path=/; HttpOnly; SameSite=Lax${isProd ? '; Secure' : ''}`;
        response.headers.append('Set-Cookie', profileCookieString);
        
        console.log('[API/Select] Successfully re-signed session with profileId and returning 200.', { profileId, role });

        return response;
    } catch (e: any) {
        console.error('[API/Select] Fatal Error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
