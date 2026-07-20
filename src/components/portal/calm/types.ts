/* Serialized DTO shapes consumed by the Calm-Dark portal surfaces.
   (Output of getClientTasks / getClientInvoices after serializeDecimal.) */

export type SurfaceId = 'overview' | 'deliverables' | 'documents' | 'invoices'

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
    /** [B5/P4] The `/r/{slug}` guest review board for this deliverable — where the client
     *  watches the cut, leaves timecode comments, annotates and approves. Present ONLY for
     *  client-phase tasks with a live READY task-linked asset (R5-gated). */
    reviewUrl?: string | null
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
    /**
     * `amount` is the LINE TOTAL already (unitPrice × quantity — see InvoiceModal's
     * `const amount = unitPrice * quantity`, and the admin subtotal which sums
     * `amount` directly). Render it AS-IS: multiplying by `quantity` again inflates
     * every line and makes them stop summing to `totalDue`.
     */
    items: { description: string; amount: number; quantity: number; unitPrice?: number }[]
    workspaceId: string | null
    workspaceName: string | null
    /** [Statements 2026-07] Money breakdown. Optional — only the share portal selects these. */
    subtotalAmount?: number
    taxPercent?: number
    taxAmount?: number
    depositDeducted?: number
    /** Client-facing payment details, whitelisted server-side out of billingSnapshot. */
    bank?: {
        agencyName: string | null
        beneficiaryName: string | null
        bankName: string | null
        accountNumber: string | null
        swiftCode: string | null
        address: string | null
        notes: string | null
    } | null
}

/** A period the work was booked under — mirrors the admin's workspace switcher. */
export interface DocumentVersion {
    id: string
    versionNumber: number
    fileName: string
    sizeBytes: string
    durationMs: number | null
    width: number | null
    height: number | null
    createdAt: string
    posterUrl: string | null
    storyboardVttUrl: string | null
    publicCommentCount: number
}

export interface DocumentAsset {
    id: string
    folderId: string
    title: string
    mediaKind: 'video' | 'image'
    workspaceId: string
    workspaceName: string | null
    clientId: number | null
    clientName: string | null
    statusLabel: string | null
    reviewUrl: string | null
    versionCount: number
    currentVersion: DocumentVersion
    createdAt: string
}

export interface DocumentFolder {
    id: string
    parentId: string | null
    name: string
    workspaceId: string | null
    clientId: number | null
    itemCount: number
    totalBytes: string
    kind: 'workspace' | 'client' | 'folder' | 'uncategorized'
}

export interface DocumentsSnapshot {
    folders: DocumentFolder[]
    assets: DocumentAsset[]
    summary: { folderCount: number; assetCount: number; totalBytes: string }
    generatedAt: string
}

export interface Workspace {
    id: string
    name: string
}

/**
 * [The Desk] A client work-request row echoed back to the portal's
 * Correspondence surface. Read-only, token-scoped, English — the studio's reply
 * is `studioReply` (only on decline) / `linkedTaskId` (only on accept). Staff-only
 * fields (reviewedById, finance, provenance) are never selected server-side.
 */
export interface ClientRequestPortalDTO {
    id: string
    title: string
    status: 'pending' | 'reviewing' | 'accepted' | 'declined'
    statusLabel: string
    submittedAt: string
    reviewedAt: string | null
    desiredType: string | null
    desiredDeadline: string | null
    videoList: string | null
    notes: string | null
    rawFootage: string | null
    collectFile: string | null
    bRoll: string | null
    refs: string | null
    submitFolder: string | null
    script: string | null
    studioReply: string | null
    linkedTaskId: string | null
    brandName: string | null
    periodName: string | null
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
    /** [Phase C] Notification-email settings — all token-bound; presence of notifyGet gates the Settings gear. */
    notifyGet?: () => Promise<{ email: string | null; verified: boolean; pending: string | null } | null>
    notifyRequest?: (email: string) => Promise<{ success: boolean; error?: string }>
    notifyVerify?: (code: string) => Promise<{ success: boolean; error?: string }>
    notifyRemove?: () => Promise<{ success: boolean; error?: string }>
    /** [The Desk] Token-scoped read of the client's own work requests + studio reply (Correspondence). */
    getRequests?: () => Promise<ClientRequestPortalDTO[] | null>
    /**
     * [Statements 2026-07] Build the href for an invoice PDF. Returns a URL rather
     * than a Promise so the UI can render a plain <a download> (no blob juggling).
     * Only the share portal supplies it — the token stays inside that closure, and
     * the route re-authorizes the id against the token's scope server-side.
     */
    invoicePdfUrl?: (invoiceId: string) => string
    /**
     * [Onboarding 2026-07] Called just before the screening room opens. Mints a review
     * guest session from the portal's already-verified notify email, so a client who
     * confirmed their email once is never asked to identify themselves again. Awaited
     * so the cookie exists before the iframe loads; failure is non-fatal (the player
     * falls back to its own identity modal).
     */
    prepareScreening?: (reviewUrl: string) => Promise<void>
    /** Token-scoped client Document browser. Server re-checks client/workspace scope on every call. */
    documents?: () => Promise<DocumentsSnapshot | null>
    downloadDocuments?: (versionIds: string[]) => Promise<{
        success: boolean
        error?: string
        files?: { versionId: string; fileName: string; url: string; expiresAt: string }[]
    }>
    /**
     * [Client bulk download 2026-07] URL of ONE streamed .zip — a whole folder, or the
     * entire library when folderId is null. A URL rather than a Promise so the browser
     * downloads it natively (progress bar, resumable, no blob in memory).
     *
     * WHY: a client asked to leave for Frame.io over exactly this — "we're not able to
     * download every project as one … you have to click on the individual reel". The old
     * multi-select fired one <a download> per file, which browsers throttle or block.
     */
    zipUrl?: (folderId: string | null) => string
    /**
     * [Client bulk download 2026-07] URL of ONE archive holding exactly the ticked
     * files — the Frame.io behaviour: select many, press Download once, get one file.
     * The old adapter (downloadDocuments) returned N presigned URLs and the UI fired
     * one <a download> per file, which browsers throttle or block outright.
     */
    zipUrlForAssets?: (assetIds: string[]) => string
    /**
     * [Batch approval 2026-07] Approve many deliverables at once. Clients who commission
     * a month of reels in one go had to approve each video by hand — and the review
     * room's Download only unlocks after approval, so 20 videos meant 20 round trips
     * before they could take delivery. Server re-checks EVERY task against the same
     * gates as the single approve; ineligible ones come back in `skipped`, never approved.
     */
    approveMany?: (taskIds: string[]) => Promise<{ success: boolean; approved: number; skipped: number; error?: string }>
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
