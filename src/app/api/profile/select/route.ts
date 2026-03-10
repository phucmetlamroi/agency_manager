import { NextResponse } from 'next/server';
import { checkProfileAccess } from '@/actions/profile-actions';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { profileId } = body;

        if (!profileId) {
            return NextResponse.json({ success: false, error: 'Missing profileId' }, { status: 400 });
        }

        const access = await checkProfileAccess(profileId);
        if (!access.success) {
            return NextResponse.json(access, { status: 403 });
        }

        const cookieStore = await cookies();
        cookieStore.set('current_profile_id', profileId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/'
        });

        const session = await getSession();
        const role = session?.user?.role || 'USER';

        return NextResponse.json({ success: true, role });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
