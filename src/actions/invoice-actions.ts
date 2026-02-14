'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-guard'
import { sendEmail } from '@/lib/email'
import { emailTemplates } from '@/lib/email-templates'

// Helper to safely convert Decimal/Number/String to Number
const toSafeNumber = (val: any) => {
    if (val === null || val === undefined) return 0
    if (typeof val === 'number') return val
    if (val.toNumber) return val.toNumber() // Handle Prisma Decimal
    return Number(val) || 0
}

// ==========================
// BILLING PROFILES
// ==========================

export async function getBillingProfiles() {
    try {
        const profiles = await prisma.billingProfile.findMany({
            orderBy: { isDefault: 'desc' }
        })
        const safeProfiles = profiles.map(p => ({
            ...p,
            createdAt: p.createdAt.toISOString(),
            updatedAt: p.updatedAt.toISOString()
        }))
        return { success: true, data: safeProfiles }
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
    notes?: string // Added
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
                profileName: data.profileName,
                beneficiaryName: data.beneficiaryName,
                bankName: data.bankName,
                accountNumber: data.accountNumber,
                swiftCode: data.swiftCode,
                address: data.address,
                notes: data.notes,
                isDefault: data.isDefault || false
            }
        })

        revalidatePath('/admin/finance')
        return { success: true, data: profile }
    } catch (error) {
        return { error: 'Failed to create billing profile' }
    }
}

export async function updateBillingProfile(id: string, data: {
    profileName: string
    beneficiaryName: string
    bankName: string
    accountNumber: string
    swiftCode?: string
    address?: string
    notes?: string
    isDefault?: boolean
}) {
    try {
        const user = await getCurrentUser()
        if (!user || user.role !== 'ADMIN') return { error: 'Unauthorized' }

        if (data.isDefault) {
            // Unset other defaults
            await prisma.billingProfile.updateMany({
                where: { isDefault: true, id: { not: id } },
                data: { isDefault: false }
            })
        }

        const profile = await prisma.billingProfile.update({
            where: { id },
            data: {
                profileName: data.profileName,
                beneficiaryName: data.beneficiaryName,
                bankName: data.bankName,
                accountNumber: data.accountNumber,
                swiftCode: data.swiftCode,
                address: data.address,
                notes: data.notes,
                isDefault: data.isDefault || false
            }
        })
        revalidatePath('/admin/crm')
        return { success: true, data: profile }
    } catch (error) {
        return { error: 'Failed to update billing profile' }
    }
}

export async function deleteBillingProfile(id: string) {
    try {
        const user = await getCurrentUser()
        if (!user || user.role !== 'ADMIN') return { error: 'Unauthorized' }

        await prisma.billingProfile.delete({
            where: { id }
        })
        revalidatePath('/admin/crm')
        return { success: true }
    } catch (error) {
        return { error: 'Failed to delete billing profile' }
    }
}


// ==========================
// INVOICE & TASKS
// ==========================

// Fetch tasks that are COMPLETED (or similar status) and UNBILLED
// Fetch tasks that are COMPLETED (or similar status) and UNBILLED
// UPDATED: Now includes tasks from Sub-clients (Subsidiaries)
export async function getUnbilledTasks(clientId: number) {
    try {
        // 1. Get all related Client IDs (Parent + Children)
        const subsidiaries = await prisma.client.findMany({
            where: { parentId: clientId },
            select: { id: true }
        })
        const allClientIds = [clientId, ...subsidiaries.map(s => s.id)]

        const tasks = await prisma.task.findMany({
            where: {
                clientId: { in: allClientIds }, // Query Family
                invoiceStatus: 'UNBILLED',
            },
            select: {
                id: true,
                title: true,
                jobPriceUSD: true,
                value: true,
                createdAt: true,
                status: true,
                productLink: true,
                client: { select: { name: true } } // Fetch client name to distinguish
            },
            orderBy: { createdAt: 'desc' }
        })

        // Sanitize data for Client Component
        const safeTasks = tasks.map(t => ({
            ...t,
            // If task belongs to sub-client, append name to title for clarity
            title: t.client && t.client.name && t.client.name !== 'Unknown' ? `[${t.client.name}] ${t.title}` : t.title,
            originalClientName: t.client?.name || 'Main',
            jobPriceUSD: toSafeNumber(t.jobPriceUSD),
            value: toSafeNumber(t.value),
            createdAt: t.createdAt.toISOString()
        }))

        return { success: true, data: safeTasks }
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

        // Sanitize Result (Decimal -> Number, Date -> String)
        const safeResult = {
            ...result,
            subtotalAmount: toSafeNumber(result.subtotalAmount),
            depositDeducted: toSafeNumber(result.depositDeducted),
            taxPercent: toSafeNumber(result.taxPercent),
            taxAmount: toSafeNumber(result.taxAmount),
            totalDue: toSafeNumber(result.totalDue),
            issueDate: result.issueDate.toISOString(),
            dueDate: result.dueDate ? result.dueDate.toISOString() : null,
            createdAt: result.createdAt.toISOString(),
            updatedAt: result.updatedAt.toISOString(),
            items: undefined // Optional: Don't need to return items if not used
        }

        return { success: true, data: safeResult }

    } catch (error) {
        console.error('Create Invoice Error:', error)
        return { error: 'Failed to save invoice record' }
    }
}

// Fetch Invoices for a specific client
// Fetch Invoices for a specific client (including invoices generated for sub-clients if any)
export async function getClientInvoices(clientId: number) {
    try {
        // 1. Get all related Client IDs (Parent + Children)
        const subsidiaries = await prisma.client.findMany({
            where: { parentId: clientId },
            select: { id: true }
        })
        const allClientIds = [clientId, ...subsidiaries.map(s => s.id)]

        const invoices = await prisma.invoice.findMany({
            where: { clientId: { in: allClientIds } },
            orderBy: { issueDate: 'desc' },
            include: {
                _count: {
                    select: { items: true }
                }
            }
        })
        // Sanitize
        const safeInvoices = invoices.map(inv => ({
            ...inv,
            subtotalAmount: toSafeNumber(inv.subtotalAmount),
            taxAmount: toSafeNumber(inv.taxAmount),
            depositDeducted: toSafeNumber(inv.depositDeducted),
            totalDue: toSafeNumber(inv.totalDue),
            issueDate: inv.issueDate.toISOString(),
            dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
            createdAt: inv.createdAt.toISOString()
        }))

        return { success: true, data: safeInvoices }
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
