import { redirect } from 'next/navigation'

/* Legacy route → the single-page portal (Deliverables surface). */
export default async function TasksRedirect({ params }: { params: Promise<{ locale: string; workspaceId: string }> }) {
    const { locale, workspaceId } = await params
    redirect(`/portal/${locale}/${workspaceId}?s=deliverables`)
}
