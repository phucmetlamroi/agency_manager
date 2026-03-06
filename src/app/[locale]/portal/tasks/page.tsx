import { getClientTasks } from '@/actions/client-portal-actions';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { Clock, PlayCircle, CheckCircle2 } from 'lucide-react';

export default async function PortalTasksPage() {
    const session = await getSession();
    if (!session) redirect('/login');

    const t = await getTranslations('Portal');
    const tasksT = await getTranslations('TaskStatus');

    // In real app, we fetch: const tasks = await getClientTasks(session.workspaceId || '')
    const MOCK_TASKS = [
        { id: '1', title: 'Editing VLOG 042 - Hawaii Trip', status: 'Pending', type: 'Long form', deadline: '2026-03-10' },
        { id: '2', title: 'TikTok Ads - Summer Sale', status: 'Revising', type: 'Short form', deadline: '2026-03-08' },
        { id: '3', title: 'Corporate Interview B-Roll', status: 'Completed', type: 'Long form', deadline: '2026-02-28' },
    ];

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
                            <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                        {MOCK_TASKS.map(task => (
                            <tr key={task.id} className="hover:bg-zinc-800/30 transition-colors group">
                                <td className="px-6 py-4">
                                    <p className="text-zinc-200 font-medium">{task.title}</p>
                                    <p className="text-zinc-500 text-sm">{task.type}</p>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                        {task.status === 'Completed' ? <CheckCircle2 size={16} className="text-emerald-500" /> :
                                            task.status === 'Pending' ? <Clock size={16} className="text-zinc-400" /> :
                                                <PlayCircle size={16} className="text-amber-500" />}
                                        <span className={`text-sm ${task.status === 'Completed' ? 'text-emerald-400' : task.status === 'Pending' ? 'text-zinc-400' : 'text-amber-400'}`}>
                                            {task.status} {/* Use tasksT(task.status.toLowerCase()) in real app */}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-zinc-400">{task.deadline}</td>
                                <td className="px-6 py-4 text-right">
                                    <Link href={`/portal/tasks/${task.id}`} className="text-sm font-medium text-indigo-400 hover:text-indigo-300 opacity-0 group-hover:opacity-100 transition-opacity">
                                        View Details &rarr;
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
