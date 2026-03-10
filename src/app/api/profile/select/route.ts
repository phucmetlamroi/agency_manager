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
            return NextResponse.json({ success: false, error: 'Bạn không có quyền truy cập vào Team này.' }, { status: 403 });
        }

        // We still call cookies().set for Vercel Serverless consistency
        const cookieStore = await cookies();
        cookieStore.set('current_profile_id', profileId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/'
        });

        const role = session.user.role || 'USER';

        // Explicitly create response and inject Set-Cookie header to prevent Vercel dropping it
        const response = NextResponse.json({ success: true, role });
        
        // Construct Set-Cookie string manually to bulletproof it
        const isProd = process.env.NODE_ENV === 'production';
        const cookieString = `current_profile_id=${profileId}; Path=/; HttpOnly; SameSite=Lax${isProd ? '; Secure' : ''}`;
        response.headers.append('Set-Cookie', cookieString);
        
        console.log('[API/Select] Successfully set profile_id cookie and returning 200.', { profileId, role });

        return response;
    } catch (e: any) {
        console.error('[API/Select] Fatal Error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
