/**
 * POST /api/auth/signup
 *
 * Body: { email, password, displayName, acceptTos, turnstileToken, honeypot? }
 * Response 200 (always — anti-enumeration): { success: true, message: '...' }
 * Response 400 (validation): { success: false, errors: { ... } }
 * Response 429 (rate-limited): { success: false, message, retryAfter }
 */

import { NextRequest, NextResponse } from 'next/server'
import { signupAction, type SignupInput } from '@/actions/signup-actions'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}))

        const input: SignupInput = {
            email: typeof body.email === 'string' ? body.email : '',
            password: typeof body.password === 'string' ? body.password : '',
            displayName: typeof body.displayName === 'string' ? body.displayName : '',
            acceptTos: !!body.acceptTos,
            turnstileToken: typeof body.turnstileToken === 'string' ? body.turnstileToken : '',
            honeypot: typeof body.honeypot === 'string' ? body.honeypot : '',
        }

        const result = await signupAction(input)

        if (!result.success && result.retryAfter) {
            return NextResponse.json(result, {
                status: 429,
                headers: { 'Retry-After': String(result.retryAfter) },
            })
        }

        return NextResponse.json(result, {
            status: result.success ? 200 : 400,
        })
    } catch (err) {
        console.error('[/api/auth/signup] error:', err)
        return NextResponse.json(
            { success: false, message: 'Đã xảy ra lỗi. Vui lòng thử lại.' },
            { status: 500 }
        )
    }
}
