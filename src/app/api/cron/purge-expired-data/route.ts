import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');

    // Protect endpoint with CRON_SECRET setup in Vercel
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        // Calculate cutoff_date (keep current month and 2 previous months)
        // E.g., If today is 2026-04-01, we want to keep April, March, Feb. Cutoff is Feb 1st 00:00 (or Jan 31st 23:59).
        // Let's go 3 months back from the 1st of CURRENT month to get the strict cutoff.
        // E.g., April 1st -> (April - 3) = Jan 1st. Anything < Jan 1st is securely older than 3 months.
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth(); // 0-based
        const cutoffDate = new Date(currentYear, currentMonth - 2, 1);

        console.log(`Starting Data Retention Purge for records strictly before ${cutoffDate.toISOString()}`);

        // Interactive Transaction to safely purge relational data structurally
        await prisma.$transaction(async (tx) => {
            // Find invoices to delete
            const oldInvoices = await tx.invoice.findMany({
                where: { issueDate: { lt: cutoffDate } },
                select: { id: true }
            });
            const oldInvoiceIds = oldInvoices.map(i => i.id);

            // Find payrolls to delete
            const oldPayrolls = await tx.payroll.findMany({
                where: { createdAt: { lt: cutoffDate } },
                select: { id: true }
            });
            const oldPayrollIds = oldPayrolls.map(p => p.id);

            // 1. Delete Leaves (Feedback, PerformanceMetric, MonthlyBonus)
            await tx.feedback.deleteMany({
                where: { createdAt: { lt: cutoffDate } }
            });
            await tx.performanceMetric.deleteMany({
                where: { measuredAt: { lt: cutoffDate } }
            });
            await tx.monthlyBonus.deleteMany({
                where: { calculatedAt: { lt: cutoffDate } }
            });

            // 2. Cut Financial Links (InvoiceItems)
            if (oldInvoiceIds.length > 0) {
                await tx.invoiceItem.deleteMany({
                    where: { invoiceId: { in: oldInvoiceIds } }
                });
            }

            // 3. Clean Core Tasks (Only Archived Tasks that are old)
            // Pending/Ongoing tasks from the past pierce the filter and are kept.
            await tx.task.deleteMany({
                where: {
                    isArchived: true,
                    deadline: { lt: cutoffDate }
                }
            });

            // 4. Clean Roots (Invoice, Payroll, PayrollLock)
            if (oldInvoiceIds.length > 0) {
                await tx.invoice.deleteMany({
                    where: { id: { in: oldInvoiceIds } }
                });
            }
            if (oldPayrollIds.length > 0) {
                await tx.payroll.deleteMany({
                    where: { id: { in: oldPayrollIds } }
                });
            }
            await tx.payrollLock.deleteMany({
                where: { lockedAt: { lt: cutoffDate } }
            });
        });

        return NextResponse.json({ success: true, message: 'Purge completed successfully.' });
    } catch (error: any) {
        console.error('Data Purge Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
