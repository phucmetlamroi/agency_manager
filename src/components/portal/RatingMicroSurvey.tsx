'use client'

import { useState, useTransition } from 'react'
import { Star, Send, ThumbsUp, Loader2 } from 'lucide-react'
import { submitTaskRating } from '@/actions/client-portal-actions'
import { useTranslations } from 'next-intl'

interface RatingMicroSurveyProps {
    taskId: string
    status: string
    existingRating?: {
        creativeQuality: number
        responsiveness: number
        communication: number
        qualitativeFeedback?: string | null
    } | null
}

export default function RatingMicroSurvey({ taskId, status, existingRating }: RatingMicroSurveyProps) {
    const t = useTranslations('TaskDetail')
    const rt = useTranslations('Rating')

    const [ratings, setRatings] = useState({
        creativeQuality: Number(existingRating?.creativeQuality ?? 0),
        responsiveness: Number(existingRating?.responsiveness ?? 0),
        communication: Number(existingRating?.communication ?? 0),
    })
    const [feedback, setFeedback] = useState(existingRating?.qualitativeFeedback ?? '')
    const [submitted, setSubmitted] = useState(!!existingRating)
    const [error, setError] = useState('')
    const [isPending, startTransition] = useTransition()

    const clientStatus = status.toLowerCase()
    const isCompleted = clientStatus.includes('hoàn tất') || clientStatus === 'completed'

    if (!isCompleted) {
        return (
            <div className="bg-zinc-950/60 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 shadow-lg shadow-black/20">
                <h3 className="text-white font-semibold mb-2">{t('not_completed')}</h3>
                <p className="text-zinc-500 text-sm">{t('not_completed_desc')}</p>
            </div>
        )
    }

    if (submitted) {
        return (
            <div className="relative bg-emerald-950/20 backdrop-blur-xl border border-emerald-500/15 rounded-2xl p-6 shadow-lg shadow-emerald-500/5 overflow-hidden">
                <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-500/[0.04] rounded-full blur-2xl pointer-events-none" />
                <div className="relative z-10 flex flex-col items-center text-center">
                    <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mb-3">
                        <ThumbsUp className="text-emerald-400" size={22} />
                    </div>
                    <h3 className="text-emerald-400 font-semibold mb-1">{t('already_rated_title')}</h3>
                    <p className="text-zinc-500 text-xs mb-4">{t('already_rated_desc')}</p>
                    {existingRating && (
                        <div className="space-y-2 text-sm w-full">
                            <StarDisplay label={rt('creative_quality')} value={Number(existingRating.creativeQuality)} />
                            <StarDisplay label={rt('responsiveness')} value={Number(existingRating.responsiveness)} />
                            <StarDisplay label={rt('communication')} value={Number(existingRating.communication)} />
                        </div>
                    )}
                </div>
            </div>
        )
    }

    const handleRating = (category: keyof typeof ratings, value: number) => {
        setRatings(prev => ({ ...prev, [category]: value }))
    }

    const handleSubmit = () => {
        setError('')
        startTransition(async () => {
            const result = await submitTaskRating(
                taskId,
                ratings.creativeQuality,
                ratings.responsiveness,
                ratings.communication,
                feedback || undefined
            )
            if (result.success) {
                setSubmitted(true)
            } else {
                setError(result.error || 'Error')
            }
        })
    }

    const isComplete = ratings.creativeQuality > 0 && ratings.responsiveness > 0 && ratings.communication > 0

    return (
        <div className="relative bg-zinc-950/60 backdrop-blur-xl border border-indigo-500/15 shadow-lg shadow-indigo-500/5 rounded-2xl p-6 overflow-hidden">
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-500/[0.04] rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10">
                <h3 className="text-white font-semibold mb-1">{t('rate_delivery')}</h3>
                <p className="text-zinc-500 text-xs mb-5">{t('rate_delivery_desc')}</p>

                <div className="space-y-4 mb-5">
                    <RatingRow label={rt('creative_quality')} value={ratings.creativeQuality} onChange={(v) => handleRating('creativeQuality', v)} />
                    <RatingRow label={rt('responsiveness')} value={ratings.responsiveness} onChange={(v) => handleRating('responsiveness', v)} />
                    <RatingRow label={rt('communication')} value={ratings.communication} onChange={(v) => handleRating('communication', v)} />
                </div>

                <div className="mb-5">
                    <label className="block text-zinc-500 text-[10px] uppercase tracking-wider font-bold mb-2">{t('optional_feedback')}</label>
                    <textarea
                        rows={3}
                        placeholder={t('optional_feedback_placeholder')}
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        className="w-full bg-zinc-900/50 border border-white/[0.06] rounded-xl p-3 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/20 resize-none transition-all placeholder:text-zinc-600"
                    />
                </div>

                {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

                <button
                    onClick={handleSubmit}
                    disabled={!isComplete || isPending}
                    className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all duration-200 ${isComplete && !isPending
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/20 active:scale-[0.98]'
                        : 'bg-zinc-900/50 text-zinc-600 border border-white/[0.04] cursor-not-allowed'
                        }`}
                >
                    {isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                    {isPending ? t('submitting') : t('submit_rating')}
                </button>
            </div>
        </div>
    )
}

function RatingRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
    const [hovered, setHovered] = useState(0)
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-300 font-medium">{label}</span>
            <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        onClick={() => onChange(star)}
                        onMouseEnter={() => setHovered(star)}
                        onMouseLeave={() => setHovered(0)}
                        className="focus:outline-none transition-transform hover:scale-110 p-0.5"
                    >
                        <Star
                            size={18}
                            className={`transition-colors ${star <= (hovered || value) ? 'fill-amber-400 text-amber-400' : 'text-zinc-700 hover:text-zinc-500'}`}
                        />
                    </button>
                ))}
            </div>
        </div>
    )
}

function StarDisplay({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex items-center justify-between gap-4 text-zinc-400 bg-zinc-900/30 border border-white/[0.03] rounded-lg px-3 py-1.5">
            <span className="text-xs">{label}</span>
            <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(s => (
                    <Star key={s} size={11} className={s <= value ? 'fill-amber-400 text-amber-400' : 'text-zinc-700'} />
                ))}
            </div>
        </div>
    )
}
