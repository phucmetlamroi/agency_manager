'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import ClientsManagerPanel from '@/components/crm/ClientsManagerPanel'

type View = 'list' | 'detail' | 'invoice'

/**
 * Layout wrapper cho hàng [Clients Manager | Rankings] trên Dashboard.
 * Khi drill vào Chi tiết/Hóa đơn (view ≠ list) ô CM **nở full-width** và
 * Rankings ẩn mượt (grid 1.5fr/1fr → 1fr/0px). Trên màn hẹp (<xl) xếp dọc,
 * Rankings luôn hiện. `rankingsSlot` = server <Leaderboard/> truyền xuống.
 */
export default function DashboardClientsRow({
    clients,
    workspaceId,
    rankingsSlot,
}: {
    clients: any[]
    workspaceId: string
    rankingsSlot: ReactNode
}) {
    const [cmView, setCmView] = useState<View>('list')
    const expanded = cmView !== 'list'
    // Chiều cao theo cấp: list gọn; detail cao vừa; invoice đủ chứa nguyên tờ A4 (1050px + chrome)
    const cellHeight = cmView === 'invoice' ? 1180 : cmView === 'detail' ? 880 : 452

    return (
        <>
            <style>{`
                .dcm-row {
                    display: grid;
                    grid-template-columns: ${expanded ? 'minmax(0,1fr) 0px' : 'minmax(0,1.5fr) minmax(0,1fr)'};
                    gap: ${expanded ? 0 : 16}px;
                    align-items: stretch;
                    transition: grid-template-columns .42s cubic-bezier(0.16,1,0.3,1), gap .42s cubic-bezier(0.16,1,0.3,1);
                }
                @media (max-width: 1279px) {
                    .dcm-row { grid-template-columns: minmax(0,1fr) !important; gap: 16px !important; }
                    .dcm-rankings { opacity: 1 !important; pointer-events: auto !important; }
                }
            `}</style>
            <div className="dcm-row">
                <div
                    style={{
                        height: cellHeight,
                        transition: 'height .42s cubic-bezier(0.16,1,0.3,1)',
                        minWidth: 0,
                    }}
                >
                    <ClientsManagerPanel clients={clients} workspaceId={workspaceId} onViewChange={setCmView} />
                </div>
                <div
                    className="dcm-rankings"
                    style={{
                        overflow: 'hidden',
                        opacity: expanded ? 0 : 1,
                        pointerEvents: expanded ? 'none' : 'auto',
                        transition: 'opacity .3s',
                        minWidth: 0,
                    }}
                >
                    {rankingsSlot}
                </div>
            </div>
        </>
    )
}
