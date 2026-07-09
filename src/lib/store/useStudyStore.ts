import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type QuestionData = {
    id: string
    question: string
    options: string[]
    correctAnswer: string
    viTranslation: string
}

export type StudyProgress = {
    [questionId: string]: {
        isMastered: boolean
        lastReviewed: number // timestamp
        easeFactor: number   // for spaced repetition (SuperMemo-2 based)
        interval: number     // days until next review
        repetition: number   // number of successful reviews in a row
    }
}

interface StudyState {
    progress: StudyProgress
    updateProgress: (questionId: string, quality: number) => void // quality: 0-5
    resetProgress: () => void
    getDueQuestions: (questions: QuestionData[]) => QuestionData[]
}

export const useStudyStore = create<StudyState>()(
    persist(
        (set, get) => ({
            progress: {},
            
            // SM-2 Algorithm implementation
            updateProgress: (questionId, quality) => {
                set((state) => {
                    const current = state.progress[questionId] || {
                        isMastered: false,
                        lastReviewed: 0,
                        easeFactor: 2.5,
                        interval: 0,
                        repetition: 0
                    }
                    
                    let newEaseFactor = current.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
                    if (newEaseFactor < 1.3) newEaseFactor = 1.3
                    
                    let newInterval = 0
                    let newRepetition = 0
                    
                    if (quality >= 3) {
                        if (current.repetition === 0) newInterval = 1
                        else if (current.repetition === 1) newInterval = 6
                        else newInterval = Math.round(current.interval * newEaseFactor)
                        newRepetition = current.repetition + 1
                    } else {
                        newRepetition = 0
                        newInterval = 1
                    }
                    
                    return {
                        progress: {
                            ...state.progress,
                            [questionId]: {
                                isMastered: quality >= 4 && newRepetition > 3,
                                lastReviewed: Date.now(),
                                easeFactor: newEaseFactor,
                                interval: newInterval,
                                repetition: newRepetition
                            }
                        }
                    }
                })
            },
            
            resetProgress: () => set({ progress: {} }),
            
            getDueQuestions: (questions) => {
                const now = Date.now()
                const { progress } = get()
                
                return questions.filter(q => {
                    const p = progress[q.id]
                    if (!p) return true // never seen
                    
                    const nextReviewDate = p.lastReviewed + p.interval * 24 * 60 * 60 * 1000
                    return now >= nextReviewDate
                })
            }
        }),
        {
            name: 'hustlytasker-studyplace-storage',
            storage: createJSONStorage(() => localStorage),
        }
    )
)
