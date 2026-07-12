'use client'

// [Mobile P4 / M7.2 + M7.5 — FR-E1, FR-I5] Bottom sheet chi tiết khách (quick view).
// Dùng MobileSheet (vaul wrapper) → glass-3 + z-sheet + safe-area-bottom + drag handle +
// useHistoryBackClose (back gesture đóng). Field phẳng label/value; nút "Xem trang khách",
// "Sửa" (delegate lên list mở dialog rename), "Xóa" (useConfirm danger → deleteClient).
import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, Share2, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { MobileSheet } from '@/components/ui/mobile-sheet'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { deleteClient } from '@/actions/crm-actions'
import { formatCompactVNDWithUnit } from '@/lib/format-compact'
import { cn } from '@/lib/utils'
import { ClientStatusBadge, type ClientNode, type ClientMetrics } from './MobileClientCard'

function Field({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
    return (
        <div className="flex items-start justify-between gap-3 py-3">
            <dt className="shrink-0 text-body-sm text-muted-foreground">{label}</dt>
            <dd className={cn('min-w-0 text-right text-body-sm font-medium text-foreground', valueClassName)}>{value}</dd>
        </div>
    )
}

export default function ClientSheet({
    open,
    onOpenChange,
    client,
    metrics,
    workspaceId,
    onEdit,
    onPortal,
    portalPending = false,
    onInvoice,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    client: ClientNode | null
    metrics: ClientMetrics | null
    workspaceId: string
    onEdit: (client: ClientNode) => void
    /** [design-handoff 2c] Tạo + copy link Portal khách (createClientShareLink) — do list xử lý. */
    onPortal?: (client: ClientNode) => void
    portalPending?: boolean
    /** [design-handoff §3 / PR#3] Mở flow tạo hóa đơn 2 bước — do list mở MobileInvoiceFlow. */
    onInvoice?: (client: ClientNode) => void
}) {
    const router = useRouter()
    const { confirm } = useConfirm()
    const [isPending, startTransition] = useTransition()

    const handleDelete = async () => {
        if (!client) return
        // 2 lớp: sheet → confirm dialog danger (M7.5.2). Copy đúng spec.
        const ok = await confirm({
            title: 'Xóa khách hàng?',
            message: 'Toàn bộ dữ liệu liên quan sẽ bị ẩn khỏi danh sách. Hành động này không thể hoàn tác.',
            type: 'danger',
            confirmText: 'Xóa',
            cancelText: 'Hủy',
        })
        if (!ok) return
        // Offline / lỗi → toast, KHÔNG optimistic (M7.4).
        const res = await deleteClient(client.id, workspaceId)
        if (res.success) {
            toast.success('Đã chuyển khách hàng vào Thùng rác')
            onOpenChange(false)
            startTransition(() => router.refresh())
        } else {
            toast.error(res.error || 'Không thể xóa khách hàng.')
        }
    }

    return (
        <MobileSheet open={open} onOpenChange={onOpenChange} title={client?.name}>
            {client && metrics && (
                <div className="flex flex-col gap-4 pt-1">
                    <ClientStatusBadge status={metrics.status} className="self-start" />

                    {/* Field phẳng label/value */}
                    <dl className="flex flex-col divide-y divide-white/5">
                        <Field label="Doanh thu" value={formatCompactVNDWithUnit(metrics.revenueVND)} />
                        <Field
                            label="Task"
                            value={`${metrics.taskCount}${metrics.doingCount > 0 ? ` (${metrics.doingCount} đang chạy)` : ''}`}
                        />
                        {metrics.hasFriction && (
                            <Field
                                label="Vướng mắc"
                                value={`${metrics.incompleteCount}/${metrics.taskCount} task chưa hoàn tất · ${metrics.friction}%`}
                                valueClassName="text-warning"
                            />
                        )}
                        {/* Client model chưa có trường liên hệ/email → hiển thị placeholder, không bịa dữ liệu. */}
                        <Field label="Liên hệ" value="Chưa cập nhật" valueClassName="text-muted-foreground font-normal" />
                    </dl>

                    {/* Tạo hóa đơn 2 bước (mobile) */}
                    {onInvoice && (
                        <Button className="h-12 w-full gap-2" onClick={() => onInvoice(client)}>
                            <FileText className="h-4 w-4" /> Tạo hóa đơn
                        </Button>
                    )}

                    {/* Xem trang khách → spoke /admin/crm/[id] */}
                    <Button asChild variant="outline" className="h-12 w-full">
                        <Link href={`/${workspaceId}/admin/crm/${client.id}`}>Xem trang khách →</Link>
                    </Button>

                    {/* Chia sẻ Portal khách (createClientShareLink → copy) */}
                    {onPortal && (
                        <Button
                            variant="outline"
                            className="h-12 w-full gap-2"
                            disabled={portalPending}
                            onClick={() => onPortal(client)}
                        >
                            <Share2 className="h-4 w-4" /> {portalPending ? 'Đang tạo link…' : 'Chia sẻ Portal khách'}
                        </Button>
                    )}

                    {/* Hàng nút: Sửa (secondary) + Xóa (destructive) — gap-2 */}
                    <div className="flex gap-2">
                        <Button variant="secondary" className="h-12 flex-1 gap-2" onClick={() => onEdit(client)}>
                            <Pencil className="h-4 w-4" /> Sửa
                        </Button>
                        <Button
                            variant="destructive"
                            className="h-12 flex-1 gap-2"
                            disabled={isPending}
                            onClick={handleDelete}
                        >
                            <Trash2 className="h-4 w-4" /> Xóa
                        </Button>
                    </div>
                </div>
            )}
        </MobileSheet>
    )
}
