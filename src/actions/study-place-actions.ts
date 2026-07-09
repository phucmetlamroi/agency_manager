'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { verifyProfileAdminAccess } from '@/lib/security'
import {
    STUDY_PLACE_QUESTION_IDS,
    STUDY_PLACE_SET_ID,
    computeNextStudyProgress,
    type StudyPlaceProgressDTO,
    type StudyPlaceReviewInput,
} from '@/lib/study-place'

function serializeStudyProgress(row: {
    questionId: string
    easeFactor: number
    intervalDays: number
    repetition: number
    attempts: number
    correctAttempts: number
    lapses: number
    lastQuality: number | null
    bookmarked: boolean
    lastReviewedAt: Date | null
    nextReviewAt: Date | null
    masteredAt: Date | null
}): StudyPlaceProgressDTO {
    return {
        questionId: row.questionId,
        easeFactor: row.easeFactor,
        intervalDays: row.intervalDays,
        repetition: row.repetition,
        attempts: row.attempts,
        correctAttempts: row.correctAttempts,
        lapses: row.lapses,
        lastQuality: row.lastQuality,
        bookmarked: row.bookmarked,
        lastReviewedAt: row.lastReviewedAt?.toISOString() ?? null,
        nextReviewAt: row.nextReviewAt?.toISOString() ?? null,
        masteredAt: row.masteredAt?.toISOString() ?? null,
    }
}

function assertQuestion(questionId: string) {
    if (!STUDY_PLACE_QUESTION_IDS.has(questionId)) {
        throw new Error('Câu hỏi StudyPlace không hợp lệ.')
    }
}

export async function getStudyPlaceProgress(workspaceId: string, studySetId = STUDY_PLACE_SET_ID) {
    const access = await verifyProfileAdminAccess(workspaceId)
    const rows = await prisma.studyPlaceProgress.findMany({
        where: {
            workspaceId,
            userId: access.userId,
            studySetId,
        },
        orderBy: [{ nextReviewAt: 'asc' }, { questionId: 'asc' }],
        select: {
            questionId: true,
            easeFactor: true,
            intervalDays: true,
            repetition: true,
            attempts: true,
            correctAttempts: true,
            lapses: true,
            lastQuality: true,
            bookmarked: true,
            lastReviewedAt: true,
            nextReviewAt: true,
            masteredAt: true,
        },
    })

    return rows.map(serializeStudyProgress)
}

export async function reviewStudyPlaceQuestionAction(input: StudyPlaceReviewInput) {
    try {
        const studySetId = input.studySetId ?? STUDY_PLACE_SET_ID
        assertQuestion(input.questionId)
        const access = await verifyProfileAdminAccess(input.workspaceId)
        const current = await prisma.studyPlaceProgress.findUnique({
            where: {
                workspace_user_studySet_question: {
                    workspaceId: input.workspaceId,
                    userId: access.userId,
                    studySetId,
                    questionId: input.questionId,
                },
            },
            select: {
                easeFactor: true,
                intervalDays: true,
                repetition: true,
                attempts: true,
                correctAttempts: true,
                lapses: true,
                bookmarked: true,
            },
        })

        const next = computeNextStudyProgress(current, input.quality, input.isCorrect)
        const row = await prisma.studyPlaceProgress.upsert({
            where: {
                workspace_user_studySet_question: {
                    workspaceId: input.workspaceId,
                    userId: access.userId,
                    studySetId,
                    questionId: input.questionId,
                },
            },
            create: {
                workspaceId: input.workspaceId,
                userId: access.userId,
                studySetId,
                questionId: input.questionId,
                ...next,
            },
            update: {
                ...next,
                masteredAt: next.masteredAt,
            },
            select: {
                questionId: true,
                easeFactor: true,
                intervalDays: true,
                repetition: true,
                attempts: true,
                correctAttempts: true,
                lapses: true,
                lastQuality: true,
                bookmarked: true,
                lastReviewedAt: true,
                nextReviewAt: true,
                masteredAt: true,
            },
        })

        revalidatePath(`/${input.workspaceId}/admin/settings`)
        return { success: true as const, progress: serializeStudyProgress(row) }
    } catch (error: any) {
        console.error('[StudyPlace review]', error)
        return { error: error?.message || 'Không thể lưu tiến độ học.' }
    }
}

export async function toggleStudyPlaceBookmarkAction(input: {
    workspaceId: string
    studySetId?: string
    questionId: string
    bookmarked: boolean
}) {
    try {
        const studySetId = input.studySetId ?? STUDY_PLACE_SET_ID
        assertQuestion(input.questionId)
        const access = await verifyProfileAdminAccess(input.workspaceId)
        const row = await prisma.studyPlaceProgress.upsert({
            where: {
                workspace_user_studySet_question: {
                    workspaceId: input.workspaceId,
                    userId: access.userId,
                    studySetId,
                    questionId: input.questionId,
                },
            },
            create: {
                workspaceId: input.workspaceId,
                userId: access.userId,
                studySetId,
                questionId: input.questionId,
                bookmarked: input.bookmarked,
            },
            update: {
                bookmarked: input.bookmarked,
            },
            select: {
                questionId: true,
                easeFactor: true,
                intervalDays: true,
                repetition: true,
                attempts: true,
                correctAttempts: true,
                lapses: true,
                lastQuality: true,
                bookmarked: true,
                lastReviewedAt: true,
                nextReviewAt: true,
                masteredAt: true,
            },
        })

        revalidatePath(`/${input.workspaceId}/admin/settings`)
        return { success: true as const, progress: serializeStudyProgress(row) }
    } catch (error: any) {
        console.error('[StudyPlace bookmark]', error)
        return { error: error?.message || 'Không thể cập nhật bookmark.' }
    }
}

export async function resetStudyPlaceProgressAction(input: {
    workspaceId: string
    studySetId?: string
    questionId?: string
}) {
    try {
        const studySetId = input.studySetId ?? STUDY_PLACE_SET_ID
        const access = await verifyProfileAdminAccess(input.workspaceId)
        if (input.questionId) assertQuestion(input.questionId)

        await prisma.studyPlaceProgress.deleteMany({
            where: {
                workspaceId: input.workspaceId,
                userId: access.userId,
                studySetId,
                ...(input.questionId ? { questionId: input.questionId } : {}),
            },
        })

        revalidatePath(`/${input.workspaceId}/admin/settings`)
        return { success: true as const }
    } catch (error: any) {
        console.error('[StudyPlace reset]', error)
        return { error: error?.message || 'Không thể reset tiến độ học.' }
    }
}
