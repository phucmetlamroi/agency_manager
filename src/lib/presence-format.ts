// Format presence status + last seen time for display.

export type PresenceStatus = 'ONLINE' | 'OFFLINE' | 'AWAY' | 'BUSY'

export function presenceColor(status: string): string {
    switch (status) {
        case 'ONLINE': return 'bg-emerald-500'
        case 'AWAY': return 'bg-yellow-500'
        case 'BUSY': return 'bg-red-500'
        default: return 'bg-zinc-600'
    }
}

export function presenceLabel(status: string): string {
    switch (status) {
        case 'ONLINE': return 'Online'
        case 'AWAY': return 'Away'
        case 'BUSY': return 'Busy'
        default: return 'Offline'
    }
}

// "2m ago", "1h ago", "yesterday", "5d ago", "Mar 12"
export function formatLastSeen(iso: string | null): string {
    if (!iso) return 'never'
    const date = new Date(iso)
    const now = Date.now()
    const diffMs = now - date.getTime()
    const min = Math.floor(diffMs / 60000)
    if (min < 1) return 'just now'
    if (min < 60) return `${min}m ago`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr}h ago`
    const day = Math.floor(hr / 24)
    if (day === 1) return 'yesterday'
    if (day < 7) return `${day}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Compose a subtitle: "Online" / "Away" / "Last seen 2h ago"
export function presenceSubtitle(status: string, lastSeen: string | null): string {
    if (status === 'ONLINE') return 'Online'
    if (status === 'AWAY') return 'Away'
    if (status === 'BUSY') return 'Busy — please don\'t disturb'
    if (lastSeen) return `Last seen ${formatLastSeen(lastSeen)}`
    return 'Offline'
}
