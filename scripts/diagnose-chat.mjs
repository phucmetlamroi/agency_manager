import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
try {
    const enums = await p.$queryRawUnsafe('SELECT unnest(enum_range(NULL::"ChannelType"))::text AS v')
    console.log('ChannelType enum values:', enums.map((r) => r.v).join(', '))

    // Test getHubData query
    const channels = await p.channel.findMany({
        where: { type: { in: ['TEXT', 'WIKI', 'FORUM', 'VOICE'] } },
        select: { id: true, name: true, type: true, workspaceId: true },
        take: 5,
    })
    console.log('Sample channels (' + channels.length + '):')
    for (const c of channels) console.log(`  - ${c.name} [${c.type}] ws=${c.workspaceId.slice(0, 8)}`)

    // Test getMessages-like query with linkPreviews
    if (channels.length > 0) {
        const ch = channels[0]
        try {
            const msgs = await p.message.findMany({
                where: { channelId: ch.id, workspaceId: ch.workspaceId },
                include: {
                    author: { select: { id: true, username: true } },
                    reactions: true,
                    attachments: true,
                    linkPreviews: true,
                },
                take: 3,
            })
            console.log(`getMessages on "${ch.name}": OK (${msgs.length} rows)`)
        } catch (e) {
            console.log(`getMessages on "${ch.name}": FAIL — ${e.message?.slice(0, 200)}`)
        }
    }
} catch (e) {
    console.error('DIAGNOSE FAIL:', e.message)
    process.exit(1)
} finally {
    await p.$disconnect()
}
