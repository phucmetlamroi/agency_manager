'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { format } from 'date-fns'

export async function confirmPayment(data: {
    userId: string
    month: number
    year: number
    baseSalary: number
    bonus: number
    totalAmount: number
}) {
    try {
        // Upsert Payroll Record
        const payroll = await prisma.payroll.upsert({
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

        revalidatePath('/admin/users') // Or wherever payroll is shown
        // Send Email logic would go here (omitted for now)

        return { success: true }
    } catch (error) {
        console.error('Payment error:', error)
        return { error: 'Payment failed' }
    }
}

export async function getPayrollData(month: number, year: number) {
    // Fetch all users and their payroll status for the specific month
    const users = await prisma.user.findMany({
        where: { role: 'USER' },
        include: {
            payrolls: {
                where: { month, year }
            },
            // Include tasks to calculate salary on the fly if not paid?
            // Actually, for the table, we usually calc on fly, and overlay payroll status.
            focusTasks: false // optimize
        }
    })

    return { success: true, data: users }
}

export async function revertPayment(userId: string, month: number, year: number) {
    try {
        await prisma.payroll.delete({
            where: {
                userId_month_year: {
                    userId,
                    month,
                    year
                }
            }
        })

        revalidatePath('/admin/users')
        return { success: true }
    } catch (error) {
        console.error('Revert payment error:', error)
        return { error: 'Failed to revert payment' }
    }
}
