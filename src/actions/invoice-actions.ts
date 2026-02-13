'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-guard'
import { sendEmail } from '@/lib/email'
import { emailTemplates } from '@/lib/email-templates'

// ==========================
// BILLING PROFILES
// ==========================

export async function getBillingProfiles() {
    try {
        const profiles = await prisma.billingProfile.findMany({
            orderBy: { isDefault: 'desc' }
        })
        return { success: true, data: profiles }
    } catch (error) {
        console.error('Error fetching billing profiles:', error)
        return { error: 'Failed to fetch billing profiles' }
    }
}

export async function createBillingProfile(data: {
    profileName: string
    beneficiaryName: string
    bankName: string
    accountNumber: string
    swiftCode?: string
    address?: string
    isDefault?: boolean
}) {
    try {
        const user = await getCurrentUser()
        if (!user || user.role !== 'ADMIN') return { error: 'Unauthorized' }

        if (data.isDefault) {
            // Unset other defaults
            await prisma.billingProfile.updateMany({
                where: { isDefault: true },
                data: { isDefault: false }
            })
        }

        const profile = await prisma.billingProfile.create({
            data: {
                ...data,
                isDefault: data.isDefault || false
            }
        })

        revalidatePath('/admin/finance') // Assuming future path
        return { success: true, data: profile }
    } catch (error) {
        return { error: 'Failed to create billing profile' }
    }
}

export async function deleteBillingProfile(id: string) {
    try {
        const user = await getCurrentUser()
        if (!user || user.role !== 'ADMIN') return { error: 'Unauthorized' }

        await prisma.billingProfile.delete({ where: { id } })
        revalidatePath('/admin/finance')
        return { success: true }
    } catch (error) {
        return { error: 'Failed to delete profile' }
    }
}

// ==========================
// INVOICE & TASKS
// ==========================

// Fetch tasks that are COMPLETED (or similar status) and UNBILLED
export async function getUnbilledTasks(clientId: number) {
    try {
        const tasks = await prisma.task.findMany({
            where: {
                clientId: clientId,
                // Status must be compatible with billing (e.g. Completed, or whatever 'Hoàn tất' maps to)
                // For now, let's assume we fetch all non-invoiced tasks that have a value
                invoiceStatus: 'UNBILLED',
                // Optional: valid status check
                // status: { in: ['Hoàn tất', 'Review'] } 
            },
            select: {
                id: true,
                title: true,
                jobPriceUSD: true,
                value: true,
                createdAt: true,
                status: true,
                productLink: true
            },
            orderBy: { createdAt: 'desc' }
        })
        return { success: true, data: tasks }
    } catch (error) {
        console.error('Error fetching unbilled tasks:', error)
        return { error: 'Failed to fetch unbilled tasks' }
    }
}

// Preview Invoice Calculations (No DB connection needed for calc, but good for validation)
export async function calculateInvoicePreview(taskIds: string[], taxRate: number = 0, depositCurrent: number = 0) {
    // This is a utility action to help frontend validation if needed
    // Fetch fresh data to ensure security
    const tasks = await prisma.task.findMany({
        where: { id: { in: taskIds } },
        select: { jobPriceUSD: true }
    })

    const subtotal = tasks.reduce((sum, t) => sum + Number(t.jobPriceUSD || 0), 0)
    const taxAmount = subtotal * (taxRate / 100)
    // Deposit deduction logic: cannot exceed subtotal+tax? Or can be negative due?
    // Usually Total = (Sub+Tax) - Deposit.
    // If Deposit > Sub+Tax, Total = 0 and Credit remains.

    // Simple logic for now
    let totalDue = subtotal + taxAmount - depositCurrent
    if (totalDue < 0) totalDue = 0

    return {
        subtotal,
        taxAmount,
        totalDue
    }
}

// Create Invoice Record in DB
export async function createInvoiceRecord(data: {
    clientId: number,
    clientName?: string,
    createdBy: string,
    invoiceNumber: string,
    issueDate: Date,
    dueDate?: Date,
    subtotalAmount: number,
    depositDeducted: number,
    taxPercent: number,
    taxAmount: number,
    totalDue: number,
    billingSnapshot: any,
    items: any[],
    taskIds: string[]
}) {
    try {
        const user = await getCurrentUser()
        // Determine if user has permission (Admin or Treasurer)
        // Note: getCurrentUser now returns isTreasurer boolean
        if (!user || (!user.isSuperAdmin && !user.isTreasurer)) return { error: 'Unauthorized' }

        // 0. Verify Tasks are Unbilled (Prevent Double Billing)
        if (data.taskIds.length > 0) {
            const billedCount = await prisma.task.count({
                where: {
                    id: { in: data.taskIds },
                    invoiceStatus: 'INVOICED'
                }
            })
            if (billedCount > 0) {
                return { error: 'Some tasks have already been invoiced. Please refresh.' }
            }
        }

        // Transaction: Create Invoice + Update Tasks + Update Client Deposit
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create Invoice
            const invoice = await tx.invoice.create({
                data: {
                    invoiceNumber: data.invoiceNumber,
                    clientId: data.clientId,
                    createdBy: user.id,
                    issueDate: data.issueDate,
                    dueDate: data.dueDate,
                    subtotalAmount: data.subtotalAmount,
                    depositDeducted: data.depositDeducted,
                    taxPercent: data.taxPercent,
                    taxAmount: data.taxAmount,
                    totalDue: data.totalDue,
                    billingSnapshot: data.billingSnapshot,
                    status: 'SENT', // Default to SENT for now
                    items: {
                        create: data.items.map((item: any) => ({
                            description: item.description,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            amount: item.amount,
                            taskId: item.taskId || null
                        }))
                    }
                }
            })

            // 2. Update Tasks (Mark as INVOICED)
            if (data.taskIds.length > 0) {
                await tx.task.updateMany({
                    where: { id: { in: data.taskIds } },
                    data: {
                        invoiceId: invoice.id,
                        invoiceStatus: 'INVOICED'
                    }
                })
            }

            // 3. Deduct Deposit from Client (if any)
            if (data.depositDeducted > 0) {
                await tx.client.update({
                    where: { id: data.clientId },
                    data: {
                        depositBalance: { decrement: data.depositDeducted }
                    }
                })
            }

            return invoice
        })

        // 4. Send Email Notification (Fire and Forget)
        if (user.email) {
            const emailHtml = emailTemplates.invoiceCreated(
                user.nickname || user.username || 'Admin',
                result.invoiceNumber,
                data.clientName || 'Client',
                new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data.totalDue),
                `${process.env.NEXT_PUBLIC_APP_URL}/admin/crm/${data.clientId}`
            )

            sendEmail({
                to: user.email,
                subject: `[Invoice] Created #${result.invoiceNumber}`,
                html: emailHtml
            })
        }

        revalidatePath(`/admin/crm/${data.clientId}`)
        return { success: true, data: result }

    } catch (error) {
        console.error('Create Invoice Error:', error)
        return { error: 'Failed to save invoice record' }
    }
}

// Fetch Invoices for a specific client
export async function getClientInvoices(clientId: number) {
    try {
        const invoices = await prisma.invoice.findMany({
            where: { clientId },
            orderBy: { issueDate: 'desc' },
            include: {
                _count: {
                    select: { items: true }
                }
            }
        })
        return { success: true, data: invoices }
    } catch (error) {
        return { error: 'Failed to fetch invoices' }
    }
}

// Void Invoice (Revert actions)
export async function voidInvoice(invoiceId: string) {
    try {
        const user = await getCurrentUser()
        if (!user || (!user.isSuperAdmin && !user.isTreasurer)) return { error: 'Unauthorized' }

        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: { tasks: true }
        })

        if (!invoice) return { error: 'Invoice not found' }
        if (invoice.status === 'VOID') return { error: 'Invoice is already void' }

        // Transaction: Void Invoice + Revert Tasks + Refund Deposit
        await prisma.$transaction(async (tx) => {
            // 1. Update Invoice Status
            await tx.invoice.update({
                where: { id: invoiceId },
                data: { status: 'VOID' }
            })

            // 2. Revert Tasks (Unlink Invoice)
            await tx.task.updateMany({
                where: { invoiceId: invoiceId },
                data: {
                    invoiceId: null,
                    invoiceStatus: 'UNBILLED'
                }
            })

            // 3. Refund Deposit (if any was deducted)
            if (Number(invoice.depositDeducted) > 0) {
                await tx.client.update({
                    where: { id: invoice.clientId },
                    data: {
                        depositBalance: { increment: invoice.depositDeducted }
                    }
                })
            }
        })

        revalidatePath(`/admin/crm/${invoice.clientId}`)
        return { success: true }

    } catch (error) {
        console.error('Void Invoice Error:', error)
        return { error: 'Failed to void invoice' }
    }
}
