'use client'

import { useState, useTransition } from 'react';
import { Star, Send, ThumbsUp, Loader2 } from 'lucide-react';
import { submitTaskRating } from '@/actions/client-portal-actions';

interface RatingMicroSurveyProps {
    taskId: string;
    status: string;
    existingRating?: {
        creativeQuality: number;
        responsiveness: number;
        communication: number;
        qualitativeFeedback?: string | null;
    } | null;
}

export default function RatingMicroSurvey({ taskId, status, existingRating }: RatingMicroSurveyProps) {
    const [ratings, setRatings] = useState({
        creativeQuality: Number(existingRating?.creativeQuality ?? 0),
        responsiveness: Number(existingRating?.responsiveness ?? 0),
        communication: Number(existingRating?.communication ?? 0),
    });
    const [feedback, setFeedback] = useState(existingRating?.qualitativeFeedback ?? '');
    const [submitted, setSubmitted] = useState(!!existingRating);
    const [error, setError] = useState('');
    const [isPending, startTransition] = useTransition();

    const clientStatus = status.toLowerCase();
    const isCompleted = clientStatus.includes('hoàn tất') || clientStatus === 'completed';

    if (!isCompleted) {
        return (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur">
                <h3 className="text-white font-medium mb-2">Đánh giá dịch vụ</h3>
                <p className="text-zinc-500 text-sm">Bạn có thể đánh giá sau khi task được hoàn tất.</p>
            </div>
        );
    }

    if (submitted) {
        return (
            <div className="bg-emerald-950/20 border border-emerald-900/50 rounded-2xl p-8 backdrop-blur flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4">
                    <ThumbsUp className="text-emerald-400" size={24} />
                </div>
                <h3 className="text-emerald-400 font-medium mb-2">Cảm ơn bạn đã đánh giá!</h3>
                <p className="text-zinc-400 text-sm">Phản hồi của bạn giúp chúng tôi cải thiện dịch vụ và khen thưởng editor.</p>
                {existingRating && (
                    <div className="mt-4 space-y-1 text-sm">
                        <StarDisplay label="Sáng tạo" value={Number(existingRating.creativeQuality)} />
                        <StarDisplay label="Phản hồi nhanh" value={Number(existingRating.responsiveness)} />
                        <StarDisplay label="Giao tiếp" value={Number(existingRating.communication)} />
                    </div>
                )}
            </div>
        );
    }

    const handleRating = (category: keyof typeof ratings, value: number) => {
        setRatings(prev => ({ ...prev, [category]: value }));
    };

    const handleSubmit = () => {
        setError('');
        startTransition(async () => {
            const result = await submitTaskRating(
                taskId,
                ratings.creativeQuality,
                ratings.responsiveness,
                ratings.communication,
                feedback || undefined
            );
            if (result.success) {
                setSubmitted(true);
            } else {
                setError(result.error || 'Đã xảy ra lỗi.');
            }
        });
    };

    const isComplete = ratings.creativeQuality > 0 && ratings.responsiveness > 0 && ratings.communication > 0;

    return (
        <div className="bg-zinc-900/80 border border-indigo-500/20 shadow-[0_0_30px_rgba(99,102,241,0.05)] rounded-2xl p-6 backdrop-blur">
            <h3 className="text-white font-medium mb-1">Đánh giá bàn giao này</h3>
            <p className="text-zinc-400 text-xs mb-6">Vui lòng đánh giá editor trên các tiêu chí sau.</p>

            <div className="space-y-5 mb-6">
                <RatingRow label="Chất lượng sáng tạo" value={ratings.creativeQuality} onChange={(v) => handleRating('creativeQuality', v)} />
                <RatingRow label="Phản hồi nhanh" value={ratings.responsiveness} onChange={(v) => handleRating('responsiveness', v)} />
                <RatingRow label="Giao tiếp & Phối hợp" value={ratings.communication} onChange={(v) => handleRating('communication', v)} />
            </div>

            <div className="mb-6">
                <label className="block text-zinc-400 text-xs mb-2">Nhận xét thêm (Không bắt buộc)</label>
                <textarea
                    rows={3}
                    placeholder="Bạn thích điều gì? Điều gì có thể được cải thiện?"
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 resize-none transition-colors"
                />
            </div>

            {error && (
                <p className="text-red-400 text-sm mb-4">{error}</p>
            )}

            <button
                onClick={handleSubmit}
                disabled={!isComplete || isPending}
                className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${isComplete && !isPending
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/20'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    }`}
            >
                {isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {isPending ? 'Đang gửi...' : 'Gửi đánh giá'}
            </button>
        </div>
    );
}

function RatingRow({ label, value, onChange }: { label: string, value: number, onChange: (v: number) => void }) {
    const [hovered, setHovered] = useState(0);
    return (
        <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-300 font-medium">{label}</span>
            <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        onClick={() => onChange(star)}
                        onMouseEnter={() => setHovered(star)}
                        onMouseLeave={() => setHovered(0)}
                        className="focus:outline-none transition-transform hover:scale-110"
                    >
                        <Star
                            size={20}
                            className={star <= (hovered || value) ? 'fill-amber-400 text-amber-400' : 'text-zinc-700'}
                        />
                    </button>
                ))}
            </div>
        </div>
    );
}

function StarDisplay({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex items-center justify-between gap-4 text-zinc-400">
            <span>{label}</span>
            <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(s => (
                    <Star key={s} size={12} className={s <= value ? 'fill-amber-400 text-amber-400' : 'text-zinc-700'} />
                ))}
            </div>
        </div>
    );
}
