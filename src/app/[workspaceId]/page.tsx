import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'

// UUID v4 / v7 / cuid pattern — workspace IDs from Prisma uuid() helper.
// Prevents static-asset paths like /icon.png from being matched as a workspaceId
// route (manifest.json scan + 404 fallthrough → infinite redirect chain bug).
const WORKSPACE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function WorkspaceRootRedirect({
    params
}: {
    params: Promise<{ workspaceId: string }>
}) {
    const { workspaceId } = await params

    // Defensive: reject non-UUID workspaceIds (e.g. /icon.png matched here)
    if (!WORKSPACE_ID_PATTERN.test(workspaceId)) {
        notFound()
    }

    const session = await getSession()
    if (!session?.user?.id) {
        redirect('/login')
    }

    // Redirect to dashboard by default
    redirect(`/${workspaceId}/dashboard`)
}
