import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
try {
    // Find the "Mẹo" channel + a real user from it
    const channel = await p.channel.findFirst({ where: { name: 'Mẹo' }, select: { id: true, workspaceId: true, profileId: true } })
    if (!channel) { console.log('No Mẹo channel'); process.exit(1) }
    console.log('Channel:', channel.id)

    // Find a ChannelMember (any user that can post)
    const member = await p.channelMember.findFirst({ where: { channelId: channel.id }, select: { userId: true } })
    if (!member) { console.log('No member found'); process.exit(1) }
    console.log('Author:', member.userId)

    // Try to CREATE a message exactly like sendMessage does
    const created = await p.message.create({
        data: {
            workspaceId: channel.workspaceId,
            profileId: channel.profileId,
            channelId: channel.id,
            authorId: member.userId,
            content: 'diagnose-' + Date.now(),
        },
        include: {
            author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
            reactions: { select: { emoji: true, userId: true } },
            attachments: {
                select: { id: true, url: true, fileName: true, mimeType: true, sizeBytes: true, width: true, height: true },
                orderBy: { createdAt: 'asc' },
            },
            linkPreviews: {
                select: { id: true, url: true, title: true, description: true, imageUrl: true, siteName: true },
                orderBy: { createdAt: 'asc' },
            },
        },
    })
    console.log('Create OK:', created.id)
    // Cleanup
    await p.message.delete({ where: { id: created.id } })
    console.log('Cleaned up')
} catch (e) {
    console.error('SEND DIAGNOSE FAIL:', e.message)
    console.error('Code:', e.code)
    if (e.meta) console.error('Meta:', JSON.stringify(e.meta))
    process.exit(1)
} finally {
    await p.$disconnect()
}
