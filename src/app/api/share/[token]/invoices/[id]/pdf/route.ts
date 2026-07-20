import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateInvoicePDF, InvoiceData } from '@/lib/invoice-generator'
import { resolveShareToken } from '@/lib/share-link-auth'
import { limitDb } from '@/lib/review/rate-limit-db'
import { audit } from '@/lib/audit-log'

/**
 * [Statements 2026-07] PUBLIC invoice PDF for the client share portal.
 *
 * WHY THIS EXISTS: the portal told the client "Bank details are on the PDF"
 * while the only PDF route (/api/invoices/[id]/download) is gated behind
 * verifyFinanceAccess — i.e. staff-only. A client holding a valid share link had
 * literally no way to find out where to send the money.
 *
 * AUTHORIZATION — no session; the token IS the credential, same as the rest of
 * the share portal:
 *   1. resolveShareToken() is the single chokepoint (hash-at-rest lookup,
 *      revocation, expiry, per-IP rate limit, uniform null on failure).
 *   2. The invoice must satisfy the SAME predicate getShareSnapshot uses —
 *      `clientId ∈ scope.clientIds` AND `workspaceId ∈ scope.workspaceIds`.
 *      So this route can only ever emit an invoice the client already sees in
 *      their own ledger; it widens no data boundary.
 *   3. Every failure (bad token / unknown id / out of scope) returns the SAME
 *      bare 404, so probing ids or tokens leaks nothing.
 *
 * KNOWN FIDELITY GAP (pre-existing, shared with /api/invoices/[id]/download):
 * Invoice rows do not persist the presentation-only fields the issuing modal
 * supports — customTitle, clientAddress, dueDateLabel, paymentLink. A PDF
 * rebuilt from columns therefore uses the default title and omits those. Closing
 * it properly means persisting a presentation snapshot at issue time (schema
 * change), so BOTH regeneration routes stay equally faithful until then. Where a
 * real PDF file was uploaded we hand THAT over instead, so the document of
 * record wins whenever one exists.
 */

export const dynamic = 'force-dynamic'
// Rendering runs headless Chromium; the Vercel default (10s) is not enough.
export const maxDuration = 60

const NOT_FOUND = () => new NextResponse('Not found', { status: 404 })

/**
 * Next 16 auto-implements HEAD by running GET, which would launch Chromium for
 * any link-checker/prefetch that never reads the body — and bump the audit log
 * with a download that never happened. Answer HEAD explicitly instead.
 */
export async function HEAD() {
    return new NextResponse(null, { status: 405, headers: { Allow: 'GET' } })
}

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ token: string; id: string }> },
) {
    const { token, id } = await params

    // Resolve FIRST: resolveShareToken already applies a per-IP limit, and doing
    // auth before the expensive budget means an anonymous caller can never spend
    // the render allowance of a real share link.
    const scope = await resolveShareToken(token)
    if (!scope) return NOT_FOUND()

    // Chromium renders are expensive, and the in-memory rateLimit() helper is a
    // per-process Map — on serverless every cold instance starts at zero, so it
    // caps nothing in aggregate. Use the DB-backed limiter keyed on the SHARE LINK
    // (stable, and unlike an IP it cannot be spoofed via X-Forwarded-For).
    // failClosed: a limiter outage must not open the floodgate on a browser-spawning route.
    const rl = await limitDb(`share-invoice-pdf:${scope.shareLinkId}`, 10, 300, { failClosed: true })
    if (!rl.success) {
        return new NextResponse('Too many requests', {
            status: 429,
            headers: { 'Retry-After': String(rl.retryAfterSec) },
        })
    }

    const invoice = await prisma.invoice.findFirst({
        where: {
            id,
            clientId: { in: scope.clientIds },
            workspaceId: { in: scope.workspaceIds },
        },
        include: { items: true, client: { select: { name: true } } },
    })
    if (!invoice) return NOT_FOUND()

    const isVoid = invoice.status === 'VOID'

    const logDownload = (mode: 'stored' | 'generated') => {
        void audit({
            workspaceId: invoice.workspaceId,
            actorUserId: null,
            action: 'share_link.invoice_downloaded',
            targetType: 'Invoice',
            targetId: invoice.id,
            after: {
                invoiceNumber: invoice.invoiceNumber,
                viaShareLinkId: scope.shareLinkId,
                clientId: scope.clientId,
                mode,
            },
        })
    }

    // If staff uploaded a real PDF, that file IS the document of record — hand it
    // over instead of re-rendering a lookalike. EXCEPT when the invoice is VOID:
    // the stored file was produced while the invoice was live, so it carries no
    // VOID stamp and still shows payable bank details. Re-render those so the
    // cancellation is on the page the client is looking at.
    if (!isVoid && invoice.filePath && /^https?:\/\//i.test(invoice.filePath)) {
        logDownload('stored')
        return NextResponse.redirect(invoice.filePath, { status: 302 })
    }

    const snap = (invoice.billingSnapshot ?? {}) as Record<string, any>

    // The Handlebars template prints these strings verbatim — it adds no currency
    // symbol of its own. Passing a bare `.toString()` (what the staff download
    // route does) renders "1000" with no unit. billingSnapshot freezes the
    // currency at issue time, so use it.
    const cur = typeof snap.currency === 'string' && snap.currency.trim() ? snap.currency.trim() : '$'
    const money = (v: { toString(): string }) => `${cur}${(Number(v.toString()) || 0).toFixed(2)}`

    const payload: InvoiceData = {
        invoiceNumber: invoice.invoiceNumber,
        agencyName: snap.agencyName || scope.profileName || 'Agency',
        clientName: invoice.client.name,
        // en-GB to match /api/invoices/[id]/download — a bare toLocaleDateString()
        // renders US mm/dd/yyyy under the server locale. [L18b]
        issueDate: invoice.issueDate.toLocaleDateString('en-GB'),
        dueDate: invoice.dueDate ? invoice.dueDate.toLocaleDateString('en-GB') : 'On Receipt',
        subtotal: money(invoice.subtotalAmount),
        taxPercent: Number(invoice.taxPercent),
        taxAmount: Number(invoice.taxAmount) > 0 ? money(invoice.taxAmount) : undefined,
        depositDeducted: Number(invoice.depositDeducted) > 0 ? money(invoice.depositDeducted) : undefined,
        totalDue: money(invoice.totalDue),
        items: (invoice.items || []).map((i) => ({
            description: i.description,
            quantity: i.quantity,
            unitPrice: money(i.unitPrice),
            // Already the extended line total (unitPrice × quantity) — never re-multiply.
            amount: money(i.amount),
        })),
        bank: {
            beneficiaryName: snap.beneficiaryName,
            bankName: snap.bankName,
            accountNumber: snap.accountNumber,
            swiftCode: snap.swiftCode,
            address: snap.address,
            notes: snap.notes,
        },
        // Stamp VOID across the page: a cancelled invoice must never read as payable.
        isVoid,
    }

    let pdf: Buffer
    try {
        pdf = await generateInvoicePDF(payload)
    } catch (err) {
        console.error('[share-invoice-pdf] render failed', { invoiceId: id, err })
        return new NextResponse('Could not build the PDF', { status: 500 })
    }

    logDownload('generated')

    return new NextResponse(pdf as any, {
        status: 200,
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="Invoice-${invoice.invoiceNumber}.pdf"`,
            'Content-Length': pdf.length.toString(),
            // Never let a shared cache hold a client's financial document.
            'Cache-Control': 'private, no-store',
        },
    })
}
