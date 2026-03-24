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

        let session = await getSession();
        
        // Vercel Edge Cache Workaround: If cookies() fails but we have the token in the body, manually decrypt it.
        if (!session?.user && sessionToken) {
            try {
                session = await decrypt(sessionToken);
            } catch (e) {
                console.error("Failed to decrypt manual session token:", e);
            }
        }

        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized Session' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id }
        });

        if (!user) {
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        }

        let hasAccess = false;
        if (user.role === 'ADMIN' || (user as any).profileId === profileId) {
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
