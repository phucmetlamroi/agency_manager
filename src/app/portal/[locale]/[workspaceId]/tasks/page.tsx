import { getClientTasks } from '@/actions/client-portal-actions';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
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

    return (
        <div className="w-full max-w-4xl mx-auto p-8">
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-3xl font-light text-white tracking-tight">{t('your_tasks')}</h1>
                <span className="text-sm text-zinc-500">{tasks.length} task{tasks.length !== 1 ? 's' : ''} tổng</span>
            </div>

            <TaskGroupAccordion
                tasks={tasks as any}
                locale={locale}
                workspaceId={workspaceId}
                rootClientName={session.user.username}
            />
        </div>
    );
}
