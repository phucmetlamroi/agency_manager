import { redirect } from 'next/navigation'

/* Legacy deep-link → the single-page portal (Deliverables surface). */
export default async function TaskDetailRedirect({ params }: { params: Promise<{ locale: string; workspaceId: string; id: string }> }) {
    const { locale, workspaceId } = await params
    redirect(`/portal/${locale}/${workspaceId}?s=deliverables`)
}
