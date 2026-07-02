export type TaskWithUser = { // Updated with Client Info
    id: string
    title: string
    value: number
    status: string
    type: string
    deadline: Date | null
    references: string | null
    resources: string | null
    fileLink: string | null
    productLink: string | null
    collectFilesLink?: string | null
    submissionFolder?: string | null
    notes_vi: string | null
    notes_en: string | null
    assigneeId?: string | null
    assignee: { id: string; username: string; nickname?: string | null; displayName?: string | null } | null
    // [Trial P0] "Người quản lý" — reuses assignedById (the "TaskAssigner"). Separate
    // from the Editor (assignee); the client portal shows this, never the editor.
    assignedById?: string | null
    assignedBy?: { id: string; username: string; nickname?: string | null; displayName?: string | null } | null
    createdAt: Date
    // Removed Stopwatch fields
    client?: {
        id: number
        name: string
        parent?: {
            name: string
        } | null
    } | null
    project?: {
        id: number
        name: string
    } | null
    /** [Hook Graph] Set when the task has a saved Multi-Hook Map — drives the board badge. */
    rawFootage?: { displayType: string } | null
    // Financials
    jobPriceUSD?: number | null
    wageVND?: number | null

    profitVND?: number | null

    // Marketplace & Tags
    duration?: string | null
    claimSource?: string | null
    claimedAt?: Date | string | null
    taskTags?: { tagCategory: { id: string; name: string } }[]

    // Concurrency Control
    version: number
}
