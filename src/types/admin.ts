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
    notes_vi: string | null
    notes_en: string | null
    assigneeId?: string | null
    assignee: { id: string; username: string } | null
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
