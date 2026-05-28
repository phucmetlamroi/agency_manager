import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'

// [Workspace ID] Permissive regex — allows UUID + legacy slug IDs (vd:
// 'legacy-feb-2026', 'legacy-mar-2026' của Hustly Team được migrate từ legacy
// data). Vẫn reject file paths có dấu chấm như '/icon.png' từ PWA scan
// (prevents infinite redirect chain bug).
const WORKSPACE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

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
