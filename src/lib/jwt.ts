import { env } from './env'
import { SignJWT, jwtVerify } from 'jose'

const key = new TextEncoder().encode(env.JWT_SECRET)

// [QĐ-13] Session TTL = 30 ngày. Nguồn chung cho login (auth.ts) + rolling refresh
// (middleware.ts). Cookie server-set httpOnly KHÔNG bị Safari ITP cap 7 ngày.
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 2_592_000s

/**
 * Sign a JWT with HS256.
 *
 * @param payload Object to sign (typically `{ user, expires }`).
 * @param ttl Optional TTL string (e.g. "1 week", "30 days"). Default: "1 week".
 */
export async function encrypt(payload: any, ttl: string = '1 week') {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(ttl)
        .sign(key)
}

export async function decrypt(input: string): Promise<any> {
    const { payload } = await jwtVerify(input, key, {
        algorithms: ['HS256'],
    })
    return payload
}
