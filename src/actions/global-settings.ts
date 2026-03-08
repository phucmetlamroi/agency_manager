'use server'

import { prisma } from '@/lib/db'

const GLOBAL_FRAME_TASK_ID = 'global-system-settings'

export async function getFrameAccount() {
    try {
        const frameTask = await prisma.task.findUnique({
            where: { id: GLOBAL_FRAME_TASK_ID }
        })

        if (!frameTask || !frameTask.notes_vi) {
            return { account: '', password: '' }
        }

        try {
            const data = JSON.parse(frameTask.notes_vi)
            return {
                account: data.account || '',
                password: data.password || ''
            }
        } catch (e) {
            // If it's not valid JSON, just return empty
            return { account: '', password: '' }
        }
    } catch (e) {
        console.error("Failed to get frame account:", e)
        return { account: '', password: '' }
    }
}

export async function updateFrameAccount(account: string, password: string) {
    try {
        const payload = JSON.stringify({ account, password })

        await prisma.task.upsert({
            where: { id: GLOBAL_FRAME_TASK_ID },
            update: {
                notes_vi: payload
            },
            create: {
                id: GLOBAL_FRAME_TASK_ID,
                title: 'SYSTEM: GLOBAL SETTINGS',
                type: 'SYSTEM',
                status: 'HIDDEN',
                notes_vi: payload,
                workspaceId: null // Crucial: Don't link it to any workspace
            }
        })

        return { success: true }
    } catch (e) {
        console.error("Failed to update frame account:", e)
        return { error: "Failed to update global settings." }
    }
}
