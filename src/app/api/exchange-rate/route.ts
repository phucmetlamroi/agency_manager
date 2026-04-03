import { NextResponse } from 'next/server'
import { getExchangeRate } from '@/lib/exchange-rate'

export async function GET() {
    try {
        const rate = await getExchangeRate()
        return NextResponse.json({ rate, timestamp: Date.now() })
    } catch (error) {
        return NextResponse.json({ rate: 26300, timestamp: Date.now(), fallback: true })
    }
}
