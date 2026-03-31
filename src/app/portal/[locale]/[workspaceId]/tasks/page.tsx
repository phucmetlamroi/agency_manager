import { getClientTasks } from '@/actions/client-portal-actions';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import PortalDashboardBento from '@/components/portal/PortalDashboardBento';
import TaskGroupAccordion from '@/components/portal/TaskGroupAccordion';

export default async function PortalTasksPage({
    params
}: {
    params: Promise<{ locale: string, workspaceId: string }>;
}) {
    const { locale, workspaceId } = await params;
    const session = await getSession();
    if (!session) redirect('/login');

    const t = await getTranslations('Portal');
    const tasks = await getClientTasks(workspaceId);
    const now = new Date();
    const total = tasks.length;
    const actionRequired = tasks.filter(t => t.clientStatus === 'Action Required').length;
    const inProgress = tasks.filter(t => t.clientStatus === 'In Progress' || t.clientStatus === 'Revising').length;
    const completed = tasks.filter(t => t.clientStatus === 'Completed').length;
    const dueSoon = tasks.filter(t => {
        if (!t.deadline) return false;
        const deadline = new Date(t.deadline);
        const diffDays = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays >= 0 && diffDays <= 3 && t.clientStatus !== 'Completed';
    }).length;
    const nextDeadline = tasks
        .filter(t => t.deadline)
        .map(t => new Date(t.deadline as any))
        .filter(d => d.getTime() >= now.getTime())
        .sort((a, b) => a.getTime() - b.getTime())[0];
    const nextDeadlineLabel = nextDeadline
        ? nextDeadline.toLocaleDateString(locale === 'vi' ? 'vi-VN' : locale === 'zh' ? 'zh-CN' : locale === 'ru' ? 'ru-RU' : 'en-US')
        : '--';

    return (
        <div className="w-full max-w-6xl mx-auto p-4 sm:p-8">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-light tracking-tight bg-gradient-to-br from-amber-100 via-yellow-400 to-amber-600 bg-clip-text text-transparent drop-shadow-sm">
                        {t('your_tasks')}
                    </h1>
                    <p className="text-sm text-zinc-500 mt-1">Command Center &middot; {total} active processes</p>

                </div>
            </div>

            <div className="mb-10">
                <TaskGroupAccordion tasks={tasks as any} locale={locale} workspaceId={workspaceId} />
            </div>

            <PortalDashboardBento
                tasks={tasks as any}
                locale={locale}
                workspaceId={workspaceId}
            />


        </div>
    );
}
