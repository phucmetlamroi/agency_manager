'use server'

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'

async function getAuthSession(): Promise<{ userId: string; profileId: string } | null> {
    const session = await getSession()
    if (!session?.user?.id) return null
    const profileId = (session.user as any)?.sessionProfileId
    if (!profileId) return null
    return { userId: session.user.id, profileId }
}

export async function searchContacts(query: string, _profileId?: string) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId, profileId } = auth

    const q = query.trim().toLowerCase()
    if (!q) return { data: [] }

    // Determine if searching by email (contains @) or by name
    const isEmailSearch = q.includes('@')

    // Search ALL users in the system — no profile restriction.
    // For name queries, search username/nickname/email.
    // For email queries, prioritize exact/partial email match.
    const users = await prisma.user.findMany({
        where: {
            id: { not: userId },
            role: { notIn: ['LOCKED', 'CLIENT'] },
            OR: isEmailSearch
                ? [{ email: { contains: q, mode: 'insensitive' } }]
                : [
                    { username: { contains: q, mode: 'insensitive' } },
                    { nickname: { contains: q, mode: 'insensitive' } },
                    { email: { contains: q, mode: 'insensitive' } },
                ],
        },
        select: {
            id: true,
            username: true,
            nickname: true,
            email: true,
            avatarUrl: true,
            profileId: true,
            profile: { select: { name: true } },
        },
        take: 20,
        orderBy: { username: 'asc' },
    })

    const withContactStatus = await Promise.all(
        users.map(async user => {
            const contact = await prisma.contact.findFirst({
                where: {
                    OR: [
                        { requesterId: userId, receiverId: user.id },
                        { requesterId: user.id, receiverId: userId },
                    ],
                },
                select: { status: true, requesterId: true },
            })

            return {
                ...user,
                profileName: user.profile?.name || null,
                contactStatus: contact?.status || null,
                isRequester: contact?.requesterId === userId || false,
                isSameProfile: user.profileId === profileId,
            }
        })
    )

    return { data: withContactStatus }
}

export async function sendContactRequest(receiverId: string) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth
    if (userId === receiverId) return { error: 'Cannot add yourself' }

    const existing = await prisma.contact.findFirst({
        where: {
            OR: [
                { requesterId: userId, receiverId },
                { requesterId: receiverId, receiverId: userId },
            ],
        },
    })

    if (existing) {
        if (existing.status === 'ACCEPTED') return { error: 'Already contacts' }
        if (existing.status === 'PENDING') return { error: 'Request already pending' }
        if (existing.status === 'BLOCKED') return { error: 'Contact blocked' }
        if (existing.status === 'DECLINED') {
            await prisma.contact.update({
                where: { id: existing.id },
                data: { status: 'PENDING', requesterId: userId, receiverId, updatedAt: new Date() },
            })
            return { data: { status: 'PENDING' } }
        }
    }

    await prisma.contact.create({
        data: { requesterId: userId, receiverId, status: 'PENDING' },
    })

    return { data: { status: 'PENDING' } }
}

export async function respondToContactRequest(contactId: string, accept: boolean) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const contact = await prisma.contact.findUnique({ where: { id: contactId } })
    if (!contact || contact.receiverId !== userId) return { error: 'Not found' }
    if (contact.status !== 'PENDING') return { error: 'Not pending' }

    const newStatus = accept ? 'ACCEPTED' : 'DECLINED'
    await prisma.contact.update({
        where: { id: contactId },
        data: { status: newStatus },
    })

    if (accept) {
        const existingConv = await prisma.conversation.findFirst({
            where: {
                type: 'DIRECT',
                AND: [
                    { participants: { some: { userId } } },
                    { participants: { some: { userId: contact.requesterId } } },
                ],
            },
        })

        if (!existingConv) {
            await prisma.conversation.create({
                data: {
                    type: 'DIRECT',
                    createdById: userId,
                    participants: {
                        create: [
                            { userId },
                            { userId: contact.requesterId },
                        ],
                    },
                },
            })
        }
    }

    return { data: { status: newStatus } }
}

export async function getContactRequests() {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const requests = await prisma.contact.findMany({
        where: { receiverId: userId, status: 'PENDING' },
        include: {
            requester: {
                select: {
                    id: true, username: true, nickname: true, avatarUrl: true, email: true,
                    profile: { select: { name: true } },
                },
            },
        },
        orderBy: { createdAt: 'desc' },
    })

    return {
        data: requests.map(r => ({
            id: r.id,
            requester: {
                ...r.requester,
                profileName: r.requester.profile?.name || null,
            },
            createdAt: r.createdAt.toISOString(),
        })),
    }
}

export async function getContacts() {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const contacts = await prisma.contact.findMany({
        where: {
            status: 'ACCEPTED',
            OR: [{ requesterId: userId }, { receiverId: userId }],
        },
        include: {
            requester: {
                select: { id: true, username: true, nickname: true, avatarUrl: true, presence: { select: { status: true } } },
            },
            receiver: {
                select: { id: true, username: true, nickname: true, avatarUrl: true, presence: { select: { status: true } } },
            },
        },
    })

    return {
        data: contacts.map(c => {
            const other = c.requesterId === userId ? c.receiver : c.requester
            return {
                contactId: c.id,
                user: {
                    id: other.id,
                    username: other.username,
                    nickname: other.nickname,
                    avatarUrl: other.avatarUrl,
                    presenceStatus: other.presence?.status || 'OFFLINE',
                },
            }
        }),
    }
}

export async function blockContact(targetUserId: string) {
    const auth = await getAuthSession()
    if (!auth) return { error: 'Unauthorized' }
    const { userId } = auth

    const contact = await prisma.contact.findFirst({
        where: {
            OR: [
                { requesterId: userId, receiverId: targetUserId },
                { requesterId: targetUserId, receiverId: userId },
            ],
        },
    })

    if (contact) {
        await prisma.contact.update({
            where: { id: contact.id },
            data: { status: 'BLOCKED' },
        })
    } else {
        await prisma.contact.create({
            data: { requesterId: userId, receiverId: targetUserId, status: 'BLOCKED' },
        })
    }

    return { data: { status: 'BLOCKED' } }
}
