'use server'

import { put } from '@vercel/blob'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import sharp from 'sharp'
import { validateChatFile } from '@/lib/chat-file-types'

export async function uploadChatFile(conversationId: string, formData: FormData) {
    const session = await getSession()
    if (!session?.user?.id) return { error: 'Unauthorized' }
    const userId = session.user.id

    const participant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
    })
    if (!participant) return { error: 'Not a participant' }

    const file = formData.get('file') as File
    if (!file) return { error: 'No file' }

    const viewOnce = formData.get('viewOnce') === 'true'

    // Strict allow-list validation (mirrors client-side).
    const validation = validateChatFile({ name: file.name, type: file.type, size: file.size })
    if (!validation.ok) {
        return { error: validation.error || 'File rejected' }
    }
    const category = validation.category!

    const arrayBuf = await file.arrayBuffer()
    const buffer = Buffer.from(new Uint8Array(arrayBuf))
    let uploadBuffer: Buffer = buffer
    let ext = file.name.split('.').pop() || 'bin'
    let contentType = file.type

    // Compress images to WebP for delivery efficiency. Skip HEIC (sharp can't decode without libheif).
    const shouldCompress = category === 'image' && !file.type.includes('heic') && !file.type.includes('heif')
    if (shouldCompress) {
        uploadBuffer = await sharp(buffer)
            .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 85 })
            .toBuffer()
        ext = 'webp'
        contentType = 'image/webp'
    }

    const filename = `chat/${conversationId}/${Date.now()}-${userId.slice(0, 8)}.${ext}`

    const blob = await put(filename, uploadBuffer, {
        access: 'public',
        contentType,
    })

    // Map category → Prisma MessageType. Video/audio/doc all go into FILE (no dedicated enum).
    const messageType: 'IMAGE' | 'FILE' = category === 'image' ? 'IMAGE' : 'FILE'

    const message = await prisma.message.create({
        data: {
            conversationId,
            senderId: userId,
            content: file.name,
            type: messageType,
            fileUrl: blob.url,
            fileName: file.name,
            fileSize: file.size,
            viewOnce,
        },
        include: {
            sender: {
                select: { id: true, username: true, nickname: true, avatarUrl: true },
            },
        },
    })

    await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
    })

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
            replyToId: null,
            isEdited: false,
            isDeleted: false,
            editedAt: null,
            deletedAt: null,
            viewOnce: message.viewOnce,
            viewed: false,
            expired: false,
            createdAt: message.createdAt.toISOString(),
            sender: message.sender,
            replyTo: null,
            reactions: [],
            category,
        },
    }
}
