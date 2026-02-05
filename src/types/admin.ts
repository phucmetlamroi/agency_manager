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
    notes: string | null
    assigneeId?: string | null
    assignedAgencyId?: string | null // For tasks assigned to agency queue
    assignee: { id: string; username: string; reputation?: number } | null
    createdAt: Date
    // Stopwatch
    accumulatedSeconds?: number
    timerStartedAt?: Date | null
    timerStatus?: string
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
    wageVND?: number | null
    profitVND?: number | null

    // Concurrency Control
    version: number
}
