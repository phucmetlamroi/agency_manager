'use client'

import { useState } from 'react';
import { Star, Send, ThumbsUp } from 'lucide-react';

interface RatingMicroSurveyProps {
    taskId: string;
    status: string;
}

export default function RatingMicroSurvey({ taskId, status }: RatingMicroSurveyProps) {
    const [ratings, setRatings] = useState({
        creativeQuality: 0,
        responsiveness: 0,
        communication: 0,
    });
    const [feedback, setFeedback] = useState('');
    const [submitted, setSubmitted] = useState(false);

    // Only show the survey if the task is completed
    if (status !== 'Completed' && status !== 'Hoàn tất') {
        return (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur">
                <h3 className="text-white font-medium mb-2">Service Evaluation</h3>
                <p className="text-zinc-500 text-sm">You can rate our service once the task is marked as Completed.</p>
            </div>
        );
    }

    if (submitted) {
        return (
            <div className="bg-emerald-950/20 border border-emerald-900/50 rounded-2xl p-8 backdrop-blur flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4">
                    <ThumbsUp className="text-emerald-400" size={24} />
                </div>
                <h3 className="text-emerald-400 font-medium mb-2">Thank you for your feedback!</h3>
                <p className="text-zinc-400 text-sm">Your ratings help us improve our service and reward our editors.</p>
            </div>
        );
    }

    const handleRating = (category: keyof typeof ratings, value: number) => {
        setRatings(prev => ({ ...prev, [category]: value }));
    };

    const handleSubmit = async () => {
        // In a real app, this would post to a server action
        // await submitTaskRating(taskId, ratings.creativeQuality, ratings.responsiveness, ratings.communication, feedback)
        setSubmitted(true);
    };

    const isComplete = ratings.creativeQuality > 0 && ratings.responsiveness > 0 && ratings.communication > 0;

    return (
        <div className="bg-zinc-900/80 border border-indigo-500/20 shadow-[0_0_30px_rgba(99,102,241,0.05)] rounded-2xl p-6 backdrop-blur">
            <h3 className="text-white font-medium mb-1">Rate this Delivery</h3>
            <p className="text-zinc-400 text-xs mb-6">Please evaluate the editor's performance across these dimensions.</p>

            <div className="space-y-5 mb-6">
                <RatingRow label="Creative Quality" value={ratings.creativeQuality} onChange={(v) => handleRating('creativeQuality', v)} />
                <RatingRow label="Responsiveness" value={ratings.responsiveness} onChange={(v) => handleRating('responsiveness', v)} />
                <RatingRow label="Communication" value={ratings.communication} onChange={(v) => handleRating('communication', v)} />
            </div>

            <div className="mb-6">
                <label className="block text-zinc-400 text-xs mb-2">Qualitative Feedback (Optional)</label>
                <textarea
                    rows={3}
                    placeholder="Tell us what you loved or what could be improved..."
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 resize-none transition-colors"
                ></textarea>
            </div>

            <button
                onClick={handleSubmit}
                disabled={!isComplete}
                className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${isComplete
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/20'
                        : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    }`}
            >
                <Send size={16} /> Submit Rating
            </button>
        </div>
    );
}

function RatingRow({ label, value, onChange }: { label: string, value: number, onChange: (v: number) => void }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-300 font-medium">{label}</span>
            <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        onClick={() => onChange(star)}
                        className="focus:outline-none transition-transform hover:scale-110"
                    >
                        <Star
                            size={20}
                            className={star <= value ? 'fill-amber-400 text-amber-400' : 'text-zinc-700'}
                        />
                    </button>
                ))}
            </div>
        </div>
    );
}
