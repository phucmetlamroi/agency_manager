'use server'

import { prisma } from '@/lib/db'
import { getSession, login } from '@/lib/auth'
import { redirect } from 'next/navigation'

export async function acceptTermsAction() {
    const session = await getSession()
    if (!session || !session.user) {
        throw new Error('Unauthorized')
    }

    const userId = session.user.id

    // Update the database
    await prisma.user.update({
        where: { id: userId },
        data: { 
            hasAcceptedTerms: true,
            termsAcceptedAt: new Date()
        }
    })

    // Resign the JWT token with the new payload
    await login({
        ...session.user,
        hasAcceptedTerms: true
    })

    // Return success instead of redirecting directly to avoid catching redirect as error on client
    return { success: true }
}
