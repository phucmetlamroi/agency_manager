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
    // [Trial P0] The editor (assignee) is NEVER sent to the client — always null on
    // the token portal. The client only ever sees `manager` (their coordinator).
    assignee: { username: string; nickname: string | null } | null
    manager?: string | null
    /** [2026-06-29] Agency USD price of this job — the price the CLIENT pays. Shown to the
     *  client (their bill) in the token-gated share portal and to admins; staff never get it. */
    jobPriceUSD: number | null
    /** [Atelier] The period/workspace this deliverable lives in (admin "Tháng X/2026"). */
    workspaceId: string | null
    workspaceName: string | null
    /** [B5/P4] The READY review cut, surfaced from the review module (source of truth) so the
     *  client can watch it embedded in the portal. Present ONLY for client-phase tasks with a
     *  live READY task-linked asset (R5-gated). `tokens` are short-lived signed Mux JWTs. */
    reviewVideo?: {
        playbackId: string
        versionId: string
        durationMs: number | null
        tokens: { playback: string; thumbnail: string; storyboard: string }
        expiresAt: string
    } | null
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
    workspaceId: string | null
    workspaceName: string | null
}

/** A period the work was booked under — mirrors the admin's workspace switcher. */
export interface Workspace {
    id: string
    name: string
}

/** A sub-brand / channel = a distinct Client among the user's data. */
export interface Brand {
    id: number
    name: string
    /** Deliverable count in the current view (drives the channel switcher subtitle). */
    count?: number
    /** Most-recent activity ISO — used to sort channels by what's moving. */
    lastActivity?: string | null
}

export interface ActivityItem {
    label: string
    who: string
    date: string
}

/**
 * [Canonical Clients] Action adapter injected into DeliverableDetailPanel so
 * the same calm UI serves both credential models:
 *   - account portal (session-gated client-portal-actions) — removed in P5
 *   - public share-link portal (token-gated share-portal-actions)
 * The adapter closes over its credential (workspaceId or token) — the panel
 * never needs to know which world it's in.
 */
export interface DeliverableActions {
    approve: (taskId: string) => Promise<{ success?: boolean; error?: string }>
    requestChanges: (taskId: string, notes: string) => Promise<{ success?: boolean; error?: string }>
    rate: (
        taskId: string,
        creativeQuality: number,
        responsiveness: number,
        communication: number,
        qualitativeFeedback?: string,
    ) => Promise<{ success: boolean; error?: string }>
    activity: (taskId: string) => Promise<ActivityItem[]>
    /** [Client Task Submission] dropdown options for the create-task form (scope-bound). */
    getSubmitOptions?: () => Promise<{
        workspaces: { id: string; label: string }[]
        brands: { id: number; name: string }[]
        clientName?: string
    } | null>
    /** [Client Task Submission v1 — legacy] create a NEW task from the portal. */
    createTask?: (input: {
        workspaceId: string
        clientId: number
        title: string
        rawLink: string
        brollLink?: string
        notes?: string
    }) => Promise<{ success?: boolean; error?: string; taskId?: string }>
    /**
     * [Client Task Submission v2] submit a work REQUEST (ClientTaskRequest) from
     * the 5-step wizard — full asset-link set, no finance/assignee/frame fields.
     */
    submitRequest?: (input: {
        workspaceId: string
        clientId: number
        title: string
        videoList?: string
        desiredType?: string
        desiredDeadline?: string
        rawFootage: string
        collectFile?: string
        bRoll?: string
        references?: string
        submitFolder?: string
        script?: string
        notes?: string
    }) => Promise<{ success?: boolean; error?: string; requestId?: string }>
    /** [Client Task Submission v2] create a sub-brand under an in-scope parent. */
    createSubClient?: (input: { name: string; parentId: number }) =>
        Promise<{ success?: boolean; error?: string; clientId?: number; name?: string }>
    /** [Trial P1/P3] Task comment feed for the client (CLIENT-visibility only, hard-filtered server-side). */
    getCommentFeed?: (taskId: string) => Promise<Array<{ kind: 'comment' | 'event'; id: string; authorName: string; body?: string; label?: string; createdAt: string; isMine?: boolean; parentId?: string | null; reactions?: { emoji: string; count: number; mine: boolean }[] }>>
    /** [Trial P1/P3] Client posts a comment (forced CLIENT visibility); parentId → a reply. */
    postComment?: (taskId: string, body: string, parentId?: string | null) => Promise<{ success?: boolean; error?: string }>
    /** [Trial P3] Client toggles an emoji reaction on a CLIENT-visible comment. */
    reactComment?: (commentId: string, emoji: string) => Promise<{ success?: boolean; error?: string }>
}

/**
 * Derive the distinct sub-brands (channels) from deliverables, enriched with a
 * count + last-activity timestamp and ordered the way a person scans a studio
 * board: the channel with the freshest movement first, ties broken by volume,
 * then alphabetically. ("lọc và sắp xếp thông minh hơn".)
 */
export function deriveBrands(deliverables: Deliverable[]): Brand[] {
    const map = new Map<number, { name: string; count: number; last: number }>()
    for (const d of deliverables) {
        if (d.client?.id == null) continue
        const t = new Date(d.updatedAt).getTime()
        const cur = map.get(d.client.id)
        if (cur) {
            cur.count++
            if (!isNaN(t) && t > cur.last) cur.last = t
        } else {
            map.set(d.client.id, { name: d.client.name, count: 1, last: isNaN(t) ? 0 : t })
        }
    }
    return Array.from(map.entries())
        .map(([id, v]) => ({ id, name: v.name, count: v.count, lastActivity: v.last ? new Date(v.last).toISOString() : null }))
        .sort((a, b) => (b.lastActivity || '').localeCompare(a.lastActivity || '') || (b.count! - a.count!) || a.name.localeCompare(b.name))
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

/** Period filter — 'all' or a specific workspace id (the admin-style switcher). */
export function workspaceFilterDeliverables(list: Deliverable[], ws: string | 'all'): Deliverable[] {
    return ws === 'all' ? list : list.filter(d => d.workspaceId === ws)
}
export function workspaceFilterInvoices(list: Invoice[], ws: string | 'all'): Invoice[] {
    return ws === 'all' ? list : list.filter(i => i.workspaceId === ws)
}
