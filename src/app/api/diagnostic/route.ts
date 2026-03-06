import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
    try {
        const start = Date.now()
        const count = await prisma.user.count()
        const duration = Date.now() - start
        return NextResponse.json({
            status: 'Connected',
            userCount: count,
            responseTimeMs: duration
        })
    } catch (e: any) {
        return NextResponse.json({
            status: 'Error',
            message: e.message
        }, { status: 500 })
    }
}
