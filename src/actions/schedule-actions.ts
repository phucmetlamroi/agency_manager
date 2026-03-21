'use server'

import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { revalidatePath } from 'next/cache'
import { ScheduleExceptionType } from '@prisma/client'

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
        updatedById: updaterId
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
  const prisma = getWorkspacePrisma(workspaceId, profileId)
  await prisma.scheduleRule.delete({
    where: { id: ruleId }
  })
  revalidatePath(`/${workspaceId}/admin/schedule`)
  revalidatePath(`/${workspaceId}/dashboard/schedule`)
}

/**
 * Creates an exception (BLOCK or ADD) for a specific date.
 */
export async function createScheduleException(
  workspaceId: string,
  profileId: string | undefined,
  userId: string,
  date: Date,
  startTime: string,
  endTime: string,
  type: ScheduleExceptionType,
  reason?: string,
  timezone: string = 'Asia/Ho_Chi_Minh',
  creatorId?: string
) {
  const prisma = getWorkspacePrisma(workspaceId, profileId)

  // Normalize date to midnight UTC using LOCAL date parts (not UTC parts) to prevent timezone shift.
  // e.g. UTC+7: "2026-03-17 00:00 +07:00" → UTC "2026-03-16 17:00" → getUTCDate()=16 ❌ (wrong)
  //            → getFullYear/Month/Date = 2026/2/16 → Date.UTC → "2026-03-17 00:00 UTC" ✅
  const normalizeDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))

  const created = await prisma.scheduleException.create({
    data: {
      userId,
      date: normalizeDate,
      startTime,
      endTime,
      type,
      reason,
      timezone,
      updatedById: creatorId
    }
  })

  revalidatePath(`/${workspaceId}/admin/schedule`)
  revalidatePath(`/${workspaceId}/dashboard/schedule`)
  return created
}

/**
 * Deletes a schedule exception.
 */
export async function deleteScheduleException(
  workspaceId: string,
  profileId: string | undefined,
  exceptionId: string
) {
  const prisma = getWorkspacePrisma(workspaceId, profileId)
  await prisma.scheduleException.delete({
    where: { id: exceptionId }
  })
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
