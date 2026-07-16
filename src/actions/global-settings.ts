'use server'

import { prisma } from '@/lib/db'
import { verifyActiveSession } from '@/lib/security'

const GLOBAL_FRAME_TASK_ID = 'global-system-settings'

export async function getFrameAccount() {
    // [AUDIT R1 — BLOCKER fix] These were unauthenticated server actions exposing a
    // shared credential to anyone. Require an authenticated, active (non-locked)
    // session before reading/writing the global Frame account.
    const sess = await verifyActiveSession()
    if (sess.status !== 'active') {
        return { account: '', password: '' }
    }
    // [AUDIT HT-022 fix] Requiring merely an active session still let ANY authenticated user —
    // including a self-signed-up USER in no workspace — read this SHARED plaintext credential.
    // Restrict to privileged staff: a workspace OWNER/ADMIN (or treasurer). A normal user must
    // never receive the shared Frame.io password.
    const uid = (sess.session as any)?.user?.id as string | undefined
    if (!uid) return { account: '', password: '' }
    const adminMembership = await prisma.workspaceMember.findFirst({
        where: { userId: uid, role: { in: ['OWNER', 'ADMIN'] } },
        select: { id: true },
    })
    if (!adminMembership && !sess.isAdmin) {
        return { account: '', password: '' }
    }
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
    // [AUDIT R1 — BLOCKER fix] Require an authenticated, active session before
    // overwriting the global shared credential.
    const sess = await verifyActiveSession()
    if (sess.status !== 'active') {
        return { error: 'Bạn cần đăng nhập.' }
    }
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
