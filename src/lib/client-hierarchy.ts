type ClientNode = {
    name: string
    parent?: {
        name: string
    } | null
} | null | undefined

const CLIENT_NAME_ALIASES: Record<string, string> = {
    thinkfire: 'Think Fire',
    personal: 'Personal'
}

export function normalizeClientDisplayName(name?: string | null): string {
    if (!name) return ''
    const cleaned = name
        .replace(/\]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim()

    if (!cleaned) return ''
    return CLIENT_NAME_ALIASES[cleaned.toLowerCase()] || cleaned
}

export function formatClientHierarchy(client?: ClientNode): string {
    if (!client?.name) return ''
    const childName = normalizeClientDisplayName(client.name)
    const parentName = normalizeClientDisplayName(client.parent?.name)
    return parentName ? `${parentName} --> ${childName}` : childName
}

