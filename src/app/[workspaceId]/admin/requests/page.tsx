import { getClientRequests } from '@/actions/client-request-actions'
import RequestsInbox from '@/components/admin/RequestsInbox'
import { Inbox } from 'lucide-react'

export default async function ClientRequestsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    // getClientRequests verifies profile-admin access (the /admin layout already gates entry).
    const requests = await getClientRequests(workspaceId)
    const count = requests.length

    return (
        <div className="flex flex-col gap-5 max-w-5xl mx-auto">
            {/* ── Page Header ─────────────────────────────── */}
            <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                    <div
                        className="flex items-center justify-center rounded-xl"
                        style={{ width: 40, height: 40, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)' }}
                    >
                        <Inbox className="w-5 h-5" style={{ color: '#A5B4FC' }} />
                    </div>
                    <div>
                        <h1 className="font-extrabold text-white tracking-tight" style={{ fontSize: 20 }}>
                            Hộp thư yêu cầu
                        </h1>
                        <p className="text-muted-foreground mt-px" style={{ fontSize: 12 }}>
                            Yêu cầu công việc khách hàng gửi qua portal. Xem, tạo task hoặc từ chối.
                        </p>
                    </div>
                </div>

                <div
                    className="flex items-center rounded-full"
                    style={{ gap: 6, padding: '6px 14px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}
                >
                    <span className="font-extrabold" style={{ fontSize: 18, color: '#A5B4FC' }}>{count}</span>
                    <span className="font-semibold" style={{ fontSize: 11, color: 'hsl(var(--primary))' }}>Chờ xử lí</span>
                </div>
            </div>

            <RequestsInbox workspaceId={workspaceId} initialRequests={requests} />
        </div>
    )
}
