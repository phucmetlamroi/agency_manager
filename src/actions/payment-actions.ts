'use server'

/**
 * [Payment ledger 2026-06] "Sổ thu tiền" — record when a client actually paid,
 * per (client, workspace). Independent of invoices (regular clients pay directly
 * without one); an optional invoiceId links a payment to an invoice and marks it
 * PAID. Multiple rows per client = partial / installment payments — the ledger
 * sums them.
 *
 * Every action is ADMIN-gated (verifyWorkspaceAccess) and strictly workspace-
 * scoped, mirroring the rest of the CRM. The Payment model is scalar-only, so the
 * scoping is enforced here, not by relations.
 */

import { prisma } from '@/lib/db'
import { verifyWorkspaceAccess } from '@/lib/security'
import { serializeDecimal } from '@/lib/serialization'
import { revalidatePath } from 'next/cache'

const stripCtrl = (s: string) =>
    Array.from(s).filter((ch) => { const c = ch.codePointAt(0) ?? 0; return c >= 32 && c !== 127 }).join('')
const clean = (s: string | undefined | null, cap = 300): string | null => {
    const v = stripCtrl((s ?? '').toString()).trim().slice(0, cap)
    return v.length ? v : null
}

/** ADMIN access + the actor's id + profileId in one place. */
async function access(workspaceId: string) {
    const a = await verifyWorkspaceAccess(workspaceId, 'ADMIN')
    const userId = (a as any)?.userId ?? (a as any)?.user?.id ?? null
    const profileId = (a as any)?.user?.sessionProfileId ?? null
    return { userId, profileId }
}

export interface RecordPaymentInput {
    clientId: number
    amount: number
    paidAt?: string // ISO date; defaults to now
    method?: string
    note?: string
    invoiceId?: string // optional → marks that invoice PAID
}

export async function recordPayment(input: RecordPaymentInput, workspaceId: string) {
    try {
        const { userId, profileId } = await access(workspaceId)

        const amount = Number(input.amount)
        if (!Number.isFinite(amount) || amount <= 0) return { success: false as const, error: 'Số tiền phải lớn hơn 0.' }
        const clientId = Number(input.clientId)
        if (!Number.isInteger(clientId)) return { success: false as const, error: 'Khách hàng không hợp lệ.' }

        // Anti cross-tenant: the client must be ACTIVE and in this workspace's profile.
        const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { profileId: true } })
        const client = await prisma.client.findFirst({
            where: { id: clientId, status: 'ACTIVE', ...(ws?.profileId ? { profileId: ws.profileId } : {}) },
            select: { id: true, name: true },
        })
        if (!client) return { success: false as const, error: 'Khách hàng không tồn tại trong workspace này.' }

        let paidAt = new Date()
        if (input.paidAt) { const d = new Date(input.paidAt); if (!isNaN(d.getTime())) paidAt = d }

        // Optional invoice link — must belong to the SAME workspace + client.
        let linkedInvoiceId: string | null = null
        if (input.invoiceId) {
            const inv = await prisma.invoice.findFirst({
                where: { id: input.invoiceId, workspaceId, clientId },
                select: { id: true },
            })
            if (inv) linkedInvoiceId = inv.id
        }

        const payment = await prisma.payment.create({
            data: {
                clientId,
                workspaceId,
                profileId: profileId ?? ws?.profileId ?? null,
                amount,
                paidAt,
                method: clean(input.method, 60),
                note: clean(input.note),
                invoiceId: linkedInvoiceId,
                recordedById: userId ?? null,
            },
        })

        if (linkedInvoiceId) {
            await prisma.invoice.update({ where: { id: linkedInvoiceId }, data: { status: 'PAID' } }).catch(() => { /* best-effort */ })
        }

        try {
            await prisma.auditLog.create({
                data: {
                    workspaceId, actorUserId: userId ?? null, action: 'payment.recorded',
                    targetType: 'Payment', targetId: payment.id,
                    afterData: { clientId, clientName: client.name, amount, paidAt: paidAt.toISOString(), invoiceId: linkedInvoiceId },
                },
            })
        } catch { /* best-effort */ }

        revalidatePath(`/${workspaceId}/admin`)
        return { success: true as const, payment: serializeDecimal(payment) }
    } catch (e) {
        console.error('[recordPayment]', e)
        return { success: false as const, error: 'Không thể ghi nhận thanh toán.' }
    }
}

export async function deletePayment(paymentId: string, workspaceId: string) {
    try {
        const { userId } = await access(workspaceId)
        const payment = await prisma.payment.findFirst({
            where: { id: paymentId, workspaceId },
            select: { id: true, clientId: true, amount: true },
        })
        if (!payment) return { success: false as const, error: 'Không tìm thấy bản ghi thanh toán.' }

        await prisma.payment.delete({ where: { id: paymentId } })
        try {
            await prisma.auditLog.create({
                data: {
                    workspaceId, actorUserId: userId ?? null, action: 'payment.deleted',
                    targetType: 'Payment', targetId: paymentId,
                    beforeData: { clientId: payment.clientId, amount: Number(payment.amount) },
                },
            })
        } catch { /* best-effort */ }

        revalidatePath(`/${workspaceId}/admin`)
        return { success: true as const }
    } catch (e) {
        console.error('[deletePayment]', e)
        return { success: false as const, error: 'Không thể xoá bản ghi.' }
    }
}

/** Per-client paid totals for the whole workspace — feeds the ledger table. */
export async function getPaymentLedger(workspaceId: string) {
    const empty = {} as Record<number, { paid: number; lastPaidAt: string | null; count: number }>
    try {
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const payments = await prisma.payment.findMany({
            where: { workspaceId },
            select: { clientId: true, amount: true, paidAt: true },
        })
        const byClient: Record<number, { paid: number; lastPaidAt: string | null; count: number }> = {}
        for (const p of payments) {
            const c = byClient[p.clientId] ?? { paid: 0, lastPaidAt: null, count: 0 }
            c.paid += Number(p.amount)
            c.count += 1
            const iso = p.paidAt.toISOString()
            if (!c.lastPaidAt || iso > c.lastPaidAt) c.lastPaidAt = iso
            byClient[p.clientId] = c
        }
        return { success: true as const, byClient }
    } catch (e) {
        console.error('[getPaymentLedger]', e)
        return { success: false as const, byClient: empty }
    }
}

/** Full payment history of one client in this workspace (for the record modal). */
export async function getClientPayments(clientId: number, workspaceId: string) {
    try {
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const payments = await prisma.payment.findMany({
            where: { workspaceId, clientId: Number(clientId) },
            orderBy: { paidAt: 'desc' },
            select: { id: true, amount: true, paidAt: true, method: true, note: true, invoiceId: true, recordedById: true },
        })
        const ids = Array.from(new Set(payments.map((p) => p.recordedById).filter(Boolean))) as string[]
        const users = ids.length
            ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, nickname: true } })
            : []
        const nameById = new Map(users.map((u) => [u.id, u.nickname || u.username]))
        return {
            success: true as const,
            payments: payments.map((p) => ({
                id: p.id,
                amount: Number(p.amount),
                paidAt: p.paidAt.toISOString(),
                method: p.method,
                note: p.note,
                invoiceId: p.invoiceId,
                recordedBy: p.recordedById ? (nameById.get(p.recordedById) ?? null) : null,
            })),
        }
    } catch (e) {
        console.error('[getClientPayments]', e)
        return { success: false as const, payments: [] as Array<{ id: string; amount: number; paidAt: string; method: string | null; note: string | null; invoiceId: string | null; recordedBy: string | null }> }
    }
}
