import { getClientInvoices, getClientProjects } from '@/actions/client-portal-actions';
import InvoiceDashboard from '@/components/portal/InvoiceDashboard';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import PortalPageTransition from '@/components/portal/PortalPageTransition';

export default async function PortalInvoicesPage({
    params
}: {
    params: Promise<{ locale: string, workspaceId: string }>;
}) {
    const { workspaceId } = await params;
    const session = await getSession();
    if (!session) redirect('/login');

    // Fetch real data for specific workspace
    const [invoices, projects] = await Promise.all([
        getClientInvoices(workspaceId),
        getClientProjects(workspaceId)
    ]);

    const t = await getTranslations('Portal');

    return (
        <PortalPageTransition>
        <div className="w-full h-full flex flex-col p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{t('your_invoices')}</h1>
                <span className="text-[10px] font-bold bg-white/[0.04] text-zinc-400 border border-white/[0.06] px-2.5 py-1 rounded-full uppercase tracking-wider">
                    {invoices.length} total
                </span>
            </div>

            <InvoiceDashboard initialInvoices={invoices} initialProjects={projects} />
        </div>
        </PortalPageTransition>
    );
}
