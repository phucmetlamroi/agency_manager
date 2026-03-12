'use server'

import { prisma } from '@/lib/db'
import { login, logout } from '@/lib/auth'
import { compare } from 'bcryptjs'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { UserRole } from '@prisma/client'

export async function loginAction(prevState: any, formData: FormData) {
    const username = formData.get('username') as string
    const password = formData.get('password') as string

    if (!username || !password) {
        return { error: 'Please enter all required information' }
    }

    console.log(`[Login] Attempt for user: ${username}`)

    let role: string = 'USER'

    try {
        const user = await prisma.user.findUnique({
            where: { username },
        })

        if (!user) {
            console.log(`[Login] User not found: ${username}`)
            return { error: 'Account does not exist' }
        }

        const isValid = await compare(password, user.password)

        if (!isValid) {
            console.log(`[Login] Invalid password for: ${username}`)
            return { error: 'Incorrect password' }
        }

        role = user.role
        console.log(`[Login] Success for: ${username}, role: ${role}`)
        // Login success
        await login({ id: user.id, username: user.username, role: user.role, hasAcceptedTerms: user.hasAcceptedTerms })
        console.log(`[Login] Cookie set for: ${username}`)

    } catch (err) {
        if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err
        console.error('[Login] ERROR:', err)
        return { error: 'Something went wrong. Please try again later.' }
    }

    console.log(`[Login] Redirecting ${username} based on role: ${role}`)

    if (role === 'CLIENT') {
        const cookieStore = await cookies()
        cookieStore.set('NEXT_LOCALE', 'en', { path: '/' })
        redirect('/portal/en')
    }

    // Redirect staff/admins to the Workspace Portal
    redirect('/workspace')
}

export async function logoutAction() {
    await logout()
    redirect('/login')
}
