'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { sendEmail } from '@/lib/email'
import { emailTemplates } from '@/lib/email-templates'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { verifyWorkspaceAccess, verifyFinanceAccess } from '@/lib/security'

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

export async function getBillingProfiles(workspaceId?: string) {
    try {
        // [AUDIT R4 — fix] The no-workspaceId branch skipped the access check entirely
        // and returned profileId:null billing rows (bank details) to ANY caller.
        // Require a workspace context — every real caller passes it.
        if (!workspaceId) return { error: 'workspaceId required' }
        let profileId: string | null = null;
        if (workspaceId) {
            // [AUDIT R9 — HIGH fix] BillingProfile rows carry the agency's bank wiring
            // (beneficiaryName/bankName/accountNumber/swiftCode). The R4 fix closed the
            // no-workspaceId branch but left the role bar at MEMBER, so ANY non-finance
            // staff (e.g. a freelance editor) could dump bank details by calling this
            // server action directly. Require profile-scoped finance authority — the same
            // gate the create/update/delete billing actions and getUnbilledTasks use.
            await verifyFinanceAccess(workspaceId)

            const ws = await prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: { profileId: true }
            });
            profileId = ws?.profileId || null;
        }

        const profiles = await prisma.billingProfile.findMany({
            where: { profileId },
            orderBy: { isDefault: 'desc' }
        })
        const safeProfiles = profiles.map(p => ({
            ...p,
            createdAt: p.createdAt.toISOString(),
            updatedAt: p.updatedAt.toISOString()
        }))
        return { success: true, data: safeProfiles }
    } catch (error: any) {
        console.error('Error fetching billing profiles:', error)
        if (error?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: error.message }
        }
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
    notes?: string
    isDefault?: boolean
    currency?: string
    workspaceId?: string
}) {

    try {
        // [AUDIT R5 — fix] Require a workspace context + workspace ADMIN. The legacy
        // no-workspace global-ADMIN branch is dead under Sprint Z and would mint an
        // orphaned profileId:null billing row — mirror update/delete/get billing.
        if (!data.workspaceId) return { error: 'workspaceId required' }
        await verifyWorkspaceAccess(data.workspaceId, 'ADMIN')

        let profileId: string | null = null;
        if (data.workspaceId) {
            const ws = await prisma.workspace.findUnique({
                where: { id: data.workspaceId },
                select: { profileId: true }
            });
            profileId = ws?.profileId || null;
        }

        if (data.isDefault) {
            // Unset other defaults for THIS profile
            await prisma.billingProfile.updateMany({
                where: { isDefault: true, profileId },
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
                currency: data.currency || '$',
                isDefault: data.isDefault || false,
                profileId
            }
        })


        revalidatePath('/admin/finance')
        return { success: true, data: profile }
    } catch (error: any) {
        if (error?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: error.message }
        }
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
    currency?: string
}, workspaceId?: string) {

    try {
        // [AUDIT R4 — fix] Was gated only on the removed legacy global ADMIN with NO
        // tenant scope → a stray ADMIN account could tamper with ANY tenant's bank
        // details by id, while legit profile owners were locked out. Require workspace
        // ADMIN and scope the mutation to THIS workspace's profile.
        if (!workspaceId) return { error: 'workspaceId required' }
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { profileId: true } })
        const scopedProfileId = ws?.profileId ?? null

        const currentProfile = await prisma.billingProfile.findFirst({
            where: { id, profileId: scopedProfileId },
            select: { id: true, profileId: true }
        });
        if (!currentProfile) return { error: 'Billing profile not found' }

        if (data.isDefault) {
            // Unset other defaults for THIS profile
            await prisma.billingProfile.updateMany({
                where: { isDefault: true, id: { not: id }, profileId: scopedProfileId },
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
                currency: data.currency || '$',
                isDefault: data.isDefault || false
            }
        })

        revalidatePath('/admin/crm')
        return { success: true, data: profile }
    } catch (error: any) {
        if (error?.message?.startsWith('SECURITY_VIOLATION')) return { error: error.message }
        return { error: 'Failed to update billing profile' }
    }
}

export async function deleteBillingProfile(id: string, workspaceId?: string) {
    try {
        // [AUDIT R4 — fix] Same legacy-ADMIN + no-tenant-scope gap as updateBillingProfile.
        if (!workspaceId) return { error: 'workspaceId required' }
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { profileId: true } })
        const scopedProfileId = ws?.profileId ?? null

        // deleteMany scoped to this workspace's profile → a foreign id simply no-ops.
        const result = await prisma.billingProfile.deleteMany({
            where: { id, profileId: scopedProfileId }
        })
        if (result.count === 0) return { error: 'Billing profile not found' }
        revalidatePath('/admin/crm')
        return { success: true }
    } catch (error: any) {
        if (error?.message?.startsWith('SECURITY_VIOLATION')) return { error: error.message }
        return { error: 'Failed to delete billing profile' }
    }
}


// ==========================
// INVOICE & TASKS
// ==========================

// Fetch tasks that are COMPLETED (or similar status) and UNBILLED
// Fetch tasks that are COMPLETED (or similar status) and UNBILLED
// UPDATED: Now includes tasks from Sub-clients (Subsidiaries)
export async function getUnbilledTasks(clientId: number, workspaceId: string) {
    try {
        // [Canonical Clients] Client is now profile-scoped → the middleware
        // REQUIRES profileId for client queries (fail-closed guard). Resolve
        // it via the session (also gives us the missing membership check).
        // [AUDIT R7 — fix] This returns per-task jobPriceUSD (agency USD revenue).
        // Gate by FINANCE authority scoped to THIS workspace's profile — the global
        // isTreasurer flag leaked revenue cross-tenant to a treasurer of another profile
        // who happened to be a member here.
        let access
        try {
            access = await verifyFinanceAccess(workspaceId)
        } catch {
            return { error: 'Forbidden' }
        }
        const { session } = access
        const profileId = (session?.user as any)?.sessionProfileId as string | undefined
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)
        // 1. Get all related Client IDs (Parent + Children) — skip archived subs
        const subsidiaries = await workspacePrisma.client.findMany({
            where: { parentId: clientId, status: 'ACTIVE' },
            select: { id: true }
        })
        const allClientIds = [clientId, ...subsidiaries.map(s => s.id)]

        const tasks = await workspacePrisma.task.findMany({
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
export async function calculateInvoicePreview(taskIds: string[], taxRate: number = 0, depositCurrent: number = 0, workspaceId: string) {
    // [AUDIT R1/R2 — HIGH fix #14] This had NO auth and returned a subtotal of
    // jobPriceUSD (agency USD revenue, which must never reach non-finance staff).
    // Require workspace membership + finance role; return zeros otherwise.
    try {
        // [AUDIT R7 — fix] Returns a subtotal of jobPriceUSD — gate by profile-scoped
        // finance authority, not the global isTreasurer flag.
        try {
            await verifyFinanceAccess(workspaceId)
        } catch {
            return { subtotal: 0, taxAmount: 0, totalDue: 0 }
        }
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        // Fetch fresh data to ensure security
        const tasks = await workspacePrisma.task.findMany({
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
    } catch (error) {
        console.error('calculateInvoicePreview error:', error)
        return { subtotal: 0, taxAmount: 0, totalDue: 0 }
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
    clientDepositDeducted?: number,
    taxPercent: number,
    taxAmount: number,
    totalDue: number,
    billingSnapshot: any,
    items: any[],
    taskIds: string[]
}, workspaceId: string) {
    try {
        // [AUDIT R1 — BLOCKER fix] Authorization was a GLOBAL finance-flag check
        // (isSuperAdmin/isTreasurer) with NO workspace scope → a treasurer of
        // workspace A could create invoices against clients of workspace B simply
        // by passing B's id. Require the caller to be a member of THIS workspace
        // first (scope), then keep the finance-role gate. profileId is resolved so
        // the client-deposit write below is correctly profile-scoped (Client is
        // profile-scoped and fail-closes without it).
        // [AUDIT R7 — fix] Profile-scoped finance gate (was global isTreasurer, which
        // let a treasurer of another tenant create invoices here by passing this id).
        let access
        try {
            access = await verifyFinanceAccess(workspaceId)
        } catch {
            return { error: 'Unauthorized' }
        }
        const { session } = access
        const profileId = (session?.user as any)?.sessionProfileId as string | undefined

        // [AUDIT R7] verifyFinanceAccess replaced getCurrentUser — fetch the actor's
        // contact fields (createdBy + notification email) explicitly, since the JWT
        // session payload doesn't reliably carry nickname/username/email.
        const actor = await prisma.user.findUnique({
            where: { id: access.userId },
            select: { id: true, email: true, username: true, nickname: true },
        })

        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)

        // 0. Verify Tasks are Unbilled (Prevent Double Billing) — fast-fail before tx.
        if (data.taskIds.length > 0) {
            const billedCount = await workspacePrisma.task.count({
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
        const result = await workspacePrisma.$transaction(async (tx) => {
            // 1. Create Invoice
            const invoice = await tx.invoice.create({
                data: {
                    invoiceNumber: data.invoiceNumber,
                    clientId: data.clientId,
                    createdBy: access.userId,
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
            // [AUDIT R1 — HIGH fix #13] Double-billing race: the pre-tx count check
            // (step 0) can be passed concurrently by two requests, both marking the
            // same tasks INVOICED. Make the claim atomic by only flipping tasks that
            // are STILL UNBILLED and asserting we claimed all of them — otherwise a
            // concurrent invoice already grabbed some, so we roll back this one.
            if (data.taskIds.length > 0) {
                const claimed = await tx.task.updateMany({
                    where: { id: { in: data.taskIds }, invoiceStatus: 'UNBILLED' },
                    data: {
                        invoiceId: invoice.id,
                        invoiceStatus: 'INVOICED'
                    }
                })
                if (claimed.count !== data.taskIds.length) {
                    throw new Error('CONCURRENT_INVOICE: some tasks were billed concurrently')
                }
            }

            // 3. Deduct Deposit from Client (if any)
            // [AUDIT R1 — HIGH fix #12] Clamp the deduction to the available balance
            // so a stale/oversized client-deposit amount can't drive depositBalance
            // negative. Read inside the tx for isolation.
            if (data.clientDepositDeducted && data.clientDepositDeducted > 0) {
                const client = await tx.client.findUnique({
                    where: { id: data.clientId },
                    select: { depositBalance: true }
                })
                const available = toSafeNumber(client?.depositBalance)
                const deduct = Math.min(data.clientDepositDeducted, available)
                if (deduct > 0) {
                    await tx.client.update({
                        where: { id: data.clientId },
                        data: {
                            depositBalance: { decrement: deduct }
                        }
                    })
                }
            }

            return invoice
        })

        // 4. Send Email Notification (Fire and Forget)
        if (actor?.email) {
            const emailHtml = emailTemplates.invoiceCreated(
                actor.nickname || actor.username || 'Admin',
                result.invoiceNumber,
                data.clientName || 'Client',
                new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data.totalDue),
                `${process.env.NEXT_PUBLIC_APP_URL}/admin/crm/${data.clientId}`
            )

            sendEmail({
                to: actor.email,
                subject: `[Invoice] Created #${result.invoiceNumber}`,
                html: emailHtml
            })
        }

        revalidatePath(`/${workspaceId}/admin/crm/${data.clientId}`)

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

    } catch (error: any) {
        console.error('Create Invoice Error:', error)
        if (error?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: error.message }
        }
        if (error?.message?.startsWith('CONCURRENT_INVOICE')) {
            return { error: 'Some tasks have already been invoiced. Please refresh.' }
        }
        return { error: 'Failed to save invoice record' }
    }
}

// Fetch Invoices for a specific client
// Fetch Invoices for a specific client (including invoices generated for sub-clients if any)
export async function getClientInvoices(clientId: number, workspaceId: string) {
    try {
        // [Canonical Clients] profileId required for the client query —
        // see getUnbilledTasks above for rationale.
        // [AUDIT R9 — fix] Invoice rows expose billed USD totals (subtotal/tax/totalDue
        // = agency revenue). Same finance-data-to-non-admin leak class as
        // getBillingProfiles — gate on profile-scoped finance authority, not MEMBER.
        const { session } = await verifyFinanceAccess(workspaceId)
        const profileId = (session?.user as any)?.sessionProfileId as string | undefined
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)
        // 1. Get all related Client IDs (Parent + Children)
        const subsidiaries = await workspacePrisma.client.findMany({
            where: { parentId: clientId, status: { not: 'MERGED' } },
            select: { id: true }
        })
        const allClientIds = [clientId, ...subsidiaries.map(s => s.id)]

        const invoices = await workspacePrisma.invoice.findMany({
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
export async function voidInvoice(invoiceId: string, workspaceId: string) {
    try {
        // [AUDIT R1/R2 — BLOCKER fix #3] Same cross-tenant gap as createInvoiceRecord:
        // global finance flags with no workspace scope let a treasurer of one tenant
        // void invoices of another (flipping their tasks to UNBILLED + refunding their
        // client deposit). Require membership of THIS workspace first; resolve profileId
        // so the client deposit-refund (Client is profile-scoped) actually runs.
        // [AUDIT R7 — fix] Profile-scoped finance gate (was global isTreasurer, which
        // let a treasurer of another tenant void this tenant's invoices).
        let access
        try {
            access = await verifyFinanceAccess(workspaceId)
        } catch {
            return { error: 'Unauthorized' }
        }
        const { session } = access
        const profileId = (session?.user as any)?.sessionProfileId as string | undefined

        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)

        const invoice = await workspacePrisma.invoice.findUnique({
            where: { id: invoiceId },
            include: { tasks: true }
        })

        if (!invoice) return { error: 'Invoice not found' }
        if (invoice.status === 'VOID') return { error: 'Invoice is already void' }

        // Transaction: Void Invoice + Revert Tasks + Refund Deposit
        await workspacePrisma.$transaction(async (tx) => {
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

        revalidatePath(`/${workspaceId}/admin/crm/${invoice.clientId}`)
        return { success: true }

    } catch (error: any) {
        console.error('Void Invoice Error:', error)
        if (error?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: error.message }
        }
        return { error: 'Failed to void invoice' }
    }
}
