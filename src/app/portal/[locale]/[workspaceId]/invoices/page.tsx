import { redirect } from 'next/navigation'

/* Legacy route → the single-page portal (Invoices surface). */
export default async function InvoicesRedirect({ params }: { params: Promise<{ locale: string; workspaceId: string }> }) {
    const { locale, workspaceId } = await params
    redirect(`/portal/${locale}/${workspaceId}?s=invoices`)
}
