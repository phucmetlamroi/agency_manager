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
                    <h1 className="text-3xl font-light text-white tracking-tight">{t('your_tasks')}</h1>
                    <p className="text-sm text-zinc-500 mt-1">Command Center &middot; {total} active processes</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                <div className="bg-zinc-950/50 border border-white/5 rounded-2xl p-4 backdrop-blur-xl">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500">Action Required</p>
                    <p className="text-2xl font-semibold text-rose-400">{actionRequired}</p>
                    <p className="text-xs text-zinc-500 mt-1">Awaiting your input</p>
                </div>
                <div className="bg-zinc-950/50 border border-white/5 rounded-2xl p-4 backdrop-blur-xl">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500">In Progress</p>
                    <p className="text-2xl font-semibold text-amber-400">{inProgress}</p>
                    <p className="text-xs text-zinc-500 mt-1">Active production</p>
                </div>
                <div className="bg-zinc-950/50 border border-white/5 rounded-2xl p-4 backdrop-blur-xl">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500">Completed</p>
                    <p className="text-2xl font-semibold text-emerald-400">{completed}</p>
                    <p className="text-xs text-zinc-500 mt-1">Delivered this cycle</p>
                </div>
                <div className="bg-zinc-950/50 border border-white/5 rounded-2xl p-4 backdrop-blur-xl">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500">Next Deadline</p>
                    <p className="text-2xl font-semibold text-indigo-300">{nextDeadlineLabel}</p>
                    <p className="text-xs text-zinc-500 mt-1">{dueSoon} due within 3 days</p>
                </div>
            </div>

            <PortalDashboardBento
                tasks={tasks as any}
                locale={locale}
                workspaceId={workspaceId}
            />

            <div id="all-tasks" className="mt-10">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-xl font-semibold text-white">All Tasks</h2>
                        <p className="text-xs text-zinc-500">Grouped by client for quick review</p>
                    </div>
                </div>
                <TaskGroupAccordion tasks={tasks as any} locale={locale} workspaceId={workspaceId} />
            </div>
        </div>
    );
}
