'use server'

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { createNotificationInternal, createBulkNotificationsInternal } from './notification-actions'
import { broadcastNotificationToUser } from '@/lib/notification-broadcast'

async function getAuthSession(): Promise<{ userId: string; profileId: string } | null> {
    const session = await getSession()
    if (!session?.user?.id) return null
    const profileId = (session.user as any)?.sessionProfileId
    if (!profileId) return null
    return { userId: session.user.id, profileId }
}

async function getProfileWorkspaceIds(profileId: string): Promise<string[]> {
    const workspaces = await prisma.workspace.findMany({
        where: { profileId },
        select: { id: true },
    })
    return workspaces.map(w => w.id)
}

async function verifyUsersInProfile(userIds: string[], profileId: string): Promise<boolean> {
    const count = await prisma.user.count({
        where: {
            id: { in: userIds },
            OR: [
                { profileId },
                { profileAccesses: { some: { profileId } } },
            ],
        },
    })
    return count === userIds.length
}

export async function getConversations() {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId, profileId } = auth

    const workspaceIds = await getProfileWorkspaceIds(profileId)

    const conversations = await prisma.conversation.findMany({
        where: {
            participants: { some: { userId } },
            OR: [
                { workspaceId: { in: workspaceIds } },
                {
                    type: 'DIRECT',
                    workspaceId: null,
                    participants: {
                        every: {
                            user: {
                                OR: [
                                    { profileId },
                                    { profileAccesses: { some: { profileId } } },
                                ],
                            },
                        },
                    },
                },
            ],
        },
        include: {
            participants: {
                include: {
                    user: {
                        select: { id: true, username: true, nickname: true, avatarUrl: true },
                    },
                },
            },
            messages: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                include: {
                    sender: {
                        select: { id: true, username: true, nickname: true },
                    },
                },
            },
            task: {
                select: {
                    title: true,
                    client: { select: { name: true } },
                    assignee: { select: { nickname: true, username: true } },
                },
            },
        },
        orderBy: { updatedAt: 'desc' },
    })

    // Filter out conversations soft-deleted by current user (deletedFor JSON contains userId).
    // Deletion is reset if a NEW message arrives after the deletion timestamp.
    const visibleConversations = conversations.filter(conv => {
        const deletedFor = (conv as any).deletedFor as Record<string, string> | null
        const deletedAt = deletedFor?.[userId]
        if (!deletedAt) return true
        const lastMessage = conv.messages[0]
        if (lastMessage && lastMessage.createdAt > new Date(deletedAt)) return true
        return false
    })

    const withUnread = visibleConversations.map(conv => {
        const myParticipation = conv.participants.find(p => p.userId === userId)
        const lastReadAt = myParticipation?.lastReadAt || new Date(0)
        const lastMessage = conv.messages[0] || null
        const unreadCount = lastMessage && lastMessage.createdAt > lastReadAt && lastMessage.senderId !== userId ? 1 : 0

        return {
            id: conv.id,
            type: conv.type,
            name: conv.name,
            avatarUrl: conv.avatarUrl,
            taskId: conv.taskId,
            workspaceId: conv.workspaceId,
            createdById: conv.createdById,
            isCreator: conv.createdById === userId,
            updatedAt: conv.updatedAt.toISOString(),
            task: conv.task ? {
                title: conv.task.title,
                clientName: conv.task.client?.name || null,
                assigneeName: conv.task.assignee?.nickname || conv.task.assignee?.username || null,
            } : null,
            participants: conv.participants.map(p => ({
                userId: p.userId,
                role: p.role,
                user: p.user,
            })),
            lastMessage: lastMessage ? {
                id: lastMessage.id,
                content: lastMessage.content,
                type: lastMessage.type,
                senderId: lastMessage.senderId,
                senderName: lastMessage.sender.nickname || lastMessage.sender.username,
                createdAt: lastMessage.createdAt.toISOString(),
            } : null,
            unreadCount,
            isMuted: myParticipation?.isMuted || false,
        }
    })

    return { data: withUnread }
}

export async function getOrCreateDirectConversation(otherUserId: string) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId, profileId } = auth
    if (userId === otherUserId) return { error: 'Cannot message yourself' }

    // Check existing conversation first
    const existing = await prisma.conversation.findFirst({
        where: {
            type: 'DIRECT',
            AND: [
                { participants: { some: { userId } } },
                { participants: { some: { userId: otherUserId } } },
            ],
        },
        select: { id: true },
    })

    if (existing) return { data: { conversationId: existing.id } }

    // Must be ACCEPTED contacts to create a DM — works across all profiles
    const contact = await prisma.contact.findFirst({
        where: {
            OR: [
                { requesterId: userId, receiverId: otherUserId },
                { requesterId: otherUserId, receiverId: userId },
            ],
            status: 'ACCEPTED',
        },
    })

    if (!contact) return { error: 'Must be contacts first' }

    // Cross-profile DMs have no workspaceId — they're global conversations
    const conv = await prisma.conversation.create({
        data: {
            type: 'DIRECT',
            createdById: userId,
            participants: {
                create: [
                    { userId },
                    { userId: otherUserId },
                ],
            },
        },
    })

    return { data: { conversationId: conv.id } }
}

export async function getOrCreateTaskConversation(taskId: string, workspaceId: string) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId, profileId } = auth

    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { profileId: true },
    })
    if (!workspace || workspace.profileId !== profileId) {
        return { error: 'Workspace not accessible' }
    }

    const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: {
            title: true,
            assigneeId: true,
            clientUserId: true,
            workspaceId: true,
            assignee: { select: { id: true, username: true, nickname: true } },
            client: { select: { name: true } },
            clientUser: { select: { id: true, username: true, nickname: true } },
        },
    })

    if (!task || task.workspaceId !== workspaceId) {
        return { error: 'Task not found in workspace' }
    }

    const taskTitle = task.title || 'Untitled Task'
    const clientName = task.client?.name || null
    const assigneeName = task.assignee?.nickname || task.assignee?.username || null
    const convName = taskTitle

    const existing = await prisma.conversation.findUnique({
        where: { taskId },
        select: { id: true, name: true },
    })

    if (existing) {
        if (!existing.name && convName) {
            await prisma.conversation.update({
                where: { id: existing.id },
                data: { name: convName },
            })
        }
        return {
            data: {
                conversationId: existing.id,
                conversationName: existing.name || convName,
                taskTitle,
                clientName,
                assigneeName,
            },
        }
    }

    const participantIds = new Set<string>([userId])
    if (task.assigneeId) participantIds.add(task.assigneeId)
    if (task.clientUserId) participantIds.add(task.clientUserId)

    const conv = await prisma.conversation.create({
        data: {
            type: 'TASK',
            name: convName,
            taskId,
            workspaceId,
            createdById: userId,
            participants: {
                create: Array.from(participantIds).map(uid => ({ userId: uid })),
            },
        },
    })

    return {
        data: {
            conversationId: conv.id,
            conversationName: convName,
            taskTitle,
            clientName,
            assigneeName,
        },
    }
}

export async function createGroupConversation(
    name: string,
    participantIds: string[],
    workspaceId: string
) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId, profileId } = auth

    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { profileId: true },
    })
    if (!workspace || workspace.profileId !== profileId) {
        return { error: 'Workspace not accessible' }
    }

    const allIds = new Set([userId, ...participantIds])

    const allInProfile = await verifyUsersInProfile(Array.from(allIds), profileId)
    if (!allInProfile) {
        return { error: 'Some participants are not in the current team' }
    }

    const conv = await prisma.conversation.create({
        data: {
            type: 'GROUP',
            name,
            workspaceId,
            createdById: userId,
            participants: {
                create: Array.from(allIds).map(uid => ({
                    userId: uid,
                    role: uid === userId ? 'ADMIN' : 'MEMBER',
                })),
            },
        },
    })

    return { data: { conversationId: conv.id } }
}

export async function getGroupMembers(conversationId: string) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const participant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
    })
    if (!participant) return { error: 'Not a participant' }

    const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { type: true, createdById: true },
    })
    if (!conv || conv.type !== 'GROUP') return { error: 'Not a group conversation' }

    const members = await prisma.conversationParticipant.findMany({
        where: { conversationId },
        include: {
            user: {
                select: { id: true, username: true, nickname: true, avatarUrl: true, email: true },
            },
        },
    })

    return {
        data: {
            members: members.map(m => ({
                userId: m.userId,
                role: m.role,
                username: m.user.username,
                nickname: m.user.nickname,
                avatarUrl: m.user.avatarUrl,
                email: m.user.email,
            })),
            isCreator: conv.createdById === userId,
        },
    }
}

export async function addGroupMembers(conversationId: string, userIds: string[]) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId, profileId } = auth

    const participant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
    })
    if (!participant) return { error: 'Not a participant' }

    const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { type: true, workspaceId: true },
    })
    if (!conv || conv.type !== 'GROUP') return { error: 'Not a group conversation' }

    // Check which users are already members
    const existing = await prisma.conversationParticipant.findMany({
        where: { conversationId, userId: { in: userIds } },
        select: { userId: true },
    })
    const existingIds = new Set(existing.map(e => e.userId))
    const newIds = userIds.filter(id => !existingIds.has(id))

    if (newIds.length === 0) return { error: 'All users are already members' }

    // Verify new users are in the same profile
    const allInProfile = await verifyUsersInProfile(newIds, profileId)
    if (!allInProfile) return { error: 'Some users are not in the current team' }

    await prisma.conversationParticipant.createMany({
        data: newIds.map(uid => ({
            conversationId,
            userId: uid,
            role: 'MEMBER',
        })),
    })

    // Add system message
    await prisma.message.create({
        data: {
            conversationId,
            senderId: userId,
            type: 'SYSTEM',
            content: `added ${newIds.length} member(s) to the group`,
        },
    })

    await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
    })

    // Notify newly added members
    void notifyGroupMembersAdded(conversationId, userId, newIds).catch(() => {})

    return { data: { added: newIds.length } }
}

async function notifyGroupMembersAdded(conversationId: string, actorId: string, newUserIds: string[]) {
    const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { name: true, avatarUrl: true },
    })
    const actor = await prisma.user.findUnique({
        where: { id: actorId },
        select: { username: true, nickname: true, avatarUrl: true },
    })
    const actorName = actor?.nickname || actor?.username || 'Someone'
    const groupName = conv?.name || 'a group'

    for (const uid of newUserIds) {
        try {
            const notif = await createNotificationInternal({
                userId: uid,
                type: 'GROUP_MEMBER_ADDED',
                title: 'You were added to a group',
                body: `${actorName} added you to "${groupName}"`,
                avatarUrl: conv?.avatarUrl || actor?.avatarUrl,
                conversationId,
                actorId,
                metadata: { groupName },
            })
            void broadcastNotificationToUser(uid, serializeForBroadcast(notif))
        } catch {/* per-recipient errors swallowed */}
    }
}

function serializeForBroadcast(n: { id: string; type: string; title: string; body: string; avatarUrl: string | null; conversationId: string | null; messageId: string | null; taskId: string | null; actorId: string | null; metadata: any; createdAt: Date; isRead: boolean }) {
    return {
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        avatarUrl: n.avatarUrl,
        conversationId: n.conversationId,
        messageId: n.messageId,
        taskId: n.taskId,
        actorId: n.actorId,
        metadata: n.metadata,
        createdAt: n.createdAt.toISOString(),
        isRead: n.isRead,
    }
}

export async function removeGroupMember(conversationId: string, targetUserId: string) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { type: true, createdById: true },
    })
    if (!conv || conv.type !== 'GROUP') return { error: 'Not a group conversation' }

    // Only group creator can remove members (or user can leave themselves)
    if (targetUserId !== userId && conv.createdById !== userId) {
        return { error: 'Only the group creator can remove members' }
    }

    // Capture remaining participants BEFORE delete (for "left" notification)
    const remainingParticipants = await prisma.conversationParticipant.findMany({
        where: { conversationId, userId: { not: targetUserId } },
        select: { userId: true },
    })

    await prisma.conversationParticipant.delete({
        where: { conversationId_userId: { conversationId, userId: targetUserId } },
    })

    const isLeaving = targetUserId === userId
    const action = isLeaving ? 'left the group' : 'removed a member'
    await prisma.message.create({
        data: {
            conversationId,
            senderId: userId,
            type: 'SYSTEM',
            content: action,
        },
    })

    // Fire notifications
    void notifyGroupMemberRemoved(conversationId, userId, targetUserId, isLeaving, remainingParticipants.map(p => p.userId)).catch(() => {})

    return { data: { ok: true } }
}

async function notifyGroupMemberRemoved(
    conversationId: string,
    actorId: string,
    targetUserId: string,
    isLeaving: boolean,
    remainingUserIds: string[]
) {
    const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { name: true, avatarUrl: true },
    })
    const actor = await prisma.user.findUnique({
        where: { id: actorId },
        select: { username: true, nickname: true, avatarUrl: true },
    })
    const target = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { username: true, nickname: true, avatarUrl: true },
    })
    const actorName = actor?.nickname || actor?.username || 'Someone'
    const targetName = target?.nickname || target?.username || 'Someone'
    const groupName = conv?.name || 'the group'

    if (!isLeaving) {
        // Notify the user who was removed (not themselves leaving)
        try {
            const notif = await createNotificationInternal({
                userId: targetUserId,
                type: 'GROUP_MEMBER_REMOVED',
                title: 'You were removed from a group',
                body: `${actorName} removed you from "${groupName}"`,
                avatarUrl: conv?.avatarUrl || actor?.avatarUrl,
                conversationId,
                actorId,
                metadata: { groupName },
            })
            void broadcastNotificationToUser(targetUserId, serializeForBroadcast(notif))
        } catch {/* swallowed */}
    } else {
        // Someone left → notify remaining members
        for (const uid of remainingUserIds) {
            try {
                const notif = await createNotificationInternal({
                    userId: uid,
                    type: 'GROUP_MEMBER_LEFT',
                    title: 'A member left the group',
                    body: `${targetName} left "${groupName}"`,
                    avatarUrl: target?.avatarUrl,
                    conversationId,
                    actorId: targetUserId,
                    metadata: { groupName, leaverName: targetName },
                })
                void broadcastNotificationToUser(uid, serializeForBroadcast(notif))
            } catch {/* swallowed */}
        }
    }
}

export async function getMessages(conversationId: string, cursor?: string, limit = 30) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const participant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
    })
    if (!participant) return { error: 'Not a participant' }

    const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        include: {
            sender: {
                select: { id: true, username: true, nickname: true, avatarUrl: true },
            },
            replyTo: {
                select: {
                    id: true,
                    content: true,
                    sender: { select: { username: true, nickname: true } },
                },
            },
            reactions: {
                select: { emoji: true, userId: true },
            },
            pin: { select: { id: true } },
        },
    })

    // Filter out messages the current user has hidden via "delete for me"
    const visible = messages.filter(m => {
        const hidden = (m.deletedForUsers as Record<string, string> | null)?.[userId]
        return !hidden
    })

    const data = visible.map(m => {
        const reactionMap = new Map<string, { count: number; userIds: string[] }>()
        m.reactions.forEach(r => {
            const existing = reactionMap.get(r.emoji)
            if (existing) {
                existing.count++
                existing.userIds.push(r.userId)
            } else {
                reactionMap.set(r.emoji, { count: 1, userIds: [r.userId] })
            }
        })

        // View-once: if message has been viewed by current user (or anyone OTHER than sender),
        // hide content/file from non-sender viewers.
        const viewedBy = (m.viewOnce && m.viewedBy && typeof m.viewOnce === 'boolean') ? (m.viewedBy as Record<string, string> | null) : null
        const isSender = m.senderId === userId
        const viewedByMe = viewedBy && !!viewedBy[userId]
        const expired = m.viewOnce && !isSender && viewedByMe
        const content = expired ? null : m.content
        const fileUrl = expired ? null : m.fileUrl

        return {
            id: m.id,
            conversationId: m.conversationId,
            senderId: m.senderId,
            content,
            type: m.type,
            fileUrl,
            fileName: m.fileName,
            fileSize: m.fileSize,
            replyToId: m.replyToId,
            isEdited: m.isEdited,
            isDeleted: m.isDeleted,
            editedAt: m.editedAt ? m.editedAt.toISOString() : null,
            deletedAt: m.deletedAt ? m.deletedAt.toISOString() : null,
            viewOnce: m.viewOnce,
            viewed: !!viewedByMe,
            expired: !!expired,
            isImportant: !!m.isImportant,
            mentions: (m.mentions as string[] | null) || [],
            forwardedFromMessageId: m.forwardedFromMessageId,
            forwardedFromConversationId: m.forwardedFromConversationId,
            isPinned: !!m.pin,
            createdAt: m.createdAt.toISOString(),
            sender: m.sender,
            replyTo: m.replyTo,
            reactions: Array.from(reactionMap.entries()).map(([emoji, data]) => ({
                emoji,
                ...data,
            })),
        }
    })

    return { data }
}

export async function sendMessage(
    conversationId: string,
    content: string,
    type: 'TEXT' | 'IMAGE' | 'FILE' | 'ANNOUNCEMENT' = 'TEXT',
    replyToId?: string,
    fileUrl?: string,
    fileName?: string,
    fileSize?: number,
    viewOnce: boolean = false,
    mentions?: string[],
    isImportant: boolean = false
) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const participant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
    })
    if (!participant) return { error: 'Not a participant' }

    // ANNOUNCEMENT — only group creator can send
    if (type === 'ANNOUNCEMENT') {
        const conv = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { type: true, createdById: true },
        })
        if (!conv || conv.type !== 'GROUP') return { error: 'Announcements only allowed in groups' }
        if (conv.createdById !== userId) return { error: 'Only the group creator can send announcements' }
    }

    const [message] = await prisma.$transaction([
        prisma.message.create({
            data: {
                conversationId,
                senderId: userId,
                content,
                type,
                replyToId: replyToId || null,
                fileUrl: fileUrl || null,
                fileName: fileName || null,
                fileSize: fileSize || null,
                viewOnce: viewOnce && (type === 'IMAGE' || type === 'FILE'),
                mentions: mentions && mentions.length > 0 ? (mentions as any) : undefined,
                isImportant: !!isImportant,
            },
            include: {
                sender: {
                    select: { id: true, username: true, nickname: true, avatarUrl: true },
                },
                replyTo: {
                    select: {
                        id: true,
                        content: true,
                        sender: { select: { username: true, nickname: true } },
                    },
                },
            },
        }),
        prisma.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
        }),
        prisma.conversationParticipant.update({
            where: { conversationId_userId: { conversationId, userId } },
            data: { lastReadAt: new Date() },
        }),
    ])

    // ── Fire notifications to all other participants ────────────────────────
    // Persist a Notification record per recipient (respecting mute/mention rules).
    // This is fire-and-forget: errors do not block message send.
    void notifyMessageRecipients(message.id, message.conversationId, userId, message.content || '', message.sender, (message.mentions as string[] | null) || [], message.isImportant, message.type as any)
        .catch(() => { /* logged elsewhere */ })

    return {
        data: {
            id: message.id,
            conversationId: message.conversationId,
            senderId: message.senderId,
            content: message.content,
            type: message.type,
            fileUrl: message.fileUrl,
            fileName: message.fileName,
            fileSize: message.fileSize,
            replyToId: message.replyToId,
            isEdited: false,
            isDeleted: false,
            editedAt: null,
            deletedAt: null,
            viewOnce: message.viewOnce,
            viewed: false,
            expired: false,
            isImportant: message.isImportant,
            mentions: (message.mentions as string[] | null) || [],
            forwardedFromMessageId: message.forwardedFromMessageId,
            forwardedFromConversationId: message.forwardedFromConversationId,
            isPinned: false,
            createdAt: message.createdAt.toISOString(),
            sender: message.sender,
            replyTo: message.replyTo,
            reactions: [],
        },
    }
}

// Helper: fan out notifications for a new message.
// - Fetches participants (excluding sender) and their mute state
// - For each recipient: NEW_MESSAGE if not muted, MENTION if mentioned (bypass mute)
// - Broadcasts NOTIFICATION_NEW so the recipient's client updates the bell instantly
async function notifyMessageRecipients(
    messageId: string,
    conversationId: string,
    senderId: string,
    content: string,
    sender: { id: string; username: string; nickname: string | null; avatarUrl: string | null },
    mentions: string[],
    isImportant: boolean,
    msgType: 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM' | 'ANNOUNCEMENT'
) {
    if (msgType === 'SYSTEM') return  // System messages never notify

    const participants = await prisma.conversationParticipant.findMany({
        where: {
            conversationId,
            userId: { not: senderId },
        },
        select: {
            userId: true,
            isMuted: true,
            conversation: {
                select: { type: true, name: true, task: { select: { title: true } } },
            },
        },
    })

    if (participants.length === 0) return

    const senderName = sender.nickname || sender.username || 'Someone'
    const conv = participants[0]?.conversation
    const convLabel = conv?.type === 'TASK'
        ? conv.task?.title || 'Task chat'
        : conv?.type === 'GROUP'
            ? conv.name || 'Group'
            : senderName  // DIRECT — recipient sees sender as the "label"

    const previewBody = msgType === 'IMAGE' ? '📷 Photo' : msgType === 'FILE' ? '📎 File' : msgType === 'ANNOUNCEMENT' ? `📣 ${content.slice(0, 100)}` : content.slice(0, 120)

    const mentionSet = new Set(mentions || [])

    // Process each recipient
    for (const p of participants) {
        const isMentioned = mentionSet.has(p.userId)
        const isMuted = p.isMuted

        // Skip if muted AND not mentioned AND not announcement AND not important
        if (isMuted && !isMentioned && msgType !== 'ANNOUNCEMENT' && !isImportant) {
            continue
        }

        const notifType: 'NEW_MESSAGE' | 'MENTION' = isMentioned ? 'MENTION' : 'NEW_MESSAGE'
        const titlePrefix = isMentioned ? `@${senderName} mentioned you` : senderName
        const title = conv?.type === 'GROUP' ? `${titlePrefix} · ${convLabel}` : titlePrefix

        try {
            const notif = await createNotificationInternal({
                userId: p.userId,
                type: notifType,
                title,
                body: previewBody,
                avatarUrl: sender.avatarUrl,
                conversationId,
                messageId,
                actorId: senderId,
                metadata: {
                    convType: conv?.type,
                    convLabel,
                    msgType,
                    isImportant,
                    isMention: isMentioned,
                },
            })
            // Fire-and-forget broadcast (don't await individually — Promise.all could be added)
            void broadcastNotificationToUser(p.userId, {
                id: notif.id,
                type: notif.type,
                title: notif.title,
                body: notif.body,
                avatarUrl: notif.avatarUrl,
                conversationId: notif.conversationId,
                messageId: notif.messageId,
                taskId: notif.taskId,
                actorId: notif.actorId,
                metadata: notif.metadata,
                createdAt: notif.createdAt.toISOString(),
                isRead: false,
            })
        } catch {
            // Per-recipient failures shouldn't block siblings
        }
    }
}

export async function markAsRead(conversationId: string) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    await prisma.conversationParticipant.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { lastReadAt: new Date() },
    })

    return { success: true }
}

export async function getUnreadCounts() {
    const auth = await getAuthSession()
    if (!auth) return { data: {} }
    const { userId, profileId } = auth

    const workspaceIds = await getProfileWorkspaceIds(profileId)

    const results: Array<{ conversationId: string; unread: bigint }> = await prisma.$queryRaw`
        SELECT cp."conversationId", COUNT(m.id)::bigint as unread
        FROM "ConversationParticipant" cp
        JOIN "Conversation" c ON c.id = cp."conversationId"
        JOIN "Message" m ON m."conversationId" = cp."conversationId"
        WHERE cp."userId" = ${userId}
          AND m."createdAt" > cp."lastReadAt"
          AND m."senderId" != ${userId}
          AND (
            c."workspaceId" = ANY(${workspaceIds}::text[])
            OR (c."type" = 'DIRECT' AND c."workspaceId" IS NULL)
          )
        GROUP BY cp."conversationId"
    `

    const counts: Record<string, number> = {}
    let total = 0
    for (const r of results) {
        const n = Number(r.unread)
        if (n > 0) {
            counts[r.conversationId] = n
            total += n
        }
    }

    return { data: { counts, total } }
}

export async function toggleReaction(messageId: string, emoji: string) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { conversationId: true },
    })
    if (!message) return { error: 'Message not found' }

    const participant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId: message.conversationId, userId } },
    })
    if (!participant) return { error: 'Not a participant' }

    const existing = await prisma.messageReaction.findUnique({
        where: { messageId_userId_emoji: { messageId, userId, emoji } },
    })

    if (existing) {
        await prisma.messageReaction.delete({ where: { id: existing.id } })
        return { data: { action: 'removed' } }
    } else {
        await prisma.messageReaction.create({
            data: { messageId, userId, emoji },
        })
        return { data: { action: 'added' } }
    }
}

export async function getTaskConversationStatus(taskIds: string[]) {
    const auth = await getAuthSession()
    if (!auth) return {}
    const { profileId } = auth

    if (taskIds.length === 0) return {}

    const workspaceIds = await getProfileWorkspaceIds(profileId)

    const conversations = await prisma.conversation.findMany({
        where: {
            taskId: { in: taskIds },
            workspaceId: { in: workspaceIds },
        },
        select: { taskId: true, id: true },
    })

    const result: Record<string, { hasConversation: boolean; conversationId: string | null }> = {}
    for (const tid of taskIds) {
        const conv = conversations.find(c => c.taskId === tid)
        result[tid] = conv
            ? { hasConversation: true, conversationId: conv.id }
            : { hasConversation: false, conversationId: null }
    }
    return result
}

export async function getTaskUnreadCounts(taskIds: string[]) {
    const auth = await getAuthSession()
    if (!auth) return {}
    const { userId, profileId } = auth

    if (taskIds.length === 0) return {}

    const workspaceIds = await getProfileWorkspaceIds(profileId)

    const results: Array<{ taskId: string; unread: bigint }> = await prisma.$queryRaw`
        SELECT c."taskId", COUNT(m.id)::bigint as unread
        FROM "Conversation" c
        JOIN "ConversationParticipant" cp ON cp."conversationId" = c.id
        JOIN "Message" m ON m."conversationId" = c.id
        WHERE c."taskId" = ANY(${taskIds}::text[])
          AND c."workspaceId" = ANY(${workspaceIds}::text[])
          AND cp."userId" = ${userId}
          AND m."createdAt" > cp."lastReadAt"
          AND m."senderId" != ${userId}
        GROUP BY c."taskId"
    `

    const counts: Record<string, number> = {}
    for (const r of results) {
        counts[r.taskId] = Number(r.unread)
    }
    return counts
}

// ─────────────────────────────────────────────────────────────────────────────
// Messenger-grade actions: delete chat, recall message, edit message, view-once
// ─────────────────────────────────────────────────────────────────────────────

const RECALL_WINDOW_MS = 10 * 60 * 1000  // 10 minutes
const EDIT_WINDOW_MS = 15 * 60 * 1000    // 15 minutes

export async function deleteConversation(conversationId: string) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const participant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
    })
    if (!participant) return { error: 'Not a participant' }

    const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { deletedFor: true },
    })
    const existing = (conv?.deletedFor as Record<string, string> | null) || {}
    existing[userId] = new Date().toISOString()

    await prisma.conversation.update({
        where: { id: conversationId },
        data: { deletedFor: existing as any },
    })

    revalidatePath('/[workspaceId]/admin/chat', 'page')
    revalidatePath('/[workspaceId]/dashboard/chat', 'page')
    return { data: { ok: true } }
}

export async function recallMessage(messageId: string) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { id: true, senderId: true, conversationId: true, createdAt: true, isDeleted: true },
    })
    if (!message) return { error: 'Message not found' }
    if (message.senderId !== userId) return { error: 'Cannot recall others\' messages' }
    if (message.isDeleted) return { error: 'Already deleted' }

    const ageMs = Date.now() - message.createdAt.getTime()
    if (ageMs > RECALL_WINDOW_MS) return { error: 'Recall window has expired (10 min)' }

    const updated = await prisma.message.update({
        where: { id: messageId },
        data: {
            isDeleted: true,
            deletedAt: new Date(),
            content: null,
            fileUrl: null,
            fileName: null,
            fileSize: null,
        },
    })

    return {
        data: {
            id: updated.id,
            conversationId: updated.conversationId,
            isDeleted: true,
            deletedAt: updated.deletedAt?.toISOString(),
        },
    }
}

export async function editMessage(messageId: string, newContent: string) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const trimmed = newContent.trim()
    if (!trimmed) return { error: 'Content cannot be empty' }
    if (trimmed.length > 4000) return { error: 'Content too long' }

    const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { id: true, senderId: true, conversationId: true, createdAt: true, isDeleted: true, type: true },
    })
    if (!message) return { error: 'Message not found' }
    if (message.senderId !== userId) return { error: 'Cannot edit others\' messages' }
    if (message.isDeleted) return { error: 'Cannot edit deleted message' }
    if (message.type !== 'TEXT') return { error: 'Only text messages can be edited' }

    const ageMs = Date.now() - message.createdAt.getTime()
    if (ageMs > EDIT_WINDOW_MS) return { error: 'Edit window has expired (15 min)' }

    const updated = await prisma.message.update({
        where: { id: messageId },
        data: {
            content: trimmed,
            isEdited: true,
            editedAt: new Date(),
        },
    })

    return {
        data: {
            id: updated.id,
            conversationId: updated.conversationId,
            content: updated.content,
            isEdited: true,
            editedAt: updated.editedAt?.toISOString(),
        },
    }
}

export async function markViewOnceViewed(messageId: string) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { id: true, senderId: true, conversationId: true, viewOnce: true, viewedBy: true },
    })
    if (!message) return { error: 'Message not found' }
    if (!message.viewOnce) return { error: 'Not a view-once message' }
    if (message.senderId === userId) return { error: 'Sender does not need to view' }

    const participant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId: message.conversationId, userId } },
    })
    if (!participant) return { error: 'Not a participant' }

    const existing = (message.viewedBy as Record<string, string> | null) || {}
    if (existing[userId]) {
        return { data: { id: message.id, alreadyViewed: true } }
    }
    existing[userId] = new Date().toISOString()

    await prisma.message.update({
        where: { id: messageId },
        data: { viewedBy: existing as any },
    })

    return { data: { id: message.id, conversationId: message.conversationId, alreadyViewed: false } }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 Tier 1: Rename, Delete-for-all, Delete-for-me, Mute, Search
// ─────────────────────────────────────────────────────────────────────────────

const MAX_GROUP_NAME_LEN = 60

export async function renameConversation(conversationId: string, newName: string) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const trimmed = newName.trim()
    if (!trimmed) return { error: 'Name cannot be empty' }
    if (trimmed.length > MAX_GROUP_NAME_LEN) return { error: `Name too long (max ${MAX_GROUP_NAME_LEN} chars)` }

    const participant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
    })
    if (!participant) return { error: 'Not a participant' }

    const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { type: true, createdById: true, name: true },
    })
    if (!conv) return { error: 'Conversation not found' }
    if (conv.type === 'TASK') return { error: 'Task conversations cannot be renamed' }
    if (conv.type === 'GROUP' && conv.createdById !== userId) {
        return { error: 'Only the group creator can rename the group' }
    }

    const actor = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, nickname: true },
    })
    const actorName = actor?.nickname || actor?.username || 'Someone'

    await prisma.$transaction([
        prisma.conversation.update({
            where: { id: conversationId },
            data: { name: trimmed, updatedAt: new Date() },
        }),
        ...(conv.type === 'GROUP' ? [
            prisma.message.create({
                data: {
                    conversationId,
                    senderId: userId,
                    type: 'SYSTEM',
                    content: `${actorName} renamed the group to "${trimmed}"`,
                },
            }),
        ] : []),
    ])

    return { data: { ok: true, name: trimmed } }
}

export async function deleteGroupForAll(conversationId: string) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { type: true, createdById: true },
    })
    if (!conv) return { error: 'Conversation not found' }
    if (conv.type !== 'GROUP') return { error: 'Only group conversations can be deleted for all' }
    if (conv.createdById !== userId) {
        return { error: 'Only the group creator can delete the group' }
    }

    // Collect participant IDs BEFORE delete (for client-side broadcast notification)
    const participants = await prisma.conversationParticipant.findMany({
        where: { conversationId },
        select: { userId: true },
    })
    const participantIds = participants.map(p => p.userId)

    // Snapshot the conversation name for notification body before deletion
    const convSnapshot = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { name: true, avatarUrl: true },
    })
    const actor = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, nickname: true, avatarUrl: true },
    })
    const groupName = convSnapshot?.name || 'a group'
    const actorName = actor?.nickname || actor?.username || 'The creator'

    // Cascade delete via Prisma (Message, ConversationParticipant, MessageReaction, MessageReadReceipt all cascade)
    await prisma.conversation.delete({ where: { id: conversationId } })

    // Notify other members that the group was deleted
    const recipientIds = participantIds.filter(id => id !== userId)
    for (const uid of recipientIds) {
        try {
            const notif = await createNotificationInternal({
                userId: uid,
                type: 'GROUP_DELETED',
                title: 'A group was deleted',
                body: `${actorName} deleted "${groupName}"`,
                avatarUrl: convSnapshot?.avatarUrl || actor?.avatarUrl,
                actorId: userId,
                metadata: { groupName },
            })
            void broadcastNotificationToUser(uid, serializeForBroadcast(notif))
        } catch {/* swallowed */}
    }

    return { data: { ok: true, participantIds } }
}

export async function deleteMessageForMe(messageId: string) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { id: true, conversationId: true, deletedForUsers: true },
    })
    if (!message) return { error: 'Message not found' }

    const participant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId: message.conversationId, userId } },
    })
    if (!participant) return { error: 'Not a participant' }

    const existing = (message.deletedForUsers as Record<string, string> | null) || {}
    if (existing[userId]) return { data: { ok: true, alreadyHidden: true } }
    existing[userId] = new Date().toISOString()

    await prisma.message.update({
        where: { id: messageId },
        data: { deletedForUsers: existing as any },
    })

    return { data: { ok: true } }
}

export async function setConversationMuted(conversationId: string, muted: boolean) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const participant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
    })
    if (!participant) return { error: 'Not a participant' }

    await prisma.conversationParticipant.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { isMuted: muted },
    })

    return { data: { ok: true, muted } }
}

export async function searchMessages(conversationId: string, query: string, limit = 30) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const trimmed = query.trim()
    if (trimmed.length < 2) return { error: 'Query too short (min 2 chars)' }

    const participant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
    })
    if (!participant) return { error: 'Not a participant' }

    const messages = await prisma.message.findMany({
        where: {
            conversationId,
            isDeleted: false,
            type: 'TEXT',
            content: { contains: trimmed, mode: 'insensitive' },
        },
        include: {
            sender: {
                select: { id: true, username: true, nickname: true, avatarUrl: true },
            },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 100),
    })

    // Filter out messages hidden via "delete for me"
    const visible = messages.filter(m => {
        const hidden = (m.deletedForUsers as Record<string, string> | null)?.[userId]
        return !hidden
    })

    return {
        data: visible.map(m => ({
            id: m.id,
            content: m.content,
            createdAt: m.createdAt.toISOString(),
            sender: {
                id: m.sender.id,
                username: m.sender.username,
                nickname: m.sender.nickname,
                avatarUrl: m.sender.avatarUrl,
            },
        })),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 Tier 2: Forward, Pin, Important, Announcement, Mentions, Presence
// ─────────────────────────────────────────────────────────────────────────────

const MAX_PINS_PER_CONV = 50

export async function forwardMessage(messageId: string, toConversationIds: string[]) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    if (!toConversationIds.length) return { error: 'No target conversations' }
    if (toConversationIds.length > 20) return { error: 'Cannot forward to more than 20 conversations' }

    const source = await prisma.message.findUnique({
        where: { id: messageId },
        select: {
            id: true, conversationId: true, content: true, type: true,
            fileUrl: true, fileName: true, fileSize: true, isDeleted: true,
            viewOnce: true, deletedForUsers: true,
        },
    })
    if (!source) return { error: 'Message not found' }
    if (source.isDeleted) return { error: 'Cannot forward a recalled message' }
    if (source.viewOnce) return { error: 'Cannot forward view-once messages' }

    // Verify caller can SEE the source message
    const srcParticipant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId: source.conversationId, userId } },
    })
    if (!srcParticipant) return { error: 'Cannot forward — not a participant of source' }

    // Check caller is a participant in all target conversations
    const targets = await prisma.conversationParticipant.findMany({
        where: {
            conversationId: { in: toConversationIds },
            userId,
        },
        select: { conversationId: true },
    })
    const targetIds = new Set(targets.map(t => t.conversationId))
    if (targetIds.size !== toConversationIds.length) {
        return { error: 'You are not a participant of all selected conversations' }
    }

    // Forward to each target — create new message with provenance
    const forwarded = await prisma.$transaction(
        toConversationIds.map(targetId =>
            prisma.message.create({
                data: {
                    conversationId: targetId,
                    senderId: userId,
                    content: source.content,
                    type: source.type === 'ANNOUNCEMENT' ? 'TEXT' : source.type,
                    fileUrl: source.fileUrl,
                    fileName: source.fileName,
                    fileSize: source.fileSize,
                    forwardedFromMessageId: source.id,
                    forwardedFromConversationId: source.conversationId,
                },
            })
        )
    )

    // Bump updatedAt on all targets
    await prisma.conversation.updateMany({
        where: { id: { in: toConversationIds } },
        data: { updatedAt: new Date() },
    })

    return { data: { count: forwarded.length, messageIds: forwarded.map(f => f.id) } }
}

export async function pinMessage(messageId: string) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { id: true, conversationId: true, isDeleted: true },
    })
    if (!message) return { error: 'Message not found' }
    if (message.isDeleted) return { error: 'Cannot pin a deleted message' }

    const conv = await prisma.conversation.findUnique({
        where: { id: message.conversationId },
        select: { type: true, createdById: true },
    })
    if (!conv) return { error: 'Conversation not found' }

    const participant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId: message.conversationId, userId } },
    })
    if (!participant) return { error: 'Not a participant' }

    // GROUP: only creator can pin. DIRECT/TASK: any participant.
    if (conv.type === 'GROUP' && conv.createdById !== userId) {
        return { error: 'Only the group creator can pin messages' }
    }

    // Already pinned?
    const existing = await prisma.messagePin.findUnique({ where: { messageId } })
    if (existing) return { data: { ok: true, alreadyPinned: true } }

    // Enforce limit
    const count = await prisma.messagePin.count({ where: { conversationId: message.conversationId } })
    if (count >= MAX_PINS_PER_CONV) return { error: `Pin limit reached (${MAX_PINS_PER_CONV})` }

    await prisma.messagePin.create({
        data: {
            messageId,
            conversationId: message.conversationId,
            pinnedById: userId,
        },
    })

    return { data: { ok: true, conversationId: message.conversationId } }
}

export async function unpinMessage(messageId: string) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const pin = await prisma.messagePin.findUnique({
        where: { messageId },
        include: { conversation: { select: { type: true, createdById: true } } },
    })
    if (!pin) return { error: 'Not pinned' }

    const participant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId: pin.conversationId, userId } },
    })
    if (!participant) return { error: 'Not a participant' }

    // GROUP: only creator OR the user who pinned can unpin. DIRECT/TASK: any participant.
    if (pin.conversation.type === 'GROUP' && pin.conversation.createdById !== userId && pin.pinnedById !== userId) {
        return { error: 'Only the group creator or the pinner can unpin' }
    }

    await prisma.messagePin.delete({ where: { messageId } })

    return { data: { ok: true, conversationId: pin.conversationId } }
}

export async function getPinnedMessages(conversationId: string) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const participant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
    })
    if (!participant) return { error: 'Not a participant' }

    const pins = await prisma.messagePin.findMany({
        where: { conversationId },
        orderBy: { pinnedAt: 'desc' },
        include: {
            message: {
                include: {
                    sender: { select: { id: true, username: true, nickname: true, avatarUrl: true } },
                },
            },
            pinnedBy: { select: { username: true, nickname: true } },
        },
    })

    // Filter out pins on hidden-for-me messages
    const visible = pins.filter(p => {
        const hidden = (p.message.deletedForUsers as Record<string, string> | null)?.[userId]
        return !hidden && !p.message.isDeleted
    })

    return {
        data: visible.map(p => ({
            id: p.message.id,
            content: p.message.content,
            type: p.message.type,
            fileUrl: p.message.fileUrl,
            fileName: p.message.fileName,
            fileSize: p.message.fileSize,
            createdAt: p.message.createdAt.toISOString(),
            pinnedAt: p.pinnedAt.toISOString(),
            pinnedByName: p.pinnedBy.nickname || p.pinnedBy.username,
            sender: {
                id: p.message.sender.id,
                username: p.message.sender.username,
                nickname: p.message.sender.nickname,
                avatarUrl: p.message.sender.avatarUrl,
            },
        })),
    }
}

export async function setMessageImportant(messageId: string, important: boolean) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { id: true, senderId: true, conversationId: true, isDeleted: true },
    })
    if (!message) return { error: 'Message not found' }
    if (message.senderId !== userId) return { error: 'Only the sender can mark as important' }
    if (message.isDeleted) return { error: 'Cannot mark a deleted message' }

    await prisma.message.update({
        where: { id: messageId },
        data: { isImportant: !!important },
    })

    return { data: { ok: true, conversationId: message.conversationId, isImportant: !!important } }
}

// ─────────────────────────────────────────────────────────────────────────────
// Presence
// ─────────────────────────────────────────────────────────────────────────────

const VALID_PRESENCE = new Set(['ONLINE', 'OFFLINE', 'AWAY', 'BUSY'])

export async function setMyPresence(status: string) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const upper = (status || '').toUpperCase()
    if (!VALID_PRESENCE.has(upper)) return { error: 'Invalid status' }

    await prisma.userPresence.upsert({
        where: { userId },
        create: { userId, status: upper, lastHeartbeat: new Date() },
        update: { status: upper, lastHeartbeat: new Date() },
    })

    return { data: { ok: true, status: upper } }
}

export async function getMyPresence() {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const presence = await prisma.userPresence.findUnique({
        where: { userId },
        select: { status: true, lastHeartbeat: true },
    })

    return {
        data: {
            status: presence?.status || 'OFFLINE',
            lastHeartbeat: presence?.lastHeartbeat?.toISOString() || null,
        },
    }
}

// Get presence + last seen for a list of users.
export async function getUsersPresence(userIds: string[]) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }

    if (userIds.length === 0) return { data: {} }

    const records = await prisma.userPresence.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, status: true, lastHeartbeat: true },
    })

    const result: Record<string, { status: string; lastSeen: string | null }> = {}
    for (const id of userIds) {
        const r = records.find(x => x.userId === id)
        result[id] = {
            status: r?.status || 'OFFLINE',
            lastSeen: r?.lastHeartbeat?.toISOString() || null,
        }
    }
    return { data: result }
}
