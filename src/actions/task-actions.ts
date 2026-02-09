'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { FeedbackSource } from '@prisma/client'
import { validateTransition, TaskState } from '@/lib/fsm-config'

import { getCurrentUser } from '@/lib/auth-guard'

export async function updateTaskStatus(id: string, newStatus: string, newNotes?: string, feedbackData?: { type: FeedbackSource, content: string }, currentVersion?: number) {
    try {
        // --- LAYER 1 & 2: AUTH & CONTEXT ---
        const user = await getCurrentUser()

        // --- LAYER 3: DATA SCOPE ---
        const task = await prisma.task.findUnique({
            where: { id },
            include: { assignee: true }
        })

        if (!task) return { error: 'Task not found' }

        // RBAC CHECK:
        if (!user.isSuperAdmin) {
            // Case 1: Agency Owner
            if (user.isAgencyOwner) {
                // Can update any task assigned to their agency
                if (task.assignedAgencyId !== user.ownedAgencyId) {
                    return { error: 'Forbidden: Bạn không có quyền thao tác trên Task của Agency khác.' }
                }
            }
            // Case 2: Staff / Freelancer
            else {
                // Can ONLY update tasks assigned to themselves
                if (task.assigneeId !== user.id) {
                    return { error: 'Forbidden: Bạn chỉ được cập nhật Task của chính mình.' }
                }
            }
        }

        // --- FSM GUARD (Enterprise Logic) ---
        // Validate if this state transition is legal according to strict rules
        const transitionCheck = validateTransition(task.status, newStatus)
        if (!transitionCheck.isValid) {
            console.error(`[FSM Block] Invalid Transition: ${task.status} -> ${newStatus}`)
            return { error: `Lỗi quy trình: ${transitionCheck.error}` } // Return user-friendly FSM error
        }

        // OPTIMISTIC LOCKING CHECK (Concurrency Control)
        if (typeof currentVersion === 'number' && task.version !== currentVersion) {
            return { error: 'Task has been updated by someone else. Please refresh.' } // UI should handle this
        }

        // Logic: Clear deadline if 'Tạm ngưng'. Revision shouldn't clear deadline unless explicitly asked.
        const restrictedStatuses = ['Tạm ngưng', 'Revision']
        // Existing Deadline clear logic
        const deadlineUpdate = restrictedStatuses.includes(newStatus) ? { deadline: null } : {}

        // --- SMART STOPWATCH LOGIC ---
        const isRunningState = ['Đang thực hiện'].includes(newStatus)
        const isStoppedState = newStatus === 'Hoàn tất'
        // Review is PAUSED (implicit fallback in else block below)
        // const isPaused = ['Tạm ngưng', 'Đang đợi giao'].includes(newStatus)

        let timerUpdate = {}
        const currentTimerStatus = task.timerStatus
        const nowTime = new Date()

        // 1. RESET LOGIC (User Request) OR UNASSIGN (Admin)
        if (newStatus === 'Đã nhận task') {
            timerUpdate = {
                timerStatus: 'STOPPED',
                timerStartedAt: null, // Reset start time
                accumulatedSeconds: 0 // Reset accumulated time
            }
        }
        else if (newStatus === 'Đang đợi giao') {
            // UNASSIGN LOGIC: Clear Assignee and Reset everything
            timerUpdate = {
                status: 'Đang đợi giao',
                assigneeId: null,
                timerStatus: 'STOPPED',
                timerStartedAt: null,
                accumulatedSeconds: 0
            }
        }
        // 2. STOP LOGIC
        else if (isStoppedState) {
            if (currentTimerStatus === 'RUNNING' && task.timerStartedAt) {
                const elapsed = Math.floor((nowTime.getTime() - task.timerStartedAt.getTime()) / 1000)
                timerUpdate = {
                    timerStatus: 'STOPPED',
                    timerStartedAt: null,
                    accumulatedSeconds: task.accumulatedSeconds + elapsed
                }
            } else {
                timerUpdate = {
                    timerStatus: 'STOPPED',
                    timerStartedAt: null
                }
            }
        }
        // 3. START / RESUME LOGIC
        else if (isRunningState) {
            if (currentTimerStatus !== 'RUNNING') {
                timerUpdate = {
                    timerStatus: 'RUNNING',
                    timerStartedAt: nowTime
                }
            }
        }
        // 4. PAUSE LOGIC
        else {
            if (currentTimerStatus === 'RUNNING' && task.timerStartedAt) {
                const elapsed = Math.floor((nowTime.getTime() - task.timerStartedAt.getTime()) / 1000)
                timerUpdate = {
                    timerStatus: 'PAUSED',
                    timerStartedAt: null,
                    accumulatedSeconds: task.accumulatedSeconds + elapsed
                }
            } else {
                timerUpdate = {
                    timerStatus: 'PAUSED',
                    timerStartedAt: null
                }
            }
        }

        // --- TRANSACTION BLOCK ---
        // Ensure Atomicity: Feedback + Reputation + Task Status must succeed or fail together.
        const transactionResult = await prisma.$transaction(async (tx) => {
            // 1. Create Feedback (if applicable)
            if (newStatus === 'Revision' && feedbackData) {
                await tx.feedback.create({
                    data: {
                        content: feedbackData.content,
                        type: feedbackData.type,
                        taskId: id,
                        projectId: task.projectId
                    }
                })
            }

            // 2. Logic: Reward if Completed Early/On-Time (Reputation)
            if (newStatus === 'Hoàn tất' && task.status !== 'Hoàn tất' && task.deadline && task.assignee) {
                const now = new Date()
                if (now <= task.deadline) {
                    if (task.assignee.reputation < 100) {
                        const newRep = Math.min(task.assignee.reputation + 5, 100)
                        await tx.user.update({
                            where: { id: task.assignee.id },
                            data: { reputation: newRep }
                        })
                    }
                }
            }

            // 3. Update Task Status
            const updateData = {
                status: newStatus,
                ...(newNotes ? { notes: newNotes } : {}),
                ...deadlineUpdate,
                ...timerUpdate,
                version: { increment: 1 }
            }

            let result
            if (typeof currentVersion === 'number') {
                result = await tx.task.updateMany({
                    where: {
                        id,
                        version: currentVersion
                    },
                    data: updateData
                })
            } else {
                result = await tx.task.updateMany({
                    where: { id },
                    data: updateData
                })
            }

            return result
        })

        if (transactionResult.count === 0) {
            // Check if task exists to distinguish found vs version mismatch
            const exists = await prisma.task.findUnique({ where: { id } })
            if (!exists) return { error: 'Task not found' }
            return { error: 'Task has been modified by another user. Please refresh.' } // Concurrency Error
        }

        // Fetch updated task for Emails & Return
        const updatedTaskResult = await prisma.task.findUnique({
            where: { id },
            include: { assignee: true }
        })

        if (!updatedTaskResult) return { error: 'Error fetching updated task' }

        // --- EMAIL TRIGGERS ---
        console.log(`[Email Debug] Status changed to: ${newStatus}`)

        try {
            const { sendEmail } = await import('@/lib/email')
            const { emailTemplates } = await import('@/lib/email-templates')

                // FIRE-AND-FORGET EMAIL LOGIC (Non-blocking)
                // We do NOT await this block to ensure UI is snappy
                ; (async () => {
                    try {
                        // TRIGGER 2 & 2b: Employee Started Task OR Admin Resumed form Revision
                        if (newStatus === 'Đang thực hiện' && updatedTaskResult.assignee) {
                            // Check if we are resuming from Revision (Admin action "Đã FB")
                            if (task.status === 'Revision') {
                                // Notify User that they can continue
                                if (updatedTaskResult.assignee.email) {
                                    console.log(`[Email Debug] Triggering 'Feedback Resolved' email to ${updatedTaskResult.assignee.email}`)
                                    await sendEmail({
                                        to: updatedTaskResult.assignee.email,
                                        subject: `[Update] Admin đã phản hồi task: ${updatedTaskResult.title}`,
                                        html: emailTemplates.taskFeedback(
                                            updatedTaskResult.assignee.username || 'User',
                                            updatedTaskResult.title,
                                            newNotes || "Admin đã hoàn tất feedback/check frame. Bạn có thể tiếp tục công việc." // Generic message since we don't have input
                                        )
                                    })
                                }
                            } else {
                                // Normal Start (Notify Admin Fixed Email)
                                // FALLBACK: If env is missing, use hardcoded email to ensure delivery for testing
                                const adminEmail = process.env.SENDGRID_FROM_EMAIL || 'mullerjohannes762@gmail.com'

                                console.log(`[Email Debug] START TASK DETECTED. Target Admin: ${adminEmail}`)

                                if (adminEmail) {
                                    try {
                                        await sendEmail({
                                            to: adminEmail,
                                            subject: `[STARTED] ${updatedTaskResult.assignee.username} đã bắt đầu task: ${updatedTaskResult.title}`,
                                            html: emailTemplates.taskStarted(
                                                updatedTaskResult.assignee.nickname || updatedTaskResult.assignee.username, // Use Nickname
                                                updatedTaskResult.title,
                                                new Date(),
                                                updatedTaskResult.id
                                            )
                                        })
                                        console.log('[Email Debug] Start Email SENT successfully.')
                                    } catch (err) {
                                        console.error('[Email Debug] FAILED to send Start Email:', err)
                                    }
                                } else {
                                    console.error('[Email Debug] Critical: No Admin Email found.')
                                }
                            }
                        }

                        // TRIGGER 2: Submission / Review (To User & Admin)
                        if (newStatus === 'Review') {
                            if (updatedTaskResult.assignee?.email) {
                                console.log(`[Email Debug] Triggering SUBMISSION email to ${updatedTaskResult.assignee.email}`)
                                await sendEmail({
                                    to: updatedTaskResult.assignee.email,
                                    subject: `[Submission] Task "${updatedTaskResult.title}" đang chờ Admin phản hồi`,
                                    html: emailTemplates.taskSubmitted(
                                        updatedTaskResult.assignee.username || 'User',
                                        updatedTaskResult.title
                                    )
                                })
                            }

                            // Also notify Admins
                            const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { email: true } })
                            for (const admin of admins) {
                                if (admin.email) {
                                    // Optional: Separate Admin Notification Template
                                    // For now we just assume Admin checks dashboard, but good to have.
                                }
                            }
                        }

                        // TRIGGER 3: Feedback / Revision (To User)
                        if (newStatus === 'Revision') {
                            if (updatedTaskResult.assignee?.email) {
                                console.log(`[Email Debug] Triggering Feedback email to ${updatedTaskResult.assignee.email}`)
                                await sendEmail({
                                    to: updatedTaskResult.assignee.email,
                                    subject: `[Action Required] Admin đã gửi Feedback cho task: ${updatedTaskResult.title}`,
                                    html: emailTemplates.taskFeedback(
                                        updatedTaskResult.assignee.username || 'User',
                                        updatedTaskResult.title,
                                        newNotes || updatedTaskResult.notes || 'Vui lòng kiểm tra chi tiết trên hệ thống.'
                                    )
                                })
                            } else {
                                console.log('[Email Debug] Skipped Feedback email: Assignee has no email.')
                            }
                        }

                        // TRIGGER 4: Completed (To User)
                        if (newStatus === 'Hoàn tất') {
                            if (updatedTaskResult.assignee?.email) {
                                console.log(`[Email Debug] Triggering Completed email to ${updatedTaskResult.assignee.email}`)
                                // NOTE: Removed [Approved] prefix as per User Request "Tiêu đề: [Success]..."
                                await sendEmail({
                                    to: updatedTaskResult.assignee.email,
                                    subject: `[Success] Chúc mừng! Task "${updatedTaskResult.title}" đã hoàn thành 🎉`,
                                    html: emailTemplates.taskCompleted(
                                        updatedTaskResult.assignee.username || 'User',
                                        updatedTaskResult.title,
                                        Number(updatedTaskResult.wageVND || 0)
                                    )
                                })
                            } else {
                                console.log('[Email Debug] Skipped Completed email: Assignee has no email.')
                            }
                        }
                    } catch (emailErr) {
                        console.error('[Email Debug] Error in email logic (Async):', emailErr)
                    }
                })()
        } catch (err) {
            console.error('[Email Debug] Failed to load email module:', err)
        }

        // -----------------------

        // Return final accumulated seconds (plus current elapsed if it was running) for the UI Log
        let finalSeconds = task.accumulatedSeconds
        if (task.timerStatus === 'RUNNING' && task.timerStartedAt) {
            const elapsed = Math.floor((nowTime.getTime() - task.timerStartedAt.getTime()) / 1000)
            finalSeconds += elapsed
        }

        revalidatePath('/admin')
        revalidatePath('/dashboard')
        revalidatePath('/admin/payroll')

        return { success: true, finalSeconds }
    } catch (e: any) {
        console.error('Update Task Status Error:', e)
        return { error: e.message || 'Failed' }
    }
}
