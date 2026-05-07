'use server'

import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { revalidatePath } from 'next/cache'
import { ScheduleExceptionType } from '@prisma/client'
import { getCurrentUser } from '@/lib/auth-guard'
import { verifyWorkspaceAccess } from '@/lib/security'

/**
 * Validates that the current user has permission to modify the target user's schedule.
 */
async function validateAccess(workspaceId: string, targetUserId: string, targetProfileId: string | undefined) {
  const user = await getCurrentUser()

  // Workspace membership is REQUIRED — even for self-schedule edits.
  // This prevents ex-members from modifying their own schedule data after removal.
  try {
    const { isGlobalAdmin, workspaceRole } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    // Workspace ADMIN/OWNER can modify any member's schedule
    if (isGlobalAdmin || workspaceRole === 'ADMIN' || workspaceRole === 'OWNER') return user
  } catch (e: any) {
    // SECURITY: If the user is not a member at all, block access completely.
    if (e?.message?.startsWith('SECURITY_VIOLATION')) throw e
    throw e
  }

  // MEMBER role confirmed — can only modify own schedule
  if (user.id !== targetUserId || user.profileId !== targetProfileId) {
    throw new Error('Bạn không có quyền thay đổi lịch của người khác hoặc profile khác.')
  }
  return user
}

/**
 * Creates or updates a recurring schedule rule for a user.
 */
export async function upsertScheduleRule(
  workspaceId: string,
  profileId: string | undefined,
  userId: string,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  timezone: string = 'Asia/Ho_Chi_Minh',
  updaterId?: string
) {
  if (!profileId) throw new Error("profileId is required")
  await validateAccess(workspaceId, userId, profileId)
  const prisma = getWorkspacePrisma(workspaceId, profileId)

  // Find existing rule
  const existing = await prisma.scheduleRule.findFirst({
    where: { userId, dayOfWeek }
  })

  if (existing) {
    const updated = await prisma.scheduleRule.update({
      where: { id: existing.id },
      data: {
        startTime,
        endTime,
        timezone,
        updatedById: updaterId,
        version: { increment: 1 }
      }
    })
    revalidatePath(`/${workspaceId}/admin/schedule`)
    revalidatePath(`/${workspaceId}/dashboard/schedule`)
    return updated
  } else {
    const created = await prisma.scheduleRule.create({
      data: {
        userId,
        dayOfWeek,
        startTime,
        endTime,
        timezone,
        updatedById: updaterId,
        workspaceId,
        profileId
      }
    })
    revalidatePath(`/${workspaceId}/admin/schedule`)
    revalidatePath(`/${workspaceId}/dashboard/schedule`)
    return created
  }
}

/**
 * Deletes a scheduled rule for a specific day.
 */
export async function deleteScheduleRule(
  workspaceId: string,
  profileId: string | undefined,
  ruleId: string
) {
  if (!profileId) throw new Error("profileId is required")
  const prisma = getWorkspacePrisma(workspaceId, profileId)
  const existing = await prisma.scheduleRule.findUnique({ where: { id: ruleId } })
  if (existing) {
    await validateAccess(workspaceId, existing.userId, profileId)
    await prisma.scheduleRule.delete({
      where: { id: ruleId }
    })
  }
  revalidatePath(`/${workspaceId}/admin/schedule`)
  revalidatePath(`/${workspaceId}/dashboard/schedule`)
}

/**
 * Creates an exception (BLOCK or ADD) for a specific date.
 * @param dateStr - Date in "YYYY-MM-DD" format (timezone-neutral). Do NOT pass a Date object.
 */
export async function createScheduleException(
  workspaceId: string,
  profileId: string | undefined,
  userId: string,
  dateStr: string,   // ← "YYYY-MM-DD" string, e.g. "2026-03-19"
  startTime: string,
  endTime: string,
  type: ScheduleExceptionType,
  reason?: string,
  timezone: string = 'Asia/Ho_Chi_Minh',
  creatorId?: string
) {
  if (!profileId) throw new Error("profileId is required")
  await validateAccess(workspaceId, userId, profileId)
  const prisma = getWorkspacePrisma(workspaceId, profileId)

  // Parse "YYYY-MM-DD" directly as UTC midnight → no timezone drift
  // e.g. "2026-03-19" → 2026-03-19T00:00:00.000Z regardless of server timezone
  const normalizeDate = new Date(dateStr + 'T00:00:00.000Z')

  const created = await prisma.scheduleException.create({
    data: {
      userId,
      date: normalizeDate,
      startTime,
      endTime,
      type,
      reason,
      timezone,
      updatedById: creatorId,
      workspaceId,
      profileId
    }
  })

  revalidatePath(`/${workspaceId}/admin/schedule`)
  revalidatePath(`/${workspaceId}/dashboard/schedule`)
  return created
}

/**
 * Creates multiple schedule exceptions in one transaction.
 * Useful for dragging across multiple days.
 */
export async function createBatchScheduleExceptions(
  workspaceId: string,
  profileId: string | undefined,
  userId: string,
  entries: { dateStr: string; startTime: string; endTime: string; type: ScheduleExceptionType; reason?: string }[],
  timezone: string = 'Asia/Ho_Chi_Minh',
  creatorId?: string
) {
  if (!entries.length) return { count: 0 }
  if (!profileId) throw new Error("profileId is required")
  await validateAccess(workspaceId, userId, profileId)
  const prisma = getWorkspacePrisma(workspaceId, profileId)
  
  const created = await prisma.$transaction(
    entries.map(e => prisma.scheduleException.create({
      data: {
        userId,
        date: new Date(e.dateStr + 'T00:00:00.000Z'),
        startTime: e.startTime,
        endTime: e.endTime,
        type: e.type,
        reason: e.reason,
        timezone,
        updatedById: creatorId,
        workspaceId,
        profileId
      }
    }))
  )

  revalidatePath(`/${workspaceId}/admin/schedule`)
  revalidatePath(`/${workspaceId}/dashboard/schedule`)
  return { count: created.length }
}

/**
 * Deletes a schedule exception.
 */
export async function deleteScheduleException(
  workspaceId: string,
  profileId: string | undefined,
  exceptionId: string
) {
  if (!profileId) throw new Error("profileId is required")
  const prisma = getWorkspacePrisma(workspaceId, profileId)
  const existing = await prisma.scheduleException.findUnique({ where: { id: exceptionId } })
  if (existing) {
    await validateAccess(workspaceId, existing.userId, profileId)
    await prisma.scheduleException.delete({
      where: { id: exceptionId }
    })
  }
  revalidatePath(`/${workspaceId}/admin/schedule`)
  revalidatePath(`/${workspaceId}/dashboard/schedule`)
}

/**
 * Core Algorithm: Calculates real-time availability for a user on a given date.
 * Formula: A(u, t) = (Base Recurring + ADD Exceptions) - BLOCK Exceptions
 * Returns the effective time ranges the user is available.
 */
export async function getEffectiveAvailability(
  workspaceId: string,
  profileId: string | undefined,
  userId: string,
  targetDate: Date
) {
  const prisma = getWorkspacePrisma(workspaceId, profileId)
  
  // Normalize date to UTC midnight
  const normalizedDate = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()))
  const dayOfWeek = targetDate.getUTCDay()

  // 1. Get base recurring rule
  const baseRule = await prisma.scheduleRule.findFirst({
    where: { userId, dayOfWeek }
  })

  // 2. Get exceptions for the specific date
  const exceptions = await prisma.scheduleException.findMany({
    where: { userId, date: normalizedDate }
  })

  const blocks = exceptions.filter(e => e.type === 'BLOCK')
  const adds = exceptions.filter(e => e.type === 'ADD')

  // We will return structured data for the UI to render the blocks
  // In a real sophisticated timeline, we would merge these ranges.
  // For now, we return the raw arrays so the frontend grid can paint them.
  return {
    date: normalizedDate,
    baseRule: baseRule ? { start: baseRule.startTime, end: baseRule.endTime } : null,
    adds: adds.map(a => ({ start: a.startTime, end: a.endTime, reason: a.reason, id: a.id })),
    blocks: blocks.map(b => ({ start: b.startTime, end: b.endTime, reason: b.reason, id: b.id }))
  }
}

/**
 * Deletes specific ScheduleException records by their IDs.
 * Used for right-click clear and drag-select clear.
 * ONLY deletes exceptions (BLOCK/ADD), never recurring ScheduleRules.
 */
export async function deleteScheduleExceptionsByIds(
  workspaceId: string,
  profileId: string | undefined,
  exceptionIds: string[]
) {
  if (!exceptionIds.length) return { deleted: 0 }
  if (!profileId) throw new Error("profileId is required")
  
  const prisma = getWorkspacePrisma(workspaceId, profileId)
  const samples = await prisma.scheduleException.findMany({ 
    where: { id: { in: exceptionIds } },
    take: 1
  })
  if (samples.length) {
    await validateAccess(workspaceId, samples[0].userId, profileId)
  }

  const result = await prisma.scheduleException.deleteMany({
    where: { id: { in: exceptionIds } }
  })
  revalidatePath(`/${workspaceId}/admin/schedule`)
  revalidatePath(`/${workspaceId}/dashboard/schedule`)
  return { deleted: result.count }
}

/**
 * Deletes ALL ScheduleExceptions for a specific user on a specific day.
 * Used for the "Clear All" trash button on each day column.
 * @param dateStr - "YYYY-MM-DD" string, timezone-neutral
 */
export async function deleteScheduleExceptionsForDay(
  workspaceId: string,
  profileId: string | undefined,
  userId: string,
  dateStr: string
) {
  if (!profileId) throw new Error("profileId is required")
  await validateAccess(workspaceId, userId, profileId)

  const prisma = getWorkspacePrisma(workspaceId, profileId)
  const date = new Date(dateStr + 'T00:00:00.000Z')
  const result = await prisma.scheduleException.deleteMany({
    where: { userId, date }
  })
  revalidatePath(`/${workspaceId}/admin/schedule`)
  revalidatePath(`/${workspaceId}/dashboard/schedule`)
  return { deleted: result.count }
}
