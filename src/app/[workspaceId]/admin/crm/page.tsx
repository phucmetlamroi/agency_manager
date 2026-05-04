import { getClients } from '@/actions/crm-actions'
import { serializeDecimal } from '@/lib/serialization'
import ClientList from '@/components/crm/ClientList'
import CreateClientButton from '@/components/crm/CreateClientButton'
import { Building2, Users } from 'lucide-react'

export default async function CRMDashboard({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params

    const clientsRes = await getClients(workspaceId)
    const clients = clientsRes.data || []

    // Type casting for UI component
    const typedClients = clients as any[]
    const clientCount = typedClients.length

    return (
        <div style={{ padding: '24px 28px' }}>
            {/* ── Page Header ── */}
            <header
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 28,
                }}
            >
                {/* Left side */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: 12,
                            background: 'rgba(99,102,241,0.15)',
                            border: '1px solid rgba(99,102,241,0.25)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                    >
                        <Building2 style={{ width: 20, height: 20, color: '#a5b4fc' }} />
                    </div>
                    <div>
                        <h1
                            style={{
                                fontSize: 20,
                                fontWeight: 800,
                                color: '#ffffff',
                                letterSpacing: '-0.025em',
                                lineHeight: 1.2,
                                margin: 0,
                            }}
                        >
                            Quản lý Khách hàng
                        </h1>
                        <p
                            style={{
                                fontSize: 12,
                                color: '#71717a',
                                marginTop: 4,
                                margin: 0,
                                marginBlockStart: 4,
                            }}
                        >
                            Hệ thống quản lý Đối tác, Brand con và Chỉ số Hiệu suất.
                        </p>
                    </div>
                </div>

                {/* Right side - Count badge */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 14px',
                        borderRadius: 9999,
                        background: 'rgba(99,102,241,0.12)',
                        border: '1px solid rgba(99,102,241,0.25)',
                    }}
                >
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#a5b4fc' }}>
                        {clientCount}
                    </span>
                    <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 500 }}>
                        Clients
                    </span>
                </div>
            </header>

            {/* ── Table Card ── */}
            <div
                style={{
                    borderRadius: 20,
                    background: '#18181B',
                    border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: '0 24px 60px rgba(0,0,0,0.30)',
                    overflow: 'hidden',
                }}
            >
                {/* Card header */}
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '16px 20px',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Users style={{ width: 15, height: 15, color: '#a1a1aa' }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>
                            Danh sách Khách hàng
                        </span>
                    </div>
                    <CreateClientButton partners={serializeDecimal(typedClients)} workspaceId={workspaceId} />
                </div>

                {/* Client list */}
                <ClientList clients={serializeDecimal(clients) as any} workspaceId={workspaceId} />
            </div>
        </div>
    )
}
