import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic' // No caching

export async function GET() {
    return NextResponse.json({
        time: Date.now()
    })
}
