import { getTaskDetailForPortal } from '@/actions/client-portal-actions';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft, Clock, FileVideo, DollarSign, Tag, User } from 'lucide-react';
import RatingMicroSurvey from '@/components/portal/RatingMicroSurvey';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ensureExternalLinks, removeAccents } from '@/lib/utils';

export default async function PortalTaskDetail({
    params
}: {
    params: Promise<{ locale: string; workspaceId: string; id: string }>;
}) {
    const { locale, workspaceId, id } = await params;
    const task = await getTaskDetailForPortal(id);
    if (!task) return notFound();

    const t = await getTranslations('TaskDetail');

    const statusColorMap: Record<string, string> = {
        'Completed': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
        'In Progress': 'border-amber-500/30 bg-amber-500/10 text-amber-400',
        'Action Required': 'border-rose-500/30 bg-rose-500/10 text-rose-400',
        'Revising': 'border-orange-500/30 bg-orange-500/10 text-orange-400',
        'Pending': 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
    };
    const statusColor = statusColorMap[task.clientStatus] ?? statusColorMap['Pending'];

    return (
        <div className="w-full max-w-4xl mx-auto p-8">
            <Link
                href={`/portal/${locale}/${workspaceId}/tasks`}
                className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 mb-8 transition-colors"
            >
                <ArrowLeft size={16} /> {t('back')}
            </Link>

            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-light text-white tracking-tight mb-2">{task.title}</h1>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-400">
                        {task.deadline && (
                            <span className="flex items-center gap-1">
                                <Clock size={14} /> {new Date(task.deadline).toLocaleDateString(locale === 'vi' ? 'vi-VN' : locale === 'zh' ? 'zh-CN' : locale === 'ru' ? 'ru-RU' : 'en-US')}
                            </span>
                        )}
                        {task.estimatedCost > 0 && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-medium">
                                <DollarSign size={14} /> {task.estimatedCost.toLocaleString()} USD
                            </span>
                        )}
                        {task.type && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                                <Tag size={14} /> {task.type}
                            </span>
                        )}
                        {task.client && (
                            <span className="text-indigo-400">{task.client.name}</span>
                        )}
                    </div>
                </div>

                <div className={`px-4 py-2 rounded-full border font-medium flex items-center gap-2 shrink-0 ${statusColor}`}>
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-current"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-current"></span>
                    </span>
                    {task.clientStatus}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left */}
                <div className="md:col-span-2 space-y-6">
                    {task.productLink && (
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur">
                            <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                                <FileVideo size={18} className="text-indigo-400" /> {t('review_asset')}
                            </h3>
                            <p className="text-zinc-400 text-sm mb-4">{t('review_asset_desc')}</p>
                            <a
                                href={task.productLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block w-full py-3 text-center bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-colors shadow-lg shadow-indigo-900/20"
                            >
                                {t('open_link')}
                            </a>
                        </div>
                    )}

                    {(task.notes_en || task.notes_vi) && (
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur">
                            <h3 className="text-white font-medium mb-3">{t('notes')}</h3>
                            <div
                                className="text-zinc-300 text-sm prose-portal"
                                dangerouslySetInnerHTML={{ __html: ensureExternalLinks(task.notes_en || task.notes_vi) }}
                            />
                            {!task.notes_en && task.notes_vi && (
                                <p className="mt-4 text-[10px] text-zinc-500 italic">
                                    * Showing original notes (Translation pending)
                                </p>
                            )}
                        </div>
                    )}

                    {(task.references || task.resources || task.collectFilesLink) && (
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur space-y-4">
                            <h3 className="text-white font-medium mb-1">Project Assets</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {task.references && (
                                    <a
                                        href={ensureExternalLinks(task.references)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-3 bg-zinc-800/50 border border-zinc-700/50 rounded-xl text-xs text-zinc-300 hover:bg-zinc-800 transition-colors flex items-center gap-2"
                                    >
                                        <Tag size={14} className="text-purple-400" /> References
                                    </a>
                                )}
                                {task.resources && (
                                    <a
                                        href={ensureExternalLinks(task.resources)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-3 bg-zinc-800/50 border border-zinc-700/50 rounded-xl text-xs text-zinc-300 hover:bg-zinc-800 transition-colors flex items-center gap-2"
                                    >
                                        <FileVideo size={14} className="text-blue-400" /> Resources
                                    </a>
                                )}
                                {task.collectFilesLink && (
                                    <a
                                        href={ensureExternalLinks(task.collectFilesLink)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-3 bg-zinc-800/50 border border-zinc-700/50 rounded-xl text-xs text-zinc-300 hover:bg-zinc-800 transition-colors flex items-center gap-2"
                                    >
                                        <Clock size={14} className="text-amber-400" /> Upload assets
                                    </a>
                                )}
                            </div>
                        </div>
                    )}

                </div>

                {/* Right - Rating */}
                <div className="space-y-6">
                    <RatingMicroSurvey
                        taskId={task.id}
                        status={task.status}
                        existingRating={task.rating ? {
                            creativeQuality: Number(task.rating.creativeQuality),
                            responsiveness: Number(task.rating.responsiveness),
                            communication: Number(task.rating.communication),
                            qualitativeFeedback: task.rating.qualitativeFeedback
                        } : null}
                    />

                    {task.assignee && (
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur animate-in fade-in slide-in-from-bottom-2 duration-500">
                            <h3 className="text-zinc-400 text-xs uppercase tracking-widest font-bold mb-3 flex items-center gap-2">
                                <User size={14} className="text-indigo-400" /> {t('assignee')}
                            </h3>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold">
                                    {(task.assignee.nickname || task.assignee.username).charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <p className="text-white font-medium">
                                        {locale === 'vi'
                                            ? (task.assignee.nickname || task.assignee.username)
                                            : removeAccents(task.assignee.nickname || task.assignee.username)
                                        }
                                    </p>
                                    <p className="text-zinc-500 text-[10px] uppercase tracking-tighter">Verified Studio Editor</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {(task.frameUsername || task.framePassword) && (
                        <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-2xl p-6 backdrop-blur space-y-3">
                            <h3 className="text-indigo-400 text-[10px] uppercase font-bold tracking-widest">Frame account</h3>
                            <div className="space-y-2">
                                {task.frameUsername && (
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-zinc-500">Username</span>
                                        <span className="text-zinc-200 font-mono">{task.frameUsername}</span>
                                    </div>
                                )}
                                {task.framePassword && (
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-zinc-500">Password</span>
                                        <span className="text-zinc-200 font-mono">{task.framePassword}</span>
                                    </div>
                                )}
                            </div>
                            {task.frameNote && (
                                <p className="text-[10px] text-zinc-500 italic mt-2 border-t border-indigo-500/10 pt-2">
                                    {task.frameNote}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
