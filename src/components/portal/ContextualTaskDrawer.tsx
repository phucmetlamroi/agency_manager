'use client'

import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Clock, DollarSign, Tag, FileVideo, User } from 'lucide-react'
import PortalStatusBadge from './PortalStatusBadge'
import RatingMicroSurvey from './RatingMicroSurvey'
import { ensureExternalLinks, removeAccents } from '@/lib/utils'

type TaskDrawerProps = {
    task: any | null
    isOpen: boolean
    onClose: () => void
    locale: string
}

export default function ContextualTaskDrawer({ task, isOpen, onClose, locale }: TaskDrawerProps) {
    const t = useTranslations('TaskDetail')

    return (
        <AnimatePresence>
            {isOpen && task && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
                        style={{ transform: 'translateZ(0)' }} // Hardware acceleration
                    />

                    {/* Modal Container */}
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 10 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 10 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="w-full max-w-2xl max-h-[90vh] bg-zinc-950/90 border border-white/10 rounded-3xl shadow-2xl flex flex-col backdrop-blur-3xl overflow-hidden pointer-events-auto"
                        >
                            {/* Header */}
                            <div className="sticky top-0 bg-zinc-950/80 backdrop-blur-xl border-b border-white/5 p-6 flex items-start justify-between z-10 shrink-0">
                                <div className="flex-1 pr-4">
                                    <h2 className="text-2xl font-light text-white mb-3">{task.title}</h2>
                                    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                                        <PortalStatusBadge status={task.clientStatus} pulse={task.clientStatus === 'Action Required'} />
                                        {task.deadline && (
                                            <span className="flex items-center gap-1">
                                                <Clock size={12} /> {new Date(task.deadline).toLocaleDateString()}
                                            </span>
                                        )}
                                        {task.estimatedCost > 0 && (
                                            <span className="flex items-center gap-1">
                                                <DollarSign size={12} /> {task.estimatedCost.toLocaleString()} USD
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors shrink-0"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-6 space-y-8 flex-1 overflow-y-auto custom-scrollbar">
                                {/* Action Buttons (Inline Approvals) */}
                                {task.clientStatus === 'Action Required' && (
                                    <div className="flex gap-3">
                                        <button className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-emerald-900/20">
                                            Approve Content
                                        </button>
                                        <button className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3 rounded-xl border border-white/5 transition-colors">
                                            Request Changes
                                        </button>
                                    </div>
                                )}

                                {/* Assets */}
                                {task.productLink && (
                                    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5">
                                        <h3 className="text-white text-sm font-medium mb-3 flex items-center gap-2">
                                            <FileVideo size={16} className="text-indigo-400" /> {t('review_asset')}
                                        </h3>
                                        <a
                                            href={task.productLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block w-full py-3 text-center bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 font-medium rounded-xl transition-colors"
                                        >
                                            {t('open_link')} &rarr;
                                        </a>
                                    </div>
                                )}

                                {/* Notes */}
                                {(task.notes_en || task.notes_vi) && (
                                    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5">
                                        <h3 className="text-white text-sm font-medium mb-3">{t('notes')}</h3>
                                        <div
                                            className="text-zinc-300 text-sm leading-relaxed prose-portal"
                                            dangerouslySetInnerHTML={{ __html: ensureExternalLinks(task.notes_en || task.notes_vi) }}
                                        />
                                        {!task.notes_en && task.notes_vi && (
                                            <p className="mt-3 text-[10px] text-zinc-500 italic">
                                                * Showing original notes
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Assignee */}
                                {task.assignee && (
                                    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5">
                                        <h3 className="text-white text-sm font-medium mb-3 flex items-center gap-2">
                                            <User size={16} className="text-pink-400" /> {t('assignee')}
                                        </h3>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 font-bold">
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

                                {/* Rating Survey embedded directly in modal */}
                                <div className="pt-4 border-t border-white/5">
                                    <RatingMicroSurvey
                                        taskId={task.id}
                                        status={task.status} // Important: passing internal status for rating comp.
                                        existingRating={task.rating ? {
                                            creativeQuality: Number(task.rating.creativeQuality),
                                            responsiveness: Number(task.rating.responsiveness),
                                            communication: Number(task.rating.communication),
                                            qualitativeFeedback: task.rating.qualitativeFeedback
                                        } : null}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    )
}

