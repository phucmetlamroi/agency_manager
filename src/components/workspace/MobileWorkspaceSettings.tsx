'use client'

/**
 * [Mobile P4.7 / M11] Cài đặt Workspace — bản MOBILE.
 *
 * Dispatcher ở settings/page.tsx chọn component này khi x-device-type=mobile
 * (SAU gate verifyWorkspaceAccess ADMIN); nhánh desktop giữ WorkspaceSettingsPanel
 * NGUYÊN VẸN (0 byte diff — HARD INVARIANT #1). Mirror nội dung panel, tổ chức lại
 * cho mobile thành 3 tab đồng bộ URL: Tổng quan / Kết nối / Tổ chức.
 *
 * TÁI DÙNG action KHÔNG ĐỔI CHỮ KÝ (HARD INVARIANT #2):
 *   - renameWorkspaceAction(workspaceId, newName)  → lưu TÊN workspace
 *   - deleteWorkspaceAction(workspaceId)           → xóa mềm (Vùng nguy hiểm)
 *   - restoreWorkspaceAction(workspaceId)          → khôi phục khi soft-deleted
 *   - disconnectIntegration(workspaceId, provider) → ngắt kết nối (tab Kết nối)
 * Connect vẫn qua OAuth authorize route (giống ConnectorsPanel).
 *
 * MÔ TẢ (description): repo KHÔNG có action cập nhật description cho workspace đã tạo
 * (chỉ createWorkspaceAction nhận description lúc tạo; renameWorkspaceAction chỉ đổi
 * tên). Vì HARD INVARIANT #2 cấm thêm/đổi action → description hiển thị READ-ONLY.
 *
 * Xóa workspace là NON-OPTIMISTIC: chờ success → push /workspace + toast; lỗi → giữ
 * dialog + báo lỗi inline. Type-name confirm (M11 / FR-F5.2) là GUARD phía client
 * thêm TRÊN action delete có sẵn — không nới lỏng action.
 */

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
    Settings, Plug, Building2, TriangleAlert, Trash2, RotateCcw, Loader2,
    CloudUpload, HardDrive, Link2, Unlink, ExternalLink, ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import {
    renameWorkspaceAction,
    deleteWorkspaceAction,
    restoreWorkspaceAction,
} from '@/actions/workspace-actions'
import { disconnectIntegration } from '@/actions/integration-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
    Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from '@/components/ui/accordion'
import { roleLabel } from '@/lib/display-labels'
import { cn } from '@/lib/utils'
// [P4.7 review HIGH] Reuse the SAME desktop panels so Bảng giá + StudyPlace aren't lost on
// mobile (they have no other entry point). M11 optimizes the settings shell; these sub-panels
// render as-is — accessible, if not fully mobile-polished (their polish is out of M11 scope).
import PricingRulesPanel from '@/components/settings/PricingRulesPanel'
import StudyPlaceBoard from '@/components/study-place/StudyPlaceBoard'
import type { StudyPlaceProgressDTO } from '@/lib/study-place'

/* ── Types (mirror WorkspaceSettingsPanel props để page truyền cùng bộ) ── */
type IntegrationRow = {
    provider: string
    accountEmail: string | null
    connectedAt: string | Date
    updatedAt: string | Date
}
type PricingRuleRow = {
    id: string
    name: string
    clientId: number | null
    ruleType: string
    config: any
    isDefault: boolean
    sortOrder: number
    client: { id: number; name: string } | null
}
type ClientOption = { id: number; name: string }

type Props = {
    workspaceId: string
    workspace: {
        id: string
        name: string
        description: string | null
        status: string
        deletedAt: string | null
        hardDeleteAfter: string | null
    }
    currentUserRole: string
    isGlobalAdmin: boolean
    memberCount: number
    integrations?: IntegrationRow[]
    /** Nhận để giữ cùng chữ ký với panel — tab Bảng giá không thuộc phạm vi M11 mobile. */
    pricingRules?: PricingRuleRow[]
    clients?: ClientOption[]
    studyProgress?: unknown[]
}

type TabId = 'tong-quan' | 'ket-noi' | 'to-chuc'

const TABS: Array<{ id: TabId; label: string; icon: typeof Settings }> = [
    { id: 'tong-quan', label: 'Tổng quan', icon: Settings },
    { id: 'ket-noi', label: 'Kết nối', icon: Plug },
    { id: 'to-chuc', label: 'Tổ chức', icon: Building2 },
]

/* ── Providers (mirror ConnectorsPanel — cùng handling, action giữ nguyên) ── */
type ProviderMeta = {
    id: 'dropbox' | 'google_drive'
    label: string
    icon: typeof CloudUpload
    box: string
    tint: string
    authorizeUrl: string
}
const PROVIDERS: ProviderMeta[] = [
    {
        id: 'dropbox',
        label: 'Dropbox',
        icon: CloudUpload,
        box: 'bg-blue-500/10 border border-blue-500/20',
        tint: 'text-blue-400',
        authorizeUrl: '/api/integrations/dropbox/authorize',
    },
    {
        id: 'google_drive',
        label: 'Google Drive',
        icon: HardDrive,
        box: 'bg-emerald-500/10 border border-emerald-500/20',
        tint: 'text-emerald-400',
        authorizeUrl: '/api/integrations/google-drive/authorize',
    },
]

export default function MobileWorkspaceSettings({
    workspaceId, workspace, currentUserRole, isGlobalAdmin, memberCount,
    integrations = [],
    pricingRules = [],
    clients = [],
    studyProgress = [],
}: Props) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [, startTransition] = useTransition()

    const isOwner = currentUserRole === 'OWNER' || isGlobalAdmin
    const isSoftDeleted = workspace.status === 'SOFT_DELETED'
    const canEdit = isOwner && !isSoftDeleted

    // ── Tab đồng bộ URL (?tab=…), mặc định 'tong-quan' ──
    const rawTab = searchParams?.get('tab')
    const activeTab: TabId =
        rawTab === 'ket-noi' || rawTab === 'to-chuc' ? rawTab : 'tong-quan'

    function handleTabChange(tabId: TabId) {
        const params = new URLSearchParams(searchParams?.toString() ?? '')
        if (tabId === 'tong-quan') params.delete('tab')
        else params.set('tab', tabId)
        const query = params.toString()
        router.replace(query ? `?${query}` : '?', { scroll: false })
    }

    // ── Tổng quan: tên workspace (lưu qua renameWorkspaceAction) ──
    const [name, setName] = useState(workspace.name)
    const [saving, setSaving] = useState(false)
    const nameChanged = name.trim() !== '' && name.trim() !== workspace.name

    async function handleSaveName() {
        if (!nameChanged) return
        setSaving(true)
        try {
            const result = await renameWorkspaceAction(workspaceId, name.trim())
            if (result?.error) {
                toast.error(result.error)
            } else {
                toast.success('Đã lưu thông tin workspace.')
                startTransition(() => router.refresh())
            }
        } catch (err: any) {
            toast.error(err?.message || 'Lỗi khi lưu.')
        } finally {
            setSaving(false)
        }
    }

    // ── Khôi phục (khi soft-deleted) ──
    const [restoring, setRestoring] = useState(false)
    async function handleRestore() {
        setRestoring(true)
        try {
            const result = await restoreWorkspaceAction(workspaceId)
            if (result?.error) {
                toast.error(result.error)
            } else {
                toast.success('Workspace đã được khôi phục.')
                startTransition(() => router.refresh())
            }
        } catch (err: any) {
            toast.error(err?.message || 'Lỗi')
        } finally {
            setRestoring(false)
        }
    }

    // ── Xóa workspace (dialog + type-name confirm, NON-optimistic) ──
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState('')
    const [deleting, setDeleting] = useState(false)
    const [deleteError, setDeleteError] = useState<string | null>(null)
    const deleteArmed = deleteConfirm === workspace.name // FR-F5.2 gate

    async function handleDelete() {
        if (!deleteArmed) return // guard: nút chỉ bật khi gõ đúng tên
        setDeleting(true)
        setDeleteError(null)
        try {
            const result = await deleteWorkspaceAction(workspaceId)
            if (result?.error) {
                setDeleteError(result.error)
                toast.error(result.error)
                return // giữ dialog để user thấy lỗi
            }
            toast.success('Workspace đã được đưa vào thùng rác. Có 30 ngày để khôi phục.')
            router.push('/workspace')
        } catch (err: any) {
            const msg = err?.message || 'Lỗi khi xóa Workspace.'
            setDeleteError(msg)
            toast.error(msg)
        } finally {
            setDeleting(false)
        }
    }

    // ── Kết nối: disconnect (mirror ConnectorsPanel handling) ──
    const [disconnecting, setDisconnecting] = useState<string | null>(null)
    const integrationByProvider = new Map(integrations.map((i) => [i.provider, i]))

    function handleConnect(provider: ProviderMeta) {
        window.location.href = `${provider.authorizeUrl}?workspaceId=${workspaceId}`
    }
    async function handleDisconnect(providerId: string) {
        if (!confirm(`Ngắt kết nối ${providerId === 'dropbox' ? 'Dropbox' : 'Google Drive'}?`)) return
        setDisconnecting(providerId)
        try {
            const res = await disconnectIntegration(workspaceId, providerId)
            if ('error' in res) {
                toast.error(res.error)
            } else {
                toast.success('Đã ngắt kết nối.')
                startTransition(() => router.refresh())
            }
        } finally {
            setDisconnecting(null)
        }
    }

    return (
        <div className="flex flex-col gap-4 pb-content">
            {/* ── Header ── */}
            <h1 className="text-page font-bold text-foreground">Cài đặt Workspace</h1>

            {/* ── Tabs sticky (dưới app header 56px) — segmented control glass-2 ── */}
            <div
                role="tablist"
                aria-label="Cài đặt Workspace"
                className="sticky top-[calc(56px+env(safe-area-inset-top))] z-sticky flex gap-1 glass-2 p-1"
            >
                {TABS.map((tab) => {
                    const TabIcon = tab.icon
                    const active = activeTab === tab.id
                    return (
                        <button
                            key={tab.id}
                            role="tab"
                            aria-selected={active}
                            onClick={() => handleTabChange(tab.id)}
                            className={cn(
                                'flex h-12 flex-1 items-center justify-center gap-1.5 rounded-lg text-body-sm font-semibold transition-colors',
                                active
                                    ? 'bg-primary/15 text-primary-accent'
                                    : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                            )}
                        >
                            <TabIcon className="h-4 w-4 shrink-0" />
                            {tab.label}
                        </button>
                    )
                })}
            </div>

            {/* ══════════════ TAB: TỔNG QUAN ══════════════ */}
            {activeTab === 'tong-quan' && (
                <div role="tabpanel" className="flex flex-col gap-4">
                    {/* Soft-deleted → banner khôi phục (ẩn Vùng nguy hiểm) */}
                    {isSoftDeleted && (
                        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                            <div className="flex items-start gap-2">
                                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" strokeWidth={2} />
                                <div className="min-w-0 flex-1">
                                    <div className="text-body-sm font-bold text-destructive">Workspace đã bị xóa</div>
                                    <p className="mt-1 text-body-sm text-muted-foreground">
                                        Workspace này đã bị xóa mềm.
                                        {workspace.hardDeleteAfter && (
                                            <> Sẽ bị xóa vĩnh viễn vào{' '}
                                                <strong className="text-foreground">
                                                    {new Date(workspace.hardDeleteAfter).toLocaleDateString('vi-VN')}
                                                </strong>.
                                            </>
                                        )}
                                    </p>
                                </div>
                            </div>
                            {isOwner && (
                                <Button
                                    className="h-12 w-full"
                                    variant="secondary"
                                    disabled={restoring}
                                    onClick={handleRestore}
                                >
                                    {restoring
                                        ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                        : <RotateCcw className="mr-1.5 h-4 w-4" />}
                                    Khôi phục Workspace
                                </Button>
                            )}
                        </div>
                    )}

                    {/* Card thông tin: tên + mô tả */}
                    <div className="glass-1 rounded-xl p-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            {/* Tên workspace */}
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="ws-name" className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                                    Tên Workspace
                                </Label>
                                <Input
                                    id="ws-name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    readOnly={!canEdit}
                                    maxLength={50}
                                    className="h-12 text-body"
                                    placeholder="Tên workspace"
                                />
                            </div>

                            {/* Mô tả (read-only — không có action lưu description) */}
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="ws-desc" className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                                    Mô tả
                                </Label>
                                <Textarea
                                    id="ws-desc"
                                    readOnly
                                    value={workspace.description ?? ''}
                                    placeholder="Chưa có mô tả"
                                    className="min-h-[48px] text-body"
                                />
                                <p className="text-caption text-muted-foreground">
                                    Mô tả được đặt khi tạo workspace.
                                </p>
                            </div>
                        </div>

                        {/* Stats mini (parity với panel) */}
                        <div className="mt-4 grid grid-cols-3 gap-2">
                            <StatTile label="Thành viên" value={String(memberCount)} />
                            <StatTile
                                label="Trạng thái"
                                value={isSoftDeleted ? 'Đã xóa' : 'Hoạt động'}
                                tone={isSoftDeleted ? 'text-destructive' : 'text-success'}
                            />
                            <StatTile label="Vai trò" value={roleLabel(currentUserRole)} tone="text-primary-accent" />
                        </div>

                        {/* Lưu (chỉ owner + không soft-deleted) — lưu TÊN qua renameWorkspaceAction */}
                        {canEdit && (
                            <Button
                                className="mt-4 h-12 w-full"
                                disabled={!nameChanged || saving}
                                onClick={handleSaveName}
                            >
                                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                                Lưu thay đổi
                            </Button>
                        )}
                    </div>

                    {/* ── VÙNG NGUY HIỂM (LUÔN CUỐI, ≥24px cách card trên) ── */}
                    {isOwner && !isSoftDeleted && (
                        <div className="mt-6 space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                            <h2 className="flex items-center gap-2 text-title font-bold text-destructive">
                                <TriangleAlert className="h-5 w-5 shrink-0" strokeWidth={2} />
                                Vùng nguy hiểm
                            </h2>
                            <p className="text-body-sm text-muted-foreground">
                                Xóa workspace sẽ đưa vào thùng rác 30 ngày trước khi xóa vĩnh viễn.
                                Toàn bộ task, dữ liệu và thành viên sẽ bị ảnh hưởng. Chỉ OWNER mới có thể khôi phục.
                            </p>
                            <Button
                                variant="destructive"
                                className="h-12 w-full"
                                onClick={() => { setDeleteConfirm(''); setDeleteError(null); setDeleteOpen(true) }}
                            >
                                <Trash2 className="mr-1.5 h-4 w-4" />
                                Xóa Workspace
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════ TAB: KẾT NỐI ══════════════ */}
            {activeTab === 'ket-noi' && (
                <div role="tabpanel" className="flex flex-col gap-3">
                    {PROVIDERS.length === 0 ? (
                        <EmptyState
                            variant="first-use"
                            icon={Plug}
                            title="Chưa có dịch vụ nào để kết nối"
                            description="Các tích hợp lưu trữ sẽ xuất hiện ở đây khi khả dụng."
                        />
                    ) : (
                        PROVIDERS.map((provider) => {
                            const Icon = provider.icon
                            const integration = integrationByProvider.get(provider.id)
                            const isConnected = !!integration
                            const busy = disconnecting === provider.id
                            return (
                                <div key={provider.id} className="glass-1 rounded-xl p-4">
                                    {/* Row 1: logo 32px + tên + status Badge */}
                                    <div className="flex items-center gap-3">
                                        <div className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', provider.box)}>
                                            <Icon className={cn('h-4 w-4', provider.tint)} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="text-body-sm font-bold text-foreground">{provider.label}</div>
                                            {isConnected && integration?.accountEmail && (
                                                <div className="truncate text-caption text-muted-foreground">
                                                    {integration.accountEmail}
                                                </div>
                                            )}
                                        </div>
                                        {isConnected ? (
                                            <Badge variant="success" className="shrink-0">Đã kết nối</Badge>
                                        ) : (
                                            <Badge variant="secondary" className="shrink-0">Chưa kết nối</Badge>
                                        )}
                                    </div>

                                    {/* Row 2: action full-width h-11, cùng vị trí mọi card */}
                                    {isConnected ? (
                                        <Button
                                            variant="outline"
                                            className="mt-3 h-11 w-full text-destructive hover:text-destructive"
                                            disabled={busy}
                                            onClick={() => handleDisconnect(provider.id)}
                                        >
                                            {busy
                                                ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                                : <Unlink className="mr-1.5 h-4 w-4" />}
                                            Ngắt kết nối
                                        </Button>
                                    ) : (
                                        <Button
                                            className="mt-3 h-11 w-full"
                                            onClick={() => handleConnect(provider)}
                                        >
                                            <Link2 className="mr-1.5 h-4 w-4" />
                                            Kết nối
                                        </Button>
                                    )}
                                </div>
                            )
                        })
                    )}

                    {/* Blurb bảo mật/AES-256 → Accordion */}
                    <Accordion type="single" collapsible className="glass-1 rounded-xl px-4">
                        <AccordionItem value="security" className="border-b-0">
                            <AccordionTrigger className="text-body-sm font-semibold text-foreground">
                                <span className="flex items-center gap-2">
                                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                                    Bảo mật & mã hóa
                                </span>
                            </AccordionTrigger>
                            <AccordionContent className="text-body-sm leading-relaxed text-muted-foreground">
                                Tokens OAuth được mã hóa AES-256-GCM trước khi lưu vào database.
                                Chỉ bạn (chủ tài khoản) có thể truy cập và quản lý kết nối cá nhân của mình.
                                Bạn có thể ngắt kết nối bất kỳ lúc nào — provider sẽ revoke token và app sẽ
                                mất quyền truy cập folder của bạn.
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>

                    {/* [P4.7 review HIGH] Bảng giá — reuse desktop PricingRulesPanel so mobile
                        admins keep access (no other route surfaces it). */}
                    <PricingRulesPanel workspaceId={workspaceId} rules={pricingRules} clients={clients} />

                    {/* [P4.7 review HIGH] StudyPlace — reuse desktop board (only entry point). */}
                    <StudyPlaceBoard workspaceId={workspaceId} initialProgress={studyProgress as StudyPlaceProgressDTO[]} />
                </div>
            )}

            {/* ══════════════ TAB: TỔ CHỨC (DEFER) ══════════════ */}
            {activeTab === 'to-chuc' && (
                <div role="tabpanel" className="flex flex-col gap-4">
                    <div className="glass-1 rounded-xl p-4 space-y-3">
                        <div className="flex items-start gap-3">
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 border border-primary/20">
                                <Building2 className="h-4 w-4 text-primary-accent" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-body-sm font-bold text-foreground">Thương hiệu tổ chức</div>
                                <p className="mt-1 text-body-sm text-muted-foreground">
                                    Logo, tên tổ chức và màu thương hiệu được quản lý ở trang{' '}
                                    <span className="text-foreground">Thành viên tổ chức</span>, không nằm trong
                                    Cài đặt Workspace.
                                </p>
                            </div>
                        </div>
                        <Button variant="secondary" className="h-12 w-full" asChild>
                            <Link href={`/${workspaceId}/admin/profile-members`}>
                                <ExternalLink className="mr-1.5 h-4 w-4" />
                                Mở Thành viên tổ chức
                            </Link>
                        </Button>
                    </div>
                </div>
            )}

            {/* ══════════════ DIALOG XÓA (type-name confirm) ══════════════ */}
            <Dialog open={deleteOpen} onOpenChange={(o) => { if (!deleting) setDeleteOpen(o) }}>
                <DialogContent className="glass-3 z-dialog max-w-sm rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <TriangleAlert className="h-5 w-5 shrink-0" strokeWidth={2} />
                            Xóa Workspace
                        </DialogTitle>
                        <DialogDescription className="text-body-sm text-muted-foreground">
                            Hành động này đưa <span className="font-semibold text-foreground">{workspace.name}</span>{' '}
                            vào thùng rác 30 ngày. Nhập chính xác tên workspace để xác nhận.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-1.5 py-1">
                        <Label htmlFor="ws-delete-confirm" className="text-caption font-semibold uppercase tracking-wider text-destructive/80">
                            Nhập <span className="font-mono">{workspace.name}</span> để xác nhận
                        </Label>
                        <Input
                            id="ws-delete-confirm"
                            value={deleteConfirm}
                            onChange={(e) => { setDeleteConfirm(e.target.value); if (deleteError) setDeleteError(null) }}
                            placeholder={workspace.name}
                            autoComplete="off"
                            className="h-12 font-mono text-body"
                        />
                        {deleteError && (
                            <p className="text-caption text-destructive">{deleteError}</p>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="destructive"
                            className="h-12 w-full"
                            disabled={!deleteArmed || deleting}
                            onClick={handleDelete}
                        >
                            {deleting
                                ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                : <Trash2 className="mr-1.5 h-4 w-4" />}
                            Xóa Workspace
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: string }) {
    return (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
            <div className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className={cn('mt-0.5 truncate text-body-sm font-bold text-foreground', tone)}>{value}</div>
        </div>
    )
}
