import { headers } from 'next/headers'

export async function isMobileDevice(): Promise<boolean> {
    const headersList = await headers()
    const userAgent = headersList.get('user-agent') || ''

    // Basic mobile check using Regex
    const isMobile = Boolean(userAgent.match(
        /Android|BlackBerry|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i
    ))

    return isMobile
}
