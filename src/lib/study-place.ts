import studyData from '@/lib/study-place-data.json'

export const STUDY_PLACE_SET_ID = 'vietnam-culture-review-2026-07'

export type StudyPlaceKeyTerm = {
    term: string
    meaning: string
    note: string
}

export type StudyPlaceQuestion = {
    id: string
    question: string
    options: string[]
    correctAnswer: string
    sourceScore?: string
    selectedAnswer?: string | null
    viTranslation: string
    viExplanation?: string
    whyCorrect?: string
    keyTerms?: StudyPlaceKeyTerm[]
    grammarNotes?: string[]
    memoryHook?: string
    tags?: string[]
    checksum?: string
}

export type StudyPlaceProgressDTO = {
    questionId: string
    easeFactor: number
    intervalDays: number
    repetition: number
    attempts: number
    correctAttempts: number
    lapses: number
    lastQuality: number | null
    bookmarked: boolean
    lastReviewedAt: string | null
    nextReviewAt: string | null
    masteredAt: string | null
}

export type StudyPlaceReviewInput = {
    workspaceId: string
    studySetId?: string
    questionId: string
    quality: number
    isCorrect?: boolean
}

export const STUDY_PLACE_QUESTIONS = studyData as StudyPlaceQuestion[]

export const STUDY_PLACE_QUESTION_IDS = new Set(STUDY_PLACE_QUESTIONS.map((question) => question.id))

export function getStudyPlaceQuestion(questionId: string) {
    return STUDY_PLACE_QUESTIONS.find((question) => question.id === questionId) ?? null
}

export function isStudyPlaceDue(progress: StudyPlaceProgressDTO | undefined, now = Date.now()) {
    if (!progress || !progress.nextReviewAt) return true
    return new Date(progress.nextReviewAt).getTime() <= now
}

export function normalizeRecallText(value: string) {
    return value
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/["'“”‘’.,!?;:()[\]{}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

export function isCloseRecallAnswer(input: string, answer: string) {
    const normalizedInput = normalizeRecallText(input)
    const normalizedAnswer = normalizeRecallText(answer)
    if (!normalizedInput) return false
    if (normalizedInput === normalizedAnswer) return true
    if (normalizedAnswer.length <= 12) return normalizedInput.includes(normalizedAnswer) || normalizedAnswer.includes(normalizedInput)

    const answerTokens = new Set(normalizedAnswer.split(' ').filter((token) => token.length > 2))
    const inputTokens = new Set(normalizedInput.split(' ').filter((token) => token.length > 2))
    if (answerTokens.size === 0) return false
    let hits = 0
    answerTokens.forEach((token) => {
        if (inputTokens.has(token)) hits += 1
    })
    return hits / answerTokens.size >= 0.7
}

export function computeNextStudyProgress(current: {
    easeFactor: number
    intervalDays: number
    repetition: number
    attempts: number
    correctAttempts: number
    lapses: number
} | null, quality: number, isCorrect?: boolean, now = new Date()) {
    const safeQuality = Math.max(0, Math.min(5, Math.round(quality)))
    const base = current ?? {
        easeFactor: 2.5,
        intervalDays: 0,
        repetition: 0,
        attempts: 0,
        correctAttempts: 0,
        lapses: 0,
    }

    const qualityGap = 5 - safeQuality
    const easeFactor = Math.max(1.3, base.easeFactor + (0.1 - qualityGap * (0.08 + qualityGap * 0.02)))
    const answeredCorrectly = isCorrect ?? safeQuality >= 3
    let repetition = 0
    let intervalDays = 0
    let nextReviewAt = new Date(now)
    let masteredAt: Date | null = null
    let lapses = base.lapses

    if (safeQuality <= 1) {
        lapses += 1
        nextReviewAt = new Date(now.getTime() + 20 * 60 * 1000)
    } else if (safeQuality === 2) {
        lapses += 1
        intervalDays = 1
        nextReviewAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000)
    } else {
        repetition = base.repetition + 1
        if (repetition === 1) intervalDays = safeQuality === 5 ? 2 : 1
        else if (repetition === 2) intervalDays = safeQuality === 5 ? 6 : safeQuality === 4 ? 4 : 3
        else {
            const multiplier = safeQuality === 5 ? 1.25 : safeQuality === 3 ? 0.8 : 1
            intervalDays = Math.max(1, Math.round(base.intervalDays * easeFactor * multiplier))
        }
        intervalDays = Math.min(intervalDays, 365)
        nextReviewAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000)
        if (safeQuality >= 4 && repetition >= 4) masteredAt = now
    }

    return {
        easeFactor,
        intervalDays,
        repetition,
        attempts: base.attempts + 1,
        correctAttempts: base.correctAttempts + (answeredCorrectly ? 1 : 0),
        lapses,
        lastQuality: safeQuality,
        lastReviewedAt: now,
        nextReviewAt,
        masteredAt,
    }
}
