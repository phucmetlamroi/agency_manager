/* Serialized DTO shapes consumed by the Calm-Dark portal surfaces.
   (Output of getClientTasks / getClientInvoices after serializeDecimal.) */

export type SurfaceId = 'overview' | 'deliverables' | 'invoices'

export interface RatingDTO {
    creativeQuality: number
    responsiveness: number
    communication: number
    qualitativeFeedback: string | null
}

export interface Deliverable {
    id: string
    title: string
    type: string
    status: string
    clientStatus: string
    needsYou: boolean
    deadline: string | null
    createdAt: string
    updatedAt: string
    productLink: string | null
    references: string | null
    resources: string | null
    collectFilesLink: string | null
    notes_vi: string | null
    notes_en: string | null
    frameUsername: string | null
    framePassword: string | null
    frameNote: string | null
    duration: string | null
    clientReview: string | null
    clientFeedback: string | null
    clientReviewedAt: string | null
    clientId: number | null
    client: { id: number; name: string; parent?: { name: string } | null } | null
    clientPath: string
    project: { id: number; name: string } | null
    rating: RatingDTO | null
    assignee: { username: string; nickname: string | null } | null
}

export interface Invoice {
    id: string
    invoiceNumber: string
    issueDate: string
    dueDate: string | null
    totalDue: number
    status: string
    filePath: string | null
    clientId: number | null
    items: { description: string; amount: number; quantity: number }[]
}

/** A sub-brand / channel = a distinct Client among the user's data. */
export interface Brand {
    id: number
    name: string
}

export interface ActivityItem {
    label: string
    who: string
    date: string
}

/** Derive the distinct sub-brands (channels) from deliverables. */
export function deriveBrands(deliverables: Deliverable[]): Brand[] {
    const map = new Map<number, string>()
    for (const d of deliverables) {
        if (d.client?.id != null) map.set(d.client.id, d.client.name)
    }
    return Array.from(map.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name))
}

/** The client account name (root client) — used in the sidebar brand lockup. */
export function deriveAccountName(deliverables: Deliverable[], fallback: string): string {
    const counts = new Map<string, number>()
    for (const d of deliverables) {
        const root = d.client?.parent?.name || d.client?.name
        if (root) counts.set(root, (counts.get(root) || 0) + 1)
    }
    let best = fallback, bestN = 0
    for (const [name, n] of counts) if (n > bestN) { best = name; bestN = n }
    return best
}

/** Most recent updatedAt across deliverables (drives the "Updated …" chip). */
export function deriveLastUpdated(deliverables: Deliverable[]): string | null {
    let max: number | null = null
    for (const d of deliverables) {
        const t = new Date(d.updatedAt).getTime()
        if (!isNaN(t) && (max === null || t > max)) max = t
    }
    return max === null ? null : new Date(max).toISOString()
}

/** Scope filter — 'all' or a specific sub-brand (client) id. */
export function scopeFilterDeliverables(list: Deliverable[], scope: number | 'all'): Deliverable[] {
    return scope === 'all' ? list : list.filter(d => d.client?.id === scope)
}
export function scopeFilterInvoices(list: Invoice[], scope: number | 'all'): Invoice[] {
    return scope === 'all' ? list : list.filter(i => i.clientId === scope)
}
