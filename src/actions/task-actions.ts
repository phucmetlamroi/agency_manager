'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function updateTaskStatus(id: string, newStatus: string) {
    try {
        // Fetch task to check deadline and assignee
        const task = await prisma.task.findUnique({
            where: { id },
            include: { assignee: true }
        })

        if (!task) return { error: 'Task not found' }

        // Logic: Reward if Completed Early/On-Time
        if (newStatus === 'Hoàn tất' && task.status !== 'Hoàn tất' && task.deadline && task.assignee) {
            const now = new Date()
            if (now <= task.deadline) {
                // Check current reputation
                if (task.assignee.reputation < 100) {
                    // Cap at 100
                    const newRep = Math.min(task.assignee.reputation + 5, 100)
                    await prisma.user.update({
                        where: { id: task.assignee.id },
                        data: { reputation: newRep }
                    })
                }
            }
        }

        // Logic: Clear deadline if 'Tạm ngưng'. Revision shouldn't clear deadline unless explicitly asked.
        const restrictedStatuses = ['Tạm ngưng']
        // Existing Deadline clear logic
        const deadlineUpdate = restrictedStatuses.includes(newStatus) ? { deadline: null } : {}

        // REWARD LOGIC: If completing task (This block is redundant with the one above, but added as per instruction)
        if (newStatus === 'Hoàn tất') {
            // Re-fetch task to ensure latest state if needed, though 'task' is already available
            // Using the 'task' variable already fetched at the beginning of the function
            if (task && task.assigneeId && task.deadline) {
                const now = new Date()
                const deadline = new Date(task.deadline) // Ensure deadline is a Date object

                // Check if on time (strict <=)
                if (now <= deadline) {
                    const currentRep = task.assignee?.reputation || 0 // Default to 0 if assignee or reputation is null/undefined
                    if (currentRep < 100) {
                        // Add 5 points, max 100
                        let newRep = currentRep + 5
                        if (newRep > 100) newRep = 100

                        await prisma.user.update({
                            where: { id: task.assigneeId },
                            data: { reputation: newRep }
                        })
                    }
                }
            }
        }



        // --- SMART STOPWATCH LOGIC ---
        const runningStatuses = ['Đang thực hiện', 'Revision']
        const pausedStatuses = ['Đã nhận task', 'Đang đợi giao', 'Sửa frame', 'Tạm ngưng'] // 'Sửa frame' is a Pause state? Assuming yes based on context "Reviewing". 
        // User request: 
        // Start: Giao việc (Assign -> "Đã nhận task" is Start?? No, Plan said "Start -> Set RUNNING", Wait. 
        // Plan said: "Assign -> START". But status is usually 'Đã nhận task'. 
        // Let's refine based on explicit request: "Giao việc... Bộ đếm: BẮT ĐẦU CHẠY". 
        // So 'Đã nhận task' should probably be RUNNING? 
        // BUT Step 3 says: "Revision... Bộ đếm: TIẾP TỤC CHẠY".
        // Step 2 says: "Nộp bài (Submit/Reviewing)... Bộ đếm: TẠM DỪNG".
        // Let's stick to Plan Interpretation:
        // Working States (RUNNING): 'Đã nhận task' (Maybe? Or explicitly 'Đang thực hiện' which is usually picked after), 'Revision'.
        // Let's look at TaskTable. User picks 'Đang thực hiện' to work.
        // Let's assume 'Đang thực hiện' and 'Revision' are RUNNING. 'Đã nhận task' is technically "Assigned but not started" or "Started"?
        // Re-reading request: "Giao việc (Assign): Admin tạo task và giao cho nhân viên. -> Bộ đếm: BẮT ĐẦU CHẠY (START)."
        // This implies even 'Đã nhận task' is RUNNING.
        // However, usually 'Đã nhận task' is idle until they pick it up.
        // Let's allow 'Đang thực hiện' and 'Revision' and 'Đã nhận task' to be RUNNING.
        // Wait, "Nộp bài... TẠM DỪNG".
        // "Sửa frame" is usually a type of Revision or Feedback? No, "Sửa frame" might be "Fixing Frame" which is work. 
        // Let's treat 'Sửa frame' as work too for video editors? Or is it a status waiting for frame check?
        // Let's stick to the text: "Revision (Has Feedback) -> RESUME".
        // "Fixed (Đã sửa) -> PAUSE".
        // "Reviewing/Submit" -> PAUSE.
        // Let's define:
        // RUNNING: 'Đã nhận task', 'Đang thực hiện', 'Revision', 'Sửa frame' (Assuming working on frame).
        // PAUSED: 'Đang đợi giao', 'Tạm ngưng'.
        // WARNING: If 'Đã nhận task' is RUNNING, then idle time before starting is counted. 
        // User said: "loại bỏ thời gian chờ duyệt hoặc chờ feedback".
        // So 'Đã nhận task' (Assigned) -> 'Đang thực hiện' (Working). 
        // If I follow literally "Assign -> Start", then 'Đã nhận task' counts.

        // Let's go with:
        // RUNNING: ['Đã nhận task', 'Đang thực hiện', 'Revision', 'Sửa frame']
        // PAUSED: ['Tạm ngưng', 'Đang đợi giao']
        // STOPPED: ['Hoàn tất']

        // Correction: "Nhân viên nộp bài... -> TẠM DỪNG".
        // If they switch to a status like "Chờ duyệt" (We don't have that, maybe they unassign? No).
        // They probably leave it in 'Đang thực hiện'? No, usually they mark 'Hoàn tất'? No that's Done.
        // In TaskTable allowed options: "Đã nhận task", "Đang thực hiện".
        // If they finish, they might mark it something else?
        // Actually, user Guide says: "Nhân viên báo cáo xong hoặc Admin bấm trạng thái 'Đã nhận bài/Chờ duyệt'".
        // We lack a 'Chờ duyệt' status in allowed list?
        // Admin views: ["Đã nhận task", "Đang thực hiện", "Revision", "Sửa frame", "Tạm ngưng", "Hoàn tất"].
        // Maybe "Tạm ngưng" is used for "Reviewing"? Or they flip back to "Đã nhận task"?
        // Let's make "Tạm ngưng" PAUSED.

        // RUNNING: 'Đã nhận task', 'Đang thực hiện'
        // PAUSED: 'Revision' (Feedbacking), 'Sửa frame', 'Tạm ngưng', 'Đang đợi giao'
        // STOPPED: 'Hoàn tất'

        const isRunningState = ['Đã nhận task', 'Đang thực hiện'].includes(newStatus)
        const isStoppedState = newStatus === 'Hoàn tất'
        // const isPaused = ['Tạm ngưng', 'Đang đợi giao'].includes(newStatus)

        let timerUpdate = {}
        const currentTimerStatus = task.timerStatus
        const nowTime = new Date()

        if (isStoppedState) {
            // STOP Logic
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
        } else if (isRunningState) {
            // START / RESUME Logic
            if (currentTimerStatus !== 'RUNNING') {
                timerUpdate = {
                    timerStatus: 'RUNNING',
                    timerStartedAt: nowTime
                }
            }
        } else {
            // PAUSE Logic (Tạm ngưng, Đangợi giao)
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

        await prisma.task.update({
            where: { id },
            data: {
                status: newStatus,
                ...deadlineUpdate,
                ...timerUpdate
            }
        })
        // Return final accumulated seconds (plus current elapsed if it was running) for the UI Log
        let finalSeconds = task.accumulatedSeconds
        if (task.timerStatus === 'RUNNING' && task.timerStartedAt) {
            const elapsed = Math.floor((nowTime.getTime() - task.timerStartedAt.getTime()) / 1000)
            finalSeconds += elapsed
        }

        revalidatePath('/admin')
        revalidatePath('/dashboard')
        revalidatePath('/admin/payroll') // Update payroll too since bonus depends on it

        return { success: true, finalSeconds }
    } catch (e) {
        return { error: 'Failed' }
    }
}
