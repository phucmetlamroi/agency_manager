import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/auth'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
    try {
        const cookieStore = await cookies()
        const sessionCookie = cookieStore.get('session')

        if (!sessionCookie) {
            return NextResponse.json({ role: null }, { status: 401 })
        }

        const session = await decrypt(sessionCookie.value)
        if (!session?.user?.id) {
            return NextResponse.json({ role: null }, { status: 401 })
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { role: true }
        })

        if (!user) {
            return NextResponse.json({ role: null }, { status: 404 })
        }

        return NextResponse.json({ role: user.role })
    } catch (e) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
