/**
 * JWT-signed unsubscribe tokens for one-click email opt-out
 * (CAN-SPAM / Gmail bulk-sender compliance).
 *
 * Token payload: { userId, type? }
 * - omit `type` → unsubscribe from ALL email notifications
 * - include `type` → reserved for future per-type unsubscribe (v1: master toggle only)
 */

import { SignJWT, jwtVerify } from 'jose'
import { env } from '@/lib/env'

const key = new TextEncoder().encode(env.JWT_SECRET)

interface UnsubscribePayload {
    userId: string
    type?: string
    purpose: 'unsubscribe'
}

export async function signUnsubscribeToken(
    userId: string,
    type?: string,
): Promise<string> {
    return await new SignJWT({ userId, type, purpose: 'unsubscribe' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('90 days')
        .sign(key)
}

export async function verifyUnsubscribeToken(
    token: string,
): Promise<UnsubscribePayload | null> {
    try {
        const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] })
        if (payload.purpose !== 'unsubscribe') return null
        if (typeof payload.userId !== 'string') return null
        return {
            userId: payload.userId,
            type: typeof payload.type === 'string' ? payload.type : undefined,
            purpose: 'unsubscribe',
        }
    } catch {
        return null
    }
}

export async function buildUnsubscribeUrl(
    userId: string,
    type: string | undefined,
    appUrl: string,
): Promise<string> {
    const token = await signUnsubscribeToken(userId, type)
    return `${appUrl}/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`
}
