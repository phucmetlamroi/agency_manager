import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'

export default async function WorkspaceRootRedirect({
    params
}: {
    params: Promise<{ workspaceId: string }>
}) {
    const session = await getSession()
    if (!session?.user?.id) {
        redirect('/login')
    }

    const { workspaceId } = await params

    // Redirect to dashboard by default
    redirect(`/${workspaceId}/dashboard`)
}
