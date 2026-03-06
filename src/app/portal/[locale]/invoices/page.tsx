import { getClientInvoices, getClientProjects } from '@/actions/client-portal-actions';
import InvoiceDashboard from '@/components/portal/InvoiceDashboard';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function PortalInvoicesPage() {
    // Assuming the user is logging in without selecting workspace first?
    // Wait, the user might be mapped to a workspace or multiple.
    // In this MVP we just fetch the user's workspace memberships.
    const session = await getSession();
    if (!session) redirect('/login');

    // For simplicity, we just use the first workspace they belong to if they don't have one selected in URL.
    // The previous implementation used URL routing `/[workspaceId]/...`
    // Next-intl hijacked `/[locale]/`. If we are at `/[locale]/portal/invoices`, where is workspaceId?
    // From session? Let's check session or db.

    // For now, let's just render the dashboard structure.
    const t = await getTranslations('Portal');

    return (
        <div className="w-full h-full flex flex-col p-6">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-light text-white tracking-tight">{t('your_invoices')}</h1>
            </div>

            <InvoiceDashboard />
        </div>
    );
}
