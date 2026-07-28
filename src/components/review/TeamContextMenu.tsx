'use client'

// [Review module P2.5] Right-click context menus (FR-B07 folder / FR-B08 asset /
// canvas). ONE controlled Radix ContextMenu wraps the whole content area; the target
// item is resolved from `data-review-id`/`data-review-type` on the card/row the click
// landed on (null = empty canvas). The Content renders the exact PRD item order — share
// items + Manage Versions are shown DISABLED (they light up in P5/P3) so the item count
// already matches AC1, and the frame.io-excluded items (Manage Access / Make Restricted /
// Open on Desktop / Compare Versions / Generate Transcripts / Upload Caption) never appear.

import { type ReactNode } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import {
    Share2,
    ListPlus,
    Download,
    Link as LinkIcon,
    CopyPlus,
    FolderInput,
    Files,
    Pencil,
    Trash2,
    Layers,
    UploadCloud,
    FolderUp,
    FolderPlus,
    FolderOpen,
    RotateCcw,
} from 'lucide-react'

export type MenuTargetKind = 'folder' | 'asset'
export interface MenuTarget {
    type: MenuTargetKind
    id: string
}

const CONTENT_CLS =
    'z-50 min-w-[220px] overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 p-1 text-zinc-200 shadow-2xl shadow-black/60 backdrop-blur-xl'

function Item({
    icon,
    label,
    onSelect,
    disabled,
    danger,
    hint,
    trailing,
}: {
    icon: ReactNode
    label: string
    onSelect?: () => void
    disabled?: boolean
    danger?: boolean
    hint?: string
    trailing?: ReactNode
}) {
    return (
        <ContextMenu.Item
            disabled={disabled}
            onSelect={(e) => {
                // Keep the menu behavior predictable: run our handler, let Radix close.
                if (onSelect) onSelect()
                else e.preventDefault()
            }}
            title={hint}
            className={`flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[12.5px] outline-none transition-colors data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 ${
                danger
                    ? 'text-red-300 data-[highlighted]:bg-red-500/15 data-[highlighted]:text-red-200'
                    : 'text-zinc-200 data-[highlighted]:bg-violet-500/15 data-[highlighted]:text-white'
            }`}
        >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center text-zinc-400">{icon}</span>
            <span className="flex-1 truncate">{label}</span>
            {trailing}
        </ContextMenu.Item>
    )
}

function Sep() {
    return <ContextMenu.Separator className="my-1 h-px bg-white/[0.07]" />
}

const SOON = <span className="rounded bg-white/[0.06] px-1.5 py-px text-[9.5px] font-medium uppercase tracking-wide text-muted-foreground">bản sau</span>

export interface ItemMenuHandlers {
    onDownload: () => void
    onCopyUrl: () => void
    onCopyTo: () => void
    onMoveTo: () => void
    onDuplicate: () => void
    onRename: () => void
    onDelete: () => void
    /** [foldering 2026-07-27] Folder menu only: lift the videos out and drop the wrapper. */
    onUngroup?: () => void
    /** Asset menu only: put the name back to the task title and re-enable automatic sync. */
    onResetName?: () => void
    canDelete: boolean
    /** P3.4 — asset menu only; present (enabled) when a single asset is the target. */
    onManageVersions?: () => void
    /** P5.5 — opens the create-share modal for the acting items (FR-F01). */
    onCreateShare?: () => void
}

/** FR-B07 — folder menu (9 items, exact order). "Thêm vào link" [S] lands in P6. */
export function FolderMenuContent(h: ItemMenuHandlers) {
    return (
        <>
            <Item icon={<Share2 size={15} />} label="Tạo link chia sẻ" onSelect={h.onCreateShare} disabled={!h.onCreateShare} />
            <Item icon={<ListPlus size={15} />} label="Thêm vào link chia sẻ" disabled hint="Có ở bản sau (P6)" trailing={SOON} />
            <Sep />
            <Item icon={<Download size={15} />} label="Tải xuống" onSelect={h.onDownload} hint="Tải toàn bộ bản gốc trong thư mục" />
            <Item icon={<LinkIcon size={15} />} label="Sao chép URL thư mục" onSelect={h.onCopyUrl} />
            <Sep />
            <Item icon={<CopyPlus size={15} />} label="Sao chép tới…" onSelect={h.onCopyTo} />
            <Item icon={<FolderInput size={15} />} label="Di chuyển tới…" onSelect={h.onMoveTo} />
            <Item icon={<Files size={15} />} label="Nhân bản" onSelect={h.onDuplicate} />
            <Item icon={<Pencil size={15} />} label="Đổi tên" onSelect={h.onRename} />
            {h.onUngroup && (
                <Item
                    icon={<FolderOpen size={15} />}
                    label="Bỏ thư mục"
                    onSelect={h.onUngroup}
                    hint="Đưa video bên trong ra thư mục cha rồi xóa thư mục này"
                />
            )}
            <Sep />
            <Item
                icon={<Trash2 size={15} />}
                label="Xóa"
                danger
                onSelect={h.canDelete ? h.onDelete : undefined}
                disabled={!h.canDelete}
                hint={h.canDelete ? undefined : 'Chỉ người tạo hoặc quản trị được xóa thư mục này'}
            />
        </>
    )
}

/** FR-B08 — asset menu (10 items, exact order). "Thêm vào link" [S] lands in P6. */
export function AssetMenuContent(h: ItemMenuHandlers) {
    return (
        <>
            <Item icon={<Share2 size={15} />} label="Tạo link chia sẻ" onSelect={h.onCreateShare} disabled={!h.onCreateShare} />
            <Item icon={<ListPlus size={15} />} label="Thêm vào link chia sẻ" disabled hint="Có ở bản sau (P6)" trailing={SOON} />
            <Item
                icon={<Layers size={15} />}
                label="Quản lý phiên bản"
                onSelect={h.onManageVersions}
                disabled={!h.onManageVersions}
                hint={h.onManageVersions ? undefined : 'Chọn đúng một asset để quản lý phiên bản'}
            />
            <Sep />
            <Item icon={<Download size={15} />} label="Tải xuống" onSelect={h.onDownload} hint="Tải bản gốc phiên bản hiện tại" />
            <Item icon={<LinkIcon size={15} />} label="Sao chép URL asset" onSelect={h.onCopyUrl} />
            <Sep />
            <Item icon={<CopyPlus size={15} />} label="Sao chép tới…" onSelect={h.onCopyTo} />
            <Item icon={<FolderInput size={15} />} label="Di chuyển tới…" onSelect={h.onMoveTo} />
            <Item icon={<Files size={15} />} label="Nhân bản" onSelect={h.onDuplicate} />
            <Item icon={<Pencil size={15} />} label="Đổi tên" onSelect={h.onRename} />
            {h.onResetName && (
                <Item
                    icon={<RotateCcw size={15} />}
                    label="Reset về tên Task"
                    onSelect={h.onResetName}
                    hint="Lấy lại tên từ task, và bật lại tự đồng bộ khi task đổi tên về sau"
                />
            )}
            <Sep />
            <Item
                icon={<Trash2 size={15} />}
                label="Xóa"
                danger
                onSelect={h.canDelete ? h.onDelete : undefined}
                disabled={!h.canDelete}
                hint={h.canDelete ? undefined : 'Lựa chọn có thư mục người khác tạo — chỉ người tạo hoặc quản trị được xóa'}
            />
        </>
    )
}

/** Canvas menu (exactly 3 — PRD FR-B02). */
export function CanvasMenuContent({
    onUploadFiles,
    onUploadFolder,
    onNewFolder,
}: {
    onUploadFiles: () => void
    onUploadFolder: () => void
    onNewFolder: () => void
}) {
    return (
        <>
            <Item icon={<UploadCloud size={15} />} label="Tải asset lên" onSelect={onUploadFiles} />
            <Item icon={<FolderUp size={15} />} label="Tải thư mục lên" onSelect={onUploadFolder} />
            <Item icon={<FolderPlus size={15} />} label="Thư mục mới" onSelect={onNewFolder} />
        </>
    )
}

/**
 * Wrap the content area in the single controlled ContextMenu. `resolveTarget` reads the
 * right-clicked DOM node → the item (or null for canvas); the parent decides what to
 * render for that target via `renderContent`.
 */
export function TeamContextMenuRoot({
    children,
    onOpenTarget,
    renderContent,
}: {
    children: ReactNode
    onOpenTarget: (target: MenuTarget | null) => void
    renderContent: () => ReactNode
}) {
    return (
        <ContextMenu.Root>
            <ContextMenu.Trigger asChild>
                <div
                    className="contents"
                    onContextMenuCapture={(e) => {
                        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-review-id]')
                        if (el?.dataset.reviewId && (el.dataset.reviewType === 'folder' || el.dataset.reviewType === 'asset')) {
                            onOpenTarget({ type: el.dataset.reviewType, id: el.dataset.reviewId })
                        } else {
                            onOpenTarget(null)
                        }
                    }}
                >
                    {children}
                </div>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
                <ContextMenu.Content className={CONTENT_CLS} collisionPadding={12}>
                    {renderContent()}
                </ContextMenu.Content>
            </ContextMenu.Portal>
        </ContextMenu.Root>
    )
}
