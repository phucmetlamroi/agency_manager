import { prisma } from '@/lib/db'
import { serializeDecimal } from '@/lib/serialization'
import ClientAnalytics from '@/components/crm/ClientAnalytics'
import CreateSubClientButton from '@/components/crm/CreateSubClientButton'
import { notFound } from 'next/navigation'

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: paramId } = await params
    const id = parseInt(paramId)
    if (isNaN(id)) return notFound()

    // Fetch Client with Subsidiaries and Tasks
    const client = await prisma.client.findUnique({
        where: { id },
        include: {
            subsidiaries: {
                include: {
                    tasks: {
                        orderBy: { createdAt: 'desc' },
                        take: 5 // Get recent tasks for sub-clients
                    }
                }
            },
            tasks: {
                orderBy: { createdAt: 'desc' },
                take: 20 // Get recent direct tasks
            },
            invoices: {
                orderBy: { issueDate: 'desc' },
                take: 20
            },
            projects: true
        }
    })

    if (!client) return notFound()

    // Calculate Distribution for Pie Chart
    // Logic: If Partner, show distribution of Sub-clients.
    // If Sub-client, show distribution of Projects? Or just generic stats.

    let distribution = []

    if (client.subsidiaries.length > 0) {
        distribution = client.subsidiaries.map(sub => ({
            name: sub.name,
            value: sub.tasks.length
        })).filter(d => d.value > 0)
    } else {
        // Use Projects if no subsidiaries
        // Note: Project model links to Task. We need to count tasks per project.
        // We didn't fetch deep tasks for projects above efficiently.
        // Let's keep it simple: If no subs, show "Direct Tasks" vs "Project Tasks" (if we fetch them).
        // For now, let's assume this view is mainly for Partners.
        distribution = [{ name: 'Direct Tasks', value: client.tasks.length }]
    }

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-white">Chi tiết Hồ sơ Khách hàng</h1>
                {/* Only show Add Button if this is a Partner (has no parent) - simplified logic for now */}
                {!client.parentId && (
                    <CreateSubClientButton parentId={client.id} parentName={client.name} />
                )}
            </div>
            <ClientAnalytics client={serializeDecimal(client) as any} distribution={distribution} />
        </div>
    )
}
