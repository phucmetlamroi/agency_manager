'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, Brain, ChevronRight, AlertCircle } from 'lucide-react'
import { QuestionData, useStudyStore } from '@/lib/store/useStudyStore'

interface QuizModeProps {
    questions: QuestionData[]
    onExit: () => void
}

export default function QuizMode({ questions, onExit }: QuizModeProps) {
    const { getDueQuestions, updateProgress } = useStudyStore()
    const [dueCards, setDueCards] = useState<QuestionData[]>([])
    const [currentIndex, setCurrentIndex] = useState(0)
    const [selectedOption, setSelectedOption] = useState<string | null>(null)
    const [isFinished, setIsFinished] = useState(false)

    useEffect(() => {
        const due = getDueQuestions(questions)
        // Shuffle options for each question to avoid pattern memorization
        const prepared = due.map(q => ({
            ...q,
            options: [...q.options].sort(() => Math.random() - 0.5)
        })).sort(() => Math.random() - 0.5)
        setDueCards(prepared)
    }, [questions, getDueQuestions])

    const handleSelect = (option: string) => {
        if (selectedOption) return // already answered
        setSelectedOption(option)
        
        const card = dueCards[currentIndex]
        const isCorrect = option === card.correctAnswer
        
        // Update SM-2 state
        // Quiz is binary, so we map correct to quality=4 (good), incorrect to quality=1 (hard)
        updateProgress(card.id, isCorrect ? 4 : 1)
    }

    const nextQuestion = () => {
        setSelectedOption(null)
        if (currentIndex + 1 < dueCards.length) {
            setCurrentIndex(currentIndex + 1)
        } else {
            setIsFinished(true)
        }
    }

    if (dueCards.length === 0 || isFinished) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center h-[500px] bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 shadow-2xl">
                <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mb-6">
                    <Check className="w-10 h-10" />
                </div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Quiz Complete!</h2>
                <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-md">
                    You've answered all due questions. Check back tomorrow for more spaced repetition review.
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
    const isCorrect = selectedOption === card.correctAnswer

    return (
        <div className="relative flex flex-col min-h-[600px] w-full max-w-4xl mx-auto p-4 md:p-8">
            
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <button onClick={onExit} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
                    <X className="w-5 h-5" /> Exit Quiz
                </button>
                <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 text-sm font-semibold">
                    <Brain className="w-4 h-4" />
                    <span>Question {currentIndex + 1} of {dueCards.length}</span>
                </div>
            </div>

            {/* Question */}
            <div className="bg-white dark:bg-gray-800/50 backdrop-blur-xl border border-gray-200 dark:border-white/5 p-8 rounded-3xl shadow-xl shadow-gray-200/50 dark:shadow-black/20 mb-8">
                <h3 className="text-xl md:text-2xl font-semibold text-gray-800 dark:text-gray-100 leading-relaxed">
                    {card.question}
                </h3>
            </div>

            {/* Options */}
            <div className="grid gap-4 w-full">
                {card.options.map((opt, i) => {
                    const isSelected = selectedOption === opt
                    const isCorrectOption = opt === card.correctAnswer
                    
                    let bgClass = "bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 border-gray-200 dark:border-white/5"
                    let textClass = "text-gray-700 dark:text-gray-200"
                    let icon = null

                    if (selectedOption) {
                        if (isCorrectOption) {
                            bgClass = "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500/50 shadow-emerald-500/20"
                            textClass = "text-emerald-700 dark:text-emerald-400 font-medium"
                            icon = <Check className="w-5 h-5 text-emerald-500" />
                        } else if (isSelected) {
                            bgClass = "bg-red-50 dark:bg-red-500/10 border-red-500/50"
                            textClass = "text-red-700 dark:text-red-400 font-medium"
                            icon = <X className="w-5 h-5 text-red-500" />
                        } else {
                            bgClass = "bg-white/50 dark:bg-gray-800/50 border-transparent opacity-50"
                        }
                    }

                    return (
                        <button
                            key={i}
                            onClick={() => handleSelect(opt)}
                            disabled={!!selectedOption}
                            className={`flex items-center justify-between w-full p-5 rounded-2xl border text-left transition-all duration-300 ${bgClass}`}
                        >
                            <span className={`text-lg ${textClass}`}>{opt}</span>
                            {icon}
                        </button>
                    )
                })}
            </div>

            {/* Explanation / Next button */}
            <AnimatePresence>
                {selectedOption && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="mt-8 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-white/10 rounded-2xl p-6 shadow-lg"
                    >
                        <div className="flex items-start gap-4">
                            <div className={`p-2 rounded-xl shrink-0 ${isCorrect ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-500'}`}>
                                {isCorrect ? <Check className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                            </div>
                            <div className="flex-1">
                                <h4 className="text-lg font-bold mb-2 text-gray-900 dark:text-white">
                                    {isCorrect ? "Correct!" : "Incorrect"}
                                </h4>
                                <div className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed text-sm bg-black/5 dark:bg-black/20 p-4 rounded-xl border border-black/5 dark:border-white/5">
                                    {card.viTranslation}
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={nextQuestion}
                                className="flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-xl transition-all shadow-lg shadow-violet-500/25"
                            >
                                Next Question <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    )
}
