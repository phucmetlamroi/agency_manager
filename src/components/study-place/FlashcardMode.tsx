'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, RotateCw, Brain, ThumbsUp, ThumbsDown } from 'lucide-react'
import { QuestionData, useStudyStore } from '@/lib/store/useStudyStore'

interface FlashcardModeProps {
    questions: QuestionData[]
    onExit: () => void
}

export default function FlashcardMode({ questions, onExit }: FlashcardModeProps) {
    const { getDueQuestions, updateProgress } = useStudyStore()
    const [dueCards, setDueCards] = useState<QuestionData[]>([])
    const [currentIndex, setCurrentIndex] = useState(0)
    const [isFlipped, setIsFlipped] = useState(false)
    const [isFinished, setIsFinished] = useState(false)

    useEffect(() => {
        // Initialize due cards
        const due = getDueQuestions(questions)
        // Shuffle
        setDueCards(due.sort(() => Math.random() - 0.5))
    }, [questions, getDueQuestions])

    const handleRate = (quality: number) => {
        const currentQ = dueCards[currentIndex]
        updateProgress(currentQ.id, quality)
        
        setIsFlipped(false)
        setTimeout(() => {
            if (currentIndex + 1 < dueCards.length) {
                setCurrentIndex(currentIndex + 1)
            } else {
                setIsFinished(true)
            }
        }, 150)
    }

    if (dueCards.length === 0 || isFinished) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center h-[500px] bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 shadow-2xl">
                <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mb-6">
                    <Check className="w-10 h-10" />
                </div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">You're all caught up!</h2>
                <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-md">
                    You've reviewed all your due flashcards for now. Take a break and come back later.
                </p>
                <button
                    onClick={onExit}
                    className="px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-xl transition-all shadow-lg shadow-violet-500/25"
                >
                    Back to StudyPlace
                </button>
            </div>
        )
    }

    const card = dueCards[currentIndex]

    return (
        <div className="relative flex flex-col items-center justify-center min-h-[600px] w-full max-w-4xl mx-auto p-4">
            
            {/* Header / Progress */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4">
                <button onClick={onExit} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                    <X className="w-6 h-6" />
                </button>
                <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                    <Brain className="w-4 h-4 text-violet-500" />
                    <span>{currentIndex + 1} / {dueCards.length}</span>
                </div>
            </div>

            {/* Flashcard Area */}
            <div className="w-full max-w-2xl aspect-[4/3] perspective-[1000px] mt-12 relative group cursor-pointer" onClick={() => !isFlipped && setIsFlipped(true)}>
                <motion.div
                    className="w-full h-full relative preserve-3d"
                    animate={{ rotateY: isFlipped ? 180 : 0 }}
                    transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
                >
                    {/* Front of Card */}
                    <div className="absolute inset-0 backface-hidden bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-3xl p-8 md:p-12 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] border border-gray-200/50 dark:border-white/5 flex flex-col justify-center items-center text-center">
                        <h3 className="text-2xl md:text-3xl font-semibold text-gray-800 dark:text-gray-100 leading-relaxed">
                            {card.question}
                        </h3>
                        {!isFlipped && (
                            <div className="absolute bottom-8 text-gray-400 text-sm flex items-center gap-2 animate-pulse">
                                <RotateCw className="w-4 h-4" /> Tap to flip
                            </div>
                        )}
                    </div>

                    {/* Back of Card */}
                    <div className="absolute inset-0 backface-hidden rotate-y-180 bg-gradient-to-br from-violet-600 to-primary rounded-3xl p-8 md:p-12 shadow-[0_20px_50px_-12px_rgba(124,58,237,0.3)] border border-white/10 flex flex-col justify-center items-center text-center text-white">
                        <div className="w-full max-h-full overflow-y-auto custom-scrollbar pr-2">
                            <h4 className="text-sm font-medium text-violet-200 uppercase tracking-widest mb-4">Answer</h4>
                            <p className="text-2xl md:text-3xl font-bold mb-8 text-white">{card.correctAnswer}</p>
                            
                            <div className="w-full h-px bg-white/20 mb-8" />
                            
                            <h4 className="text-sm font-medium text-violet-200 uppercase tracking-widest mb-4">Explanation</h4>
                            <div className="text-lg md:text-xl text-violet-100 leading-relaxed whitespace-pre-wrap text-left bg-black/10 p-6 rounded-2xl backdrop-blur-sm">
                                {card.viTranslation}
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Controls */}
            <AnimatePresence>
                {isFlipped && (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="flex items-center gap-4 mt-12 w-full max-w-2xl"
                    >
                        <button
                            onClick={(e) => { e.stopPropagation(); handleRate(1) }}
                            className="flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-all border border-red-500/20 hover:-translate-y-1"
                        >
                            <ThumbsDown className="w-6 h-6" />
                            <span className="font-semibold">Hard</span>
                            <span className="text-xs opacity-70">Review soon</span>
                        </button>
                        
                        <button
                            onClick={(e) => { e.stopPropagation(); handleRate(3) }}
                            className="flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-all border border-amber-500/20 hover:-translate-y-1"
                        >
                            <RotateCw className="w-6 h-6" />
                            <span className="font-semibold">Good</span>
                            <span className="text-xs opacity-70">Got it with thought</span>
                        </button>
                        
                        <button
                            onClick={(e) => { e.stopPropagation(); handleRate(5) }}
                            className="flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-all border border-emerald-500/20 hover:-translate-y-1"
                        >
                            <ThumbsUp className="w-6 h-6" />
                            <span className="font-semibold">Easy</span>
                            <span className="text-xs opacity-70">Knew it instantly</span>
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
            
            <style jsx global>{`
                .perspective-[1000px] { perspective: 1000px; }
                .preserve-3d { transform-style: preserve-3d; }
                .backface-hidden { backface-visibility: hidden; }
                .rotate-y-180 { transform: rotateY(180deg); }
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 10px; }
            `}</style>
        </div>
    )
}
