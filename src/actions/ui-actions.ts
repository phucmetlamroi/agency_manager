'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

export async function toggleMobileView(forceMobile: boolean) {
    const cookieStore = await cookies()
    // Store preference for 1 year
    cookieStore.set('view-mode', forceMobile ? 'mobile' : 'desktop', {
        maxAge: 365 * 24 * 60 * 60,
        path: '/'
    })
    revalidatePath('/', 'layout')
}
