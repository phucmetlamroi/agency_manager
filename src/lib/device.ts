import { headers, cookies } from 'next/headers'

export async function isMobileDevice(): Promise<boolean> {
    const headersList = await headers()
    const cookieStore = await cookies()

    // 1. Check Cookie Preference Override
    const viewMode = cookieStore.get('view-mode')?.value
    if (viewMode === 'mobile') return true
    if (viewMode === 'desktop') return false

    // 2. Fallback to User-Agent
    const userAgent = headersList.get('user-agent') || ''

    const isMobile = Boolean(userAgent.match(
        /Android|BlackBerry|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i
    ))

    return isMobile
}
