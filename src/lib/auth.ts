import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const key = new TextEncoder().encode(process.env.JWT_SECRET || 'default_secret_key_change_me')

export async function encrypt(payload: any) {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1 week')
        .sign(key)
}

export async function decrypt(input: string): Promise<any> {
    const { payload } = await jwtVerify(input, key, {
        algorithms: ['HS256'],
    })
    return payload
}

export async function login(userData: any) {
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const session = await encrypt({ user: userData, expires })

    const cookieStore = await cookies()
    cookieStore.set('session', session, {
        expires,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
    })
}

export async function logout() {
    const cookieStore = await cookies()
    cookieStore.set('session', '', { expires: new Date(0) })
}

export async function getSession() {
    const cookieStore = await cookies()
    const session = cookieStore.get('session')?.value
    if (!session) return null
    try {
        return await decrypt(session)
    } catch (e) {
        return null
    }
}
