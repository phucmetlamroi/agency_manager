'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { format } from 'date-fns'

export async function confirmPayment(data: {
    userId: string
    month: number
    year: number
    baseSalary: number
    bonus: number
    totalAmount: number
}, workspaceId: string) {
    try {
        // Upsert Payroll Record
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        const payroll = await workspacePrisma.payroll.upsert({
            where: {
                userId_month_year: {
                    userId: data.userId,
                    month: data.month,
                    year: data.year
                }
            },
            update: {
                status: 'PAID',
                paidAt: new Date(),
                baseSalary: data.baseSalary,
                bonus: data.bonus,
                totalAmount: data.totalAmount,
            },
            create: {
                userId: data.userId,
                month: data.month,
                year: data.year,
                baseSalary: data.baseSalary,
                bonus: data.bonus,
                totalAmount: data.totalAmount,
                status: 'PAID',
                paidAt: new Date()
            }
        })

        revalidatePath(`/${workspaceId}/admin/users`) // Or wherever payroll is shown
        // Send Email logic would go here (omitted for now)

        return { success: true }
    } catch (error) {
        console.error('Payment error:', error)
        return { error: 'Payment failed' }
    }
}

export async function getPayrollData(month: number, year: number, workspaceId: string) {
    // Fetch all users and their payroll status for the specific month
    // Note: We're fetching 'USER' role users here, may need workspace scoping if users are per-workspace
    const workspacePrisma = getWorkspacePrisma(workspaceId)
    const users = await workspacePrisma.user.findMany({
        where: { role: 'USER' },
        include: {
            payrolls: {
                where: { month, year }
            }
        }
    })

    return { success: true, data: users }
}

export async function revertPayment(userId: string, month: number, year: number, workspaceId: string) {
    try {
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        await workspacePrisma.payroll.delete({
            where: {
                userId_month_year: {
                    userId,
                    month,
                    year
                }
            }
        })

        revalidatePath(`/${workspaceId}/admin/users`)
        return { success: true }
    } catch (error) {
        console.error('Revert payment error:', error)
        return { error: 'Failed to revert payment' }
    }
}
