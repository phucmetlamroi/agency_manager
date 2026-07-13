'use client'

/**
 * [Giao diện 2 · Mission Control · M26 Thùng rác hợp nhất] One screen, 4 tabs.
 * REUSE-first: each tab mounts an EXISTING, already-vetted trash surface — no
 * trash logic is rebuilt here. "Mỗi tab giữ nguyên action/route riêng của hệ":
 *   - Tệp        → TeamTrash (chromeless)     · /api/review/trash (+ restore/purge, ADMIN)
 *   - Khách      → ClientTrashClient          · restoreClient / permanentlyDeleteClient
 *                  (permanent-delete BỊ CHẶN khi còn hóa đơn liên kết — server-side guard)
 *   - Task đã hủy→ CancelledTasksClient        · getCancelledTasks / restoreCancelledTask
 *   - Tổ chức    → ProfileTrashClient          · getMyTrashedProfiles / restoreProfileAction
 *                  (getMyTrashedProfiles đã tự lọc role OWNER → non-owner thấy rỗng)
 * Data for tabs 2/3/4 is fetched server-side (admin/owner-gated actions) and passed in;
 * the Tệp tab self-fetches via TeamTrash. Every restore/purge re-verifies on the server.
 */

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { TeamTrash } from '@/components/review/TeamTrash'
import ClientTrashClient from '@/components/crm/ClientTrashClient'
import CancelledTasksClient from '@/components/tasks/CancelledTasksClient'
import ProfileTrashClient from '@/components/profile/ProfileTrashClient'

type ClientRow = { id: number; name: string; deletedAt: string | null; taskCount: number; subCount: number; invoiceCount: number }
type TabKey = 'tep' | 'khach' | 'task' | 'to-chuc'

export default function McTrashHub({
    workspaceId,
    isAdmin = true,
    trashedClients,
    cancelledTasks,
    trashedProfiles,
}: {
    workspaceId: string
    isAdmin?: boolean
    trashedClients: ClientRow[]
    cancelledTasks: any[]
    trashedProfiles: any[]
}) {
    const [tab, setTab] = useState<TabKey>('tep')

    // Tệp count is intentionally null: TeamTrash paginates via cursor (self-fetch),
    // so no cheap accurate total exists server-side without duplicating its query.
    const tabs: { key: TabKey; label: string; count: number | null; hint: string }[] = [
        { key: 'tep', label: 'Tệp', count: null, hint: 'Tệp/thư mục review đã xóa · khôi phục trong 30 ngày (Màn 22)' },
        { key: 'khach', label: 'Khách', count: trashedClients.length, hint: 'Xóa khách = ẩn cả cây brand con khỏi CRM · task/hóa đơn giữ nguyên · xóa vĩnh viễn bị CHẶN khi còn hóa đơn liên kết' },
        { key: 'task', label: 'Task đã hủy', count: cancelledTasks.length, hint: 'Task chuyển "Đã hủy" được lưu trữ mềm (khác xóa cứng) · khôi phục → task quay lại bảng' },
        { key: 'to-chuc', label: 'Tổ chức', count: trashedProfiles.length, hint: 'Tổ chức đã xóa — chỉ OWNER thấy của mình · khôi phục trong 30 ngày trước khi tự xóa vĩnh viễn' },
    ]
    const active = tabs.find((t) => t.key === tab)!

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Header: icon + title + tab bar + per-tab hint */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Trash2 style={{ width: 18, height: 18, color: '#F87171' }} />
                </div>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#F4F4F5' }}>Thùng rác</span>

                <div style={{ display: 'flex', padding: 3, borderRadius: 999, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', marginLeft: 8, flexWrap: 'wrap' }}>
                    {tabs.map((t) => {
                        const on = t.key === tab
                        return (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => setTab(t.key)}
                                style={{
                                    fontSize: 11.5, fontWeight: 700, padding: '5px 14px', borderRadius: 999,
                                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                    background: on ? 'rgba(99,102,241,0.20)' : 'transparent',
                                    color: on ? '#C7D2FE' : '#71717A', transition: 'color .15s, background .15s',
                                }}
                            >
                                {t.label}{t.count != null ? ` · ${t.count}` : ''}
                            </button>
                        )
                    })}
                </div>

                <span style={{ marginLeft: 'auto', fontSize: 10.5, color: '#52525B', maxWidth: 380, textAlign: 'right', lineHeight: 1.4 }}>{active.hint}</span>
            </div>

            {/* Active tab — only the active surface is mounted */}
            <div>
                {tab === 'tep' && <TeamTrash workspaceId={workspaceId} isAdmin={isAdmin} chromeless />}
                {tab === 'khach' && <ClientTrashClient workspaceId={workspaceId} clients={trashedClients} />}
                {tab === 'task' && <CancelledTasksClient workspaceId={workspaceId} tasks={cancelledTasks} />}
                {tab === 'to-chuc' && <ProfileTrashClient workspaceId={workspaceId} profiles={trashedProfiles} />}
            </div>
        </div>
    )
}
