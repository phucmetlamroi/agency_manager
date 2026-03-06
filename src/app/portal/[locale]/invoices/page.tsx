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

    // Fetch real data
    const [invoices, projects] = await Promise.all([
        getClientInvoices(),
        getClientProjects()
    ]);

    const t = await getTranslations('Portal');

    return (
        <div className="w-full h-full flex flex-col p-6">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-light text-white tracking-tight">{t('your_invoices')}</h1>
            </div>

            <InvoiceDashboard initialInvoices={invoices} initialProjects={projects} />
        </div>
    );
}
