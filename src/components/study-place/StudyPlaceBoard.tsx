'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, BrainCircuit, Trophy, ArrowRight, Zap, Target } from 'lucide-react'
import { useStudyStore, QuestionData } from '@/lib/store/useStudyStore'
import FlashcardMode from './FlashcardMode'
import QuizMode from './QuizMode'

// Import data
import studyData from '@/lib/study-place-data.json'
const questions: QuestionData[] = studyData as QuestionData[]

export default function StudyPlaceBoard() {
    const { progress, getDueQuestions } = useStudyStore()
    const [mode, setMode] = useState<'BOARD' | 'FLASHCARDS' | 'QUIZ'>('BOARD')

    const dueQuestions = getDueQuestions(questions)
    const masteredCount = Object.values(progress).filter(p => p.isMastered).length
    const totalCount = questions.length
    const progressPercent = Math.round((masteredCount / totalCount) * 100) || 0

    if (mode === 'FLASHCARDS') {
        return <FlashcardMode questions={questions} onExit={() => setMode('BOARD')} />
    }

    if (mode === 'QUIZ') {
        return <QuizMode questions={questions} onExit={() => setMode('BOARD')} />
    }

    return (
        <div className="w-full max-w-5xl mx-auto space-y-8 p-4 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Hero Section */}
            <div className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-700 rounded-3xl p-8 md:p-12 text-white shadow-2xl shadow-indigo-500/25">
                <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
                    <BrainCircuit className="w-64 h-64 rotate-12" />
                </div>
                
                <div className="relative z-10 max-w-2xl">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-6">
                        <Zap className="w-4 h-4 text-amber-300" />
                        <span className="text-sm font-semibold tracking-wide text-amber-50">Active Recall & Spaced Repetition</span>
                    </div>
                    
                    <h1 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">StudyPlace</h1>
                    <p className="text-lg md:text-xl text-indigo-100 mb-8 max-w-xl leading-relaxed">
                        Master your knowledge efficiently. The algorithm adapts to your memory, showing you what you need to review, exactly when you need to review it.
                    </p>
                    
                    <div className="flex flex-wrap gap-4">
                        <button 
                            onClick={() => setMode('FLASHCARDS')}
                            className="flex items-center gap-3 px-8 py-4 bg-white text-indigo-600 hover:bg-gray-50 font-bold rounded-2xl transition-all hover:scale-105 shadow-xl shadow-black/10"
                        >
                            <BookOpen className="w-5 h-5" />
                            Learn Flashcards
                        </button>
                        <button 
                            onClick={() => setMode('QUIZ')}
                            className="flex items-center gap-3 px-8 py-4 bg-indigo-500/30 hover:bg-indigo-500/50 backdrop-blur-sm border border-white/20 text-white font-bold rounded-2xl transition-all hover:scale-105"
                        >
                            <Target className="w-5 h-5" />
                            Take a Quiz
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Due for Review */}
                <div className="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-3xl p-6 md:p-8 border border-gray-200 dark:border-white/5 shadow-xl shadow-gray-200/50 dark:shadow-black/20 flex flex-col justify-between group hover:border-amber-500/50 transition-colors">
                    <div className="flex justify-between items-start mb-6">
                        <div className="p-4 rounded-2xl bg-amber-500/10 text-amber-500">
                            <BrainCircuit className="w-8 h-8" />
                        </div>
                    </div>
                    <div>
                        <div className="text-4xl font-black text-gray-900 dark:text-white mb-2">{dueQuestions.length}</div>
                        <div className="text-sm font-semibold text-gray-500 uppercase tracking-widest">Due for Review</div>
                    </div>
                </div>

                {/* Mastered */}
                <div className="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-3xl p-6 md:p-8 border border-gray-200 dark:border-white/5 shadow-xl shadow-gray-200/50 dark:shadow-black/20 flex flex-col justify-between group hover:border-emerald-500/50 transition-colors">
                    <div className="flex justify-between items-start mb-6">
                        <div className="p-4 rounded-2xl bg-emerald-500/10 text-emerald-500">
                            <Trophy className="w-8 h-8" />
                        </div>
                    </div>
                    <div>
                        <div className="text-4xl font-black text-gray-900 dark:text-white mb-2">{masteredCount} <span className="text-xl text-gray-400 font-medium">/ {totalCount}</span></div>
                        <div className="text-sm font-semibold text-gray-500 uppercase tracking-widest">Mastered</div>
                    </div>
                </div>

                {/* Overall Progress */}
                <div className="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-3xl p-6 md:p-8 border border-gray-200 dark:border-white/5 shadow-xl shadow-gray-200/50 dark:shadow-black/20 flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-6">
                        <div className="p-4 rounded-2xl bg-blue-500/10 text-blue-500">
                            <Target className="w-8 h-8" />
                        </div>
                        <div className="text-2xl font-bold text-blue-500">{progressPercent}%</div>
                    </div>
                    <div className="space-y-4">
                        <div className="w-full h-3 bg-gray-100 dark:bg-gray-700/50 rounded-full overflow-hidden">
                            <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${progressPercent}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
                            />
                        </div>
                        <div className="text-sm font-semibold text-gray-500 uppercase tracking-widest">Total Progress</div>
                    </div>
                </div>

            </div>
        </div>
    )
}
