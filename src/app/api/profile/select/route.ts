import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession, decrypt } from '@/lib/auth';
import { SESSION_ABSOLUTE_MAX_AGE } from '@/lib/jwt';
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

        // [PHẢN BIỆN 2026-07-30 · R4-1 + R4-2] TRẦN TUYỆT ĐỐI CỦA PHIÊN — CƯỠNG CHẾ Ở ĐÂY NỮA.
        //
        // Mục N8 (commit b62ed3d) đặt trần 90 ngày trong `middleware.ts`. Nhưng middleware KHÔNG
        // BAO GIỜ chạy trên route này: `config.matcher` loại `/api` ở tầng cấu hình, và thân hàm
        // còn `return next()` sớm cho `/api` một lần nữa. Route này thì KÝ LẠI một JWT hoàn toàn
        // mới (bên dưới) — nên nó là cỗ máy gia hạn vô hạn nằm ngoài tầm với của trần đó:
        //   curl -X POST /api/profile/select -H 'Cookie: session=<JWT đánh cắp>' -d '{"profileId":…}'
        // JWT là JWS KÝ chứ không mã hoá, nên `profileId` đọc thẳng từ payload bằng base64. Lặp
        // mỗi ≤7 ngày ⇒ mốc 90 ngày không bao giờ chạm tới. Hai chốt LOCKED/sessionVersion ở trên
        // chỉ cứu được khi NẠN NHÂN đã chủ động thu hồi — mà kịch bản của N8 là nạn nhân không biết.
        //
        // Đồng thời sửa lỗi thứ hai của cùng bản vá (R4-2): trần phải KẸP HẠN của token cấp ra,
        // không chỉ là điều kiện vào. `encrypt(payload)` không tham số ⇒ ttl mặc định '1 week'
        // (lib/jwt.ts), tức mỗi lần đổi profile lại đẩy hạn ra thêm một tuần bất kể ngân sách
        // tuyệt đối còn bao nhiêu.
        //
        // ⚠️ TOKEN CŨ KHÔNG CÓ `authAt` (mọi phiên đang đăng nhập tại thời điểm triển khai) —
        // CỐ Ý KHÔNG 401 chúng. Trả 401 ở đây sẽ làm HỎNG NGAY việc đổi profile của toàn bộ người
        // dùng hiện tại cho tới khi họ đăng nhập lại, tức bản vá tệ hơn lỗi. Thay vào đó: không gia
        // hạn — token mới giữ đúng hạn của token cũ, nên phiên legacy tự rụng trong ≤30 ngày. Đây
        // là hành vi MONG MUỐN, cùng lựa chọn đã ghi trong middleware.
        const nowMs = Date.now();
        const requestedMs = session.expires
            ? new Date(session.expires).getTime()
            : nowMs + 7 * 24 * 60 * 60 * 1000;
        const tokenExpMs = typeof (session as any).exp === 'number' ? (session as any).exp * 1000 : 0;
        const authAt = Number((session.user as any)?.authAt ?? 0);
        const capMs = authAt > 0
            ? authAt + SESSION_ABSOLUTE_MAX_AGE * 1000
            : (tokenExpMs || requestedMs);

        const expiresMs = Math.min(requestedMs, capMs);
        if (expiresMs <= nowMs) {
            return NextResponse.json({ success: false, error: 'Unauthorized Session' }, { status: 401 });
        }
        const expires = new Date(expiresMs);
        newPayload.expires = expires;

        // Re-sign the JWT — ttl kẹp theo trần tuyệt đối, KHÔNG dùng mặc định '1 week'.
        const { encrypt } = await import('@/lib/auth');
        const newSessionToken = await encrypt(newPayload, `${Math.floor((expiresMs - nowMs) / 1000)}s`);

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
