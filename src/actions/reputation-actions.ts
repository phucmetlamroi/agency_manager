'use server'

export async function checkOverdueTasks(workspaceId: string) {
    // Disabled by product rule: no automatic task recall when deadline is reached/past.
    if (!workspaceId) return { error: 'WorkspaceId required' }
    return { success: true, notifications: [] as any[] }
}
