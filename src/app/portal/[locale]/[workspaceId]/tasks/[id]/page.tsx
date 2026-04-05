import { getTaskDetailForPortal } from '@/actions/client-portal-actions';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft, Clock, FileVideo, DollarSign, Tag, ExternalLink, FolderOpen, Upload } from 'lucide-react';
import RatingMicroSurvey from '@/components/portal/RatingMicroSurvey';
import PortalStatusBadge from '@/components/portal/PortalStatusBadge';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ensureExternalLinks } from '@/lib/utils';
import { formatClientHierarchy } from '@/lib/client-hierarchy';

export default async function PortalTaskDetail({
    params
}: {
    params: Promise<{ locale: string; workspaceId: string; id: string }>;
}) {
    const { locale, workspaceId, id } = await params;
    const task = await getTaskDetailForPortal(id);
    if (!task) return notFound();

    const t = await getTranslations('TaskDetail');
    const clientPath = (task as any).clientPath || formatClientHierarchy(task.client as any);

    return (
        <div className="w-full max-w-4xl mx-auto p-4 sm:p-8">
            {/* Back link */}
            <Link
                href={`/portal/${locale}/${workspaceId}/tasks`}
                className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-white mb-6 transition-colors group"
            >
                <ArrowLeft size={15} className="group-hover:-translate-x-0.5 transition-transform" /> {t('back')}
            </Link>

            {/* Header */}
            <div className="relative bg-zinc-950/60 backdrop-blur-2xl border border-white/[0.06] rounded-3xl p-6 sm:p-8 mb-6 shadow-xl shadow-black/30 overflow-hidden">
                <div className="absolute -top-20 -right-20 w-48 h-48 bg-indigo-500/[0.03] rounded-full blur-3xl pointer-events-none" />

                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 relative z-10">
                    <div className="min-w-0">
                        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-3">{task.title}</h1>
                        <div className="flex flex-wrap items-center gap-2.5 text-sm">
                            {task.deadline && (
                                <span className="flex items-center gap-1.5 text-zinc-400 bg-white/[0.03] border border-white/[0.04] px-2.5 py-1 rounded-lg text-xs">
                                    <Clock size={12} className="text-zinc-500" />
                                    {new Date(task.deadline).toLocaleDateString(locale === 'vi' ? 'vi-VN' : locale === 'zh' ? 'zh-CN' : locale === 'ru' ? 'ru-RU' : 'en-US')}
                                </span>
                            )}
                            {task.estimatedCost > 0 && (
                                <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/[0.06] border border-emerald-500/15 px-2.5 py-1 rounded-lg text-xs font-medium">
                                    <DollarSign size={12} /> {task.estimatedCost.toLocaleString()} USD
                                </span>
                            )}
                            {task.type && (
                                <span className="flex items-center gap-1.5 text-zinc-400 bg-white/[0.03] border border-white/[0.04] px-2.5 py-1 rounded-lg text-xs">
                                    <Tag size={12} className="text-zinc-500" /> {task.type}
                                </span>
                            )}
                            {clientPath && (
                                <span className="text-indigo-400 text-xs font-medium">{clientPath}</span>
                            )}
                        </div>
                    </div>

                    <div className="shrink-0">
                        <PortalStatusBadge status={task.clientStatus} pulse={task.clientStatus === 'Action Required'} />
                    </div>
                </div>
            </div>

            {/* Content grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Left column */}
                <div className="md:col-span-2 space-y-5">
                    {/* Asset review */}
                    {task.productLink && (
                        <div className="bg-zinc-950/60 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 shadow-lg shadow-black/20">
                            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                                <FileVideo size={16} className="text-indigo-400" /> {t('review_asset')}
                            </h3>
                            <p className="text-zinc-500 text-sm mb-4">{t('review_asset_desc')}</p>
                            <a
                                href={task.productLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-colors shadow-lg shadow-indigo-900/20"
                            >
                                <ExternalLink size={15} /> {t('open_link')}
                            </a>
                        </div>
                    )}

                    {/* Notes */}
                    {(task.notes_en || task.notes_vi) && (
                        <div className="bg-zinc-950/60 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 shadow-lg shadow-black/20">
                            <h3 className="text-white font-semibold mb-3">{t('notes')}</h3>
                            <div
                                className="text-zinc-300 text-sm prose-portal"
                                dangerouslySetInnerHTML={{ __html: ensureExternalLinks(task.notes_en || task.notes_vi) }}
                            />
                            {!task.notes_en && task.notes_vi && (
                                <p className="mt-4 text-[10px] text-zinc-600 italic border-t border-white/[0.04] pt-3">
                                    * Showing original notes (Translation pending)
                                </p>
                            )}
                        </div>
                    )}

                    {/* 4C: Project assets */}
                    {(task.references || task.resources || task.collectFilesLink) && (
                        <div className="bg-zinc-950/60 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 shadow-lg shadow-black/20">
                            <h3 className="text-white font-semibold mb-4">Project Assets</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {task.references && (
                                    <a
                                        href={ensureExternalLinks(task.references)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group/asset flex items-center gap-3 p-3.5 bg-zinc-900/40 border border-white/[0.04] hover:border-violet-500/20 hover:bg-violet-500/[0.04] rounded-xl transition-all"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/15 flex items-center justify-center shrink-0">
                                            <Tag size={14} className="text-violet-400" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-zinc-200 font-medium group-hover/asset:text-white">References</p>
                                            <p className="text-[10px] text-zinc-600">View source materials</p>
                                        </div>
                                    </a>
                                )}
                                {task.resources && (
                                    <a
                                        href={ensureExternalLinks(task.resources)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group/asset flex items-center gap-3 p-3.5 bg-zinc-900/40 border border-white/[0.04] hover:border-blue-500/20 hover:bg-blue-500/[0.04] rounded-xl transition-all"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/15 flex items-center justify-center shrink-0">
                                            <FolderOpen size={14} className="text-blue-400" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-zinc-200 font-medium group-hover/asset:text-white">Resources</p>
                                            <p className="text-[10px] text-zinc-600">Project resource files</p>
                                        </div>
                                    </a>
                                )}
                                {task.collectFilesLink && (
                                    <a
                                        href={ensureExternalLinks(task.collectFilesLink)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group/asset flex items-center gap-3 p-3.5 bg-zinc-900/40 border border-white/[0.04] hover:border-amber-500/20 hover:bg-amber-500/[0.04] rounded-xl transition-all"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/15 flex items-center justify-center shrink-0">
                                            <Upload size={14} className="text-amber-400" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-zinc-200 font-medium group-hover/asset:text-white">Upload Assets</p>
                                            <p className="text-[10px] text-zinc-600">Submit your files</p>
                                        </div>
                                    </a>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right column */}
                <div className="space-y-5">
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

                    {(task.frameUsername || task.framePassword) && (
                        <div className="bg-indigo-950/20 backdrop-blur-xl border border-indigo-500/15 rounded-2xl p-5 shadow-lg shadow-indigo-500/5">
                            <h3 className="text-indigo-400 text-[9px] uppercase font-bold tracking-[0.2em] mb-3">Frame Account</h3>
                            <div className="space-y-2.5">
                                {task.frameUsername && (
                                    <div className="flex justify-between items-center text-xs bg-zinc-950/40 border border-white/[0.04] rounded-lg px-3 py-2">
                                        <span className="text-zinc-500">Username</span>
                                        <span className="text-zinc-200 font-mono text-[11px]">{task.frameUsername}</span>
                                    </div>
                                )}
                                {task.framePassword && (
                                    <div className="flex justify-between items-center text-xs bg-zinc-950/40 border border-white/[0.04] rounded-lg px-3 py-2">
                                        <span className="text-zinc-500">Password</span>
                                        <span className="text-zinc-200 font-mono text-[11px]">{task.framePassword}</span>
                                    </div>
                                )}
                            </div>
                            {task.frameNote && (
                                <p className="text-[10px] text-zinc-500 italic mt-3 border-t border-indigo-500/10 pt-2.5">
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
