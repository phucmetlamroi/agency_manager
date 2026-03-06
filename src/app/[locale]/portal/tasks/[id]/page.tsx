import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { ArrowLeft, Clock, FileVideo, MessageSquareQuote } from 'lucide-react';
import RatingMicroSurvey from '@/components/portal/RatingMicroSurvey';

export default async function PortalTaskDetail({ params }: { params: { id: string } }) {
    // const { id } = params;

    // Abstracted task status & mock data
    const task = {
        title: 'TikTok Ads - Summer Sale',
        status: 'Revising',
        estimatedCost: 350,
        deadline: '2026-03-08',
        frameActionUrl: 'https://frame.io/preview/abc-123',
    };

    return (
        <div className="w-full max-w-4xl mx-auto p-8">
            <Link href="/portal/tasks" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 mb-8 transition-colors">
                <ArrowLeft size={16} /> Back to Tasks
            </Link>

            <div className="flex justify-between items-start mb-8">
                <div>
                    <h1 className="text-3xl font-light text-white tracking-tight mb-2">{task.title}</h1>
                    <div className="flex items-center gap-4 text-sm text-zinc-400">
                        <span className="flex items-center gap-1"><Clock size={16} /> {task.deadline}</span>
                        <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-medium">Estimated: ${task.estimatedCost}</span>
                    </div>
                </div>

                <div className="px-4 py-2 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-500 font-medium flex items-center gap-2 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                    </span>
                    {task.status}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur">
                        <h3 className="text-white font-medium mb-4 flex items-center gap-2"><FileVideo size={18} className="text-indigo-400" /> Review Asset</h3>
                        <p className="text-zinc-400 text-sm mb-6">Your video is ready for review. Please leave timecode-specific comments directly on the Frame.io player.</p>

                        <a href={task.frameActionUrl} target="_blank" rel="noopener noreferrer" className="block w-full py-3 text-center bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-colors shadow-lg shadow-indigo-900/20">
                            Open in Frame.io
                        </a>
                    </div>

                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur">
                        <h3 className="text-white font-medium mb-4 flex items-center gap-2"><MessageSquareQuote size={18} className="text-indigo-400" /> Feedback Loop</h3>
                        <div className="space-y-4">
                            <div className="border-l-2 border-zinc-700 pl-4 py-1">
                                <p className="text-sm text-zinc-300">"Can we make the intro hook slightly faster? Around 0:02"</p>
                                <p className="text-xs text-zinc-500 mt-1">You • 2 hours ago</p>
                            </div>
                            <div className="border-l-2 border-indigo-500 pl-4 py-1">
                                <p className="text-sm text-zinc-300">"Done! I've trimmed the B-roll at 0:02 to speed up the pacing. Take a look at V2."</p>
                                <p className="text-xs text-zinc-500 mt-1">Editor • 1 hour ago</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <RatingMicroSurvey taskId="1" status={task.status} />
                </div>
            </div>
        </div>
    );
}
