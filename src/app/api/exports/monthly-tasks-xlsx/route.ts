import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth-guard'
import { verifyWorkspaceAccess } from '@/lib/security'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type MonthTarget = {
    year: number
    month: number
}

function parseMonthQuery(monthParam: string | null): MonthTarget | null {
    if (!monthParam) return null
    const match = monthParam.match(/^(\d{4})-(\d{2})$/)
    if (!match) return null
    const year = Number(match[1])
    const month = Number(match[2])
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null
    return { year, month }
}

function parseMonthFromWorkspaceName(workspaceName: string): MonthTarget | null {
    const match = workspaceName.match(/(\d{1,2})\s*\/\s*(\d{4})/)
    if (!match) return null
    const month = Number(match[1])
    const year = Number(match[2])
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null
    return { year, month }
}

function getVietnamMonthParts(date: Date): MonthTarget {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit'
    }).formatToParts(date)

    const yearPart = parts.find((p) => p.type === 'year')?.value ?? '1970'
    const monthPart = parts.find((p) => p.type === 'month')?.value ?? '01'
    return { year: Number(yearPart), month: Number(monthPart) }
}

function matchesVietnamMonth(date: Date | null, target: MonthTarget): boolean {
    if (!date) return false
    const p = getVietnamMonthParts(date)
    return p.year === target.year && p.month === target.month
}

function formatDateTime(date: Date | null): string {
    if (!date) return ''
    return new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date)
}

function formatClientPath(taskClient: { name: string; parent?: { name: string } | null } | null): string {
    if (!taskClient) return ''
    if (!taskClient.parent?.name) return taskClient.name
    return `${taskClient.parent.name} --> ${taskClient.name}`
}

function formatAssignee(assignee: { username: string; nickname: string | null } | null): string {
    if (!assignee) return ''
    return assignee.nickname ? `${assignee.username} (${assignee.nickname})` : assignee.username
}

function toSafeNumber(value: unknown): number {
    return Number(value || 0)
}

function sanitizeFilename(input: string): string {
    return input
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\s+/g, '_')
        .trim()
}

export async function GET(req: NextRequest) {
    try {
        const workspaceId = req.nextUrl.searchParams.get('workspaceId')
        if (!workspaceId) {
            return new NextResponse('workspaceId is required', { status: 400 })
        }

        let user
        try {
            user = await getCurrentUser()
        } catch {
            return new NextResponse('Unauthorized', { status: 401 })
        }

        // SECURITY: workspace-scoped admin check (was global ADMIN only).
        // Without this, any global ADMIN could export tasks of ANY workspace.
        try {
            await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        } catch (e: any) {
            if (e?.message?.startsWith('SECURITY_VIOLATION')) {
                return new NextResponse(e.message, { status: 403 })
            }
            return new NextResponse('Forbidden: Admin only', { status: 403 })
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { id: true, name: true, profileId: true }
        })

        if (!workspace) {
            return new NextResponse('Workspace not found', { status: 404 })
        }

        if (!user.profileId || workspace.profileId !== user.profileId) {
            return new NextResponse('Forbidden: Cross-profile export is not allowed', { status: 403 })
        }

        const monthFromQuery = parseMonthQuery(req.nextUrl.searchParams.get('month'))
        const monthFromWorkspace = parseMonthFromWorkspaceName(workspace.name)
        const targetMonth = monthFromQuery || monthFromWorkspace

        if (!targetMonth) {
            return new NextResponse('Unable to determine month. Pass query ?month=YYYY-MM', { status: 400 })
        }

        const allWorkspaceTasks = await prisma.task.findMany({
            where: {
                workspaceId: workspace.id,
                profileId: workspace.profileId
            },
            include: {
                assignee: {
                    select: { username: true, nickname: true }
                },
                client: {
                    select: {
                        name: true,
                        parent: { select: { name: true } }
                    }
                },
                project: {
                    select: { name: true }
                }
            },
            orderBy: [{ deadline: 'asc' }, { createdAt: 'asc' }]
        })

        const deadlineMatchedTasks = allWorkspaceTasks.filter((task) =>
            matchesVietnamMonth(task.deadline, targetMonth)
        )
        const createdAtMatchedTasks = allWorkspaceTasks.filter((task) =>
            matchesVietnamMonth(task.createdAt, targetMonth)
        )

        let monthlyTasks = deadlineMatchedTasks
        let filterBasis = 'deadline'
        if (monthlyTasks.length === 0) {
            monthlyTasks = createdAtMatchedTasks
            filterBasis = 'createdAt-fallback'
        }
        if (monthlyTasks.length === 0) {
            monthlyTasks = allWorkspaceTasks
            filterBasis = 'workspace-fallback'
        }

        const workbook = new ExcelJS.Workbook()
        workbook.creator = 'AgencyManager'
        workbook.created = new Date()
        workbook.modified = new Date()

        const tasksSheet = workbook.addWorksheet('Tasks')
        tasksSheet.columns = [
            { header: 'STT', key: 'index', width: 8 },
            { header: 'Task ID', key: 'taskId', width: 40 },
            { header: 'Title', key: 'title', width: 40 },
            { header: 'Client Path', key: 'clientPath', width: 30 },
            { header: 'Project', key: 'projectName', width: 24 },
            { header: 'Assignee', key: 'assignee', width: 24 },
            { header: 'Status', key: 'status', width: 18 },
            { header: 'Type', key: 'type', width: 16 },
            { header: 'Deadline (VN)', key: 'deadline', width: 22 },
            { header: 'Archived', key: 'archived', width: 12 },
            { header: 'Wage (VND)', key: 'wageVND', width: 16 },
            { header: 'Price (USD)', key: 'jobPriceUSD', width: 14 },
            { header: 'Value (VND)', key: 'valueVND', width: 16 },
            { header: 'Created (VN)', key: 'createdAt', width: 22 },
            { header: 'Updated (VN)', key: 'updatedAt', width: 22 }
        ]

        tasksSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
        tasksSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF111827' }
        }
        tasksSheet.views = [{ state: 'frozen', ySplit: 1 }]
        tasksSheet.autoFilter = {
            from: 'A1',
            to: 'O1'
        }

        monthlyTasks.forEach((task, idx) => {
            tasksSheet.addRow({
                index: idx + 1,
                taskId: task.id,
                title: task.title,
                clientPath: formatClientPath(task.client),
                projectName: task.project?.name ?? '',
                assignee: formatAssignee(task.assignee),
                status: task.status,
                type: task.type,
                deadline: formatDateTime(task.deadline),
                archived: task.isArchived ? 'YES' : 'NO',
                wageVND: toSafeNumber(task.wageVND),
                jobPriceUSD: toSafeNumber(task.jobPriceUSD),
                valueVND: toSafeNumber(task.value),
                createdAt: formatDateTime(task.createdAt),
                updatedAt: formatDateTime(task.updatedAt)
            })
        })

        ;['K', 'L', 'M'].forEach((col) => {
            tasksSheet.getColumn(col).numFmt = '#,##0'
        })

        const summarySheet = workbook.addWorksheet('Summary')
        const archivedCount = monthlyTasks.filter((task) => task.isArchived).length
        const unarchivedCount = monthlyTasks.length - archivedCount

        const statusCounts = monthlyTasks.reduce<Record<string, number>>((acc, task) => {
            acc[task.status] = (acc[task.status] || 0) + 1
            return acc
        }, {})

        const totalWage = monthlyTasks.reduce((sum, task) => sum + toSafeNumber(task.wageVND), 0)
        const totalUsd = monthlyTasks.reduce((sum, task) => sum + toSafeNumber(task.jobPriceUSD), 0)

        summarySheet.addRow(['AGENCY MANAGER - MONTHLY TASK BACKUP'])
        summarySheet.addRow([])
        summarySheet.addRow(['Workspace', workspace.name])
        summarySheet.addRow(['Workspace ID', workspace.id])
        summarySheet.addRow(['Profile ID', workspace.profileId])
        summarySheet.addRow(['Month (deadline)', `${targetMonth.year}-${String(targetMonth.month).padStart(2, '0')}`])
        summarySheet.addRow(['Filter Basis', filterBasis])
        summarySheet.addRow(['Exported At (VN)', formatDateTime(new Date())])
        summarySheet.addRow(['Exported By', user.username || user.email || user.id])
        summarySheet.addRow(['Total Tasks', monthlyTasks.length])
        summarySheet.addRow(['Matched by Deadline', deadlineMatchedTasks.length])
        summarySheet.addRow(['Matched by CreatedAt', createdAtMatchedTasks.length])
        summarySheet.addRow(['Archived Tasks', archivedCount])
        summarySheet.addRow(['Active Tasks', unarchivedCount])
        summarySheet.addRow(['Total Wage VND', totalWage])
        summarySheet.addRow(['Total Price USD', totalUsd])
        summarySheet.addRow([])
        summarySheet.addRow(['Status', 'Count'])

        Object.entries(statusCounts)
            .sort((a, b) => b[1] - a[1])
            .forEach(([status, count]) => {
                summarySheet.addRow([status, count])
            })

        summarySheet.getColumn(1).width = 28
        summarySheet.getColumn(2).width = 26
        summarySheet.getRow(1).font = { bold: true, size: 14 }
        summarySheet.getRow(17).font = { bold: true }

        const rawBuffer = await workbook.xlsx.writeBuffer()
        const fileBuffer = Buffer.isBuffer(rawBuffer)
            ? rawBuffer
            : Buffer.from(rawBuffer as ArrayBuffer)

        const monthToken = `${targetMonth.year}-${String(targetMonth.month).padStart(2, '0')}`
        const safeWorkspaceName = sanitizeFilename(workspace.name)
        const fileName = `${safeWorkspaceName}_${monthToken}_backup.xlsx`

        return new NextResponse(fileBuffer as any, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'Cache-Control': 'no-store'
            }
        })
    } catch (error: any) {
        console.error('Monthly XLSX export error:', error)
        return new NextResponse(`Export failed: ${error.message || 'unknown error'}`, { status: 500 })
    }
}
