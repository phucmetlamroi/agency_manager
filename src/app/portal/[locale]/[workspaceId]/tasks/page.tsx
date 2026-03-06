import { getClientTasks } from '@/actions/client-portal-actions';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Clock, PlayCircle, CheckCircle2 } from 'lucide-react';

export default async function PortalTasksPage({
    params
}: {
    params: Promise<{ locale: string, workspaceId: string }>;
}) {
    const { workspaceId } = await params;
    const session = await getSession();
    if (!session) redirect('/login');

    const t = await getTranslations('Portal');

    // Fetch real data for the specific workspace
    const tasks = await getClientTasks(workspaceId);

    return (
        <div className="w-full max-w-5xl mx-auto p-8">
            <h1 className="text-3xl font-light text-white tracking-tight mb-8">{t('your_tasks')}</h1>

            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl overflow-hidden backdrop-blur-sm">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-zinc-800/80 bg-zinc-900/60">
                            <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Project / Task</th>
                            <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Deadline</th>
                            <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider text-right text-transparent">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                        {tasks.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-10 text-center text-zinc-500">
                                    No tasks found in this workspace.
                                </td>
                            </tr>
                        ) : (
                            tasks.map(task => (
                                <tr key={task.id} className="hover:bg-zinc-800/30 transition-colors group">
                                    <td className="px-6 py-4">
                                        <p className="text-zinc-200 font-medium">{task.title}</p>
                                        <p className="text-zinc-500 text-sm">{task.type}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            {task.clientStatus === 'Completed' ? <CheckCircle2 size={16} className="text-emerald-500" /> :
                                                task.clientStatus === 'Pending' ? <Clock size={16} className="text-zinc-400" /> :
                                                    <PlayCircle size={16} className="text-amber-500" />}
                                            <span className={`text-sm ${task.clientStatus === 'Completed' ? 'text-emerald-400' : task.clientStatus === 'Pending' ? 'text-zinc-400' : 'text-amber-400'}`}>
                                                {task.clientStatus}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-zinc-400">{task.deadline ? new Date(task.deadline).toLocaleDateString() : 'No deadline'}</td>
                                    <td className="px-6 py-4 text-right">
                                        {task.productLink && (
                                            <a
                                                href={task.productLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-sm font-medium text-indigo-400 hover:text-indigo-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                View Link &rarr;
                                            </a>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
