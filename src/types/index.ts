export type TaskWithUser = {
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
    notes: string | null
    assignee: { username: string } | null
    createdAt: Date
}
