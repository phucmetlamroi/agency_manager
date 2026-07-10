// [Review module P5.5] Modal "Tạo link chia sẻ" / "Chỉnh sửa link chia sẻ"
// (UI-UX §7.2). Create mode: gets a target item list; the URL activates on
// "Tạo link" ("Sao chép" before create = create-then-copy). Edit mode: same
// form prefilled + Tắt/Bật lại link; changes apply to open guests immediately.

'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Copy, Link2, Loader2, X } from 'lucide-react'
import {
    apiCreateShare,
    apiSetShareRevoked,
    apiUpdateShare,
    type ShareDto,
} from '@/lib/review/share-admin-client'

export interface ShareModalTarget {
    workspaceId: string
    items: { type: 'asset' | 'folder'; id: string; title: string }[]
}

const EXPIRY_PRESETS = [
    { key: 'none', label: 'Không hết hạn' },
    { key: '7d', label: '7 ngày' },
    { key: '30d', label: '30 ngày' },
] as const
type ExpiryKey = (typeof EXPIRY_PRESETS)[number]['key'] | 'keep'

function fmtDay(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    } catch {
        return iso
    }
}

export function ShareLinkModal({
    target,
    existing,
    onClose,
    onSaved,
}: {
    /** create mode — the items to share (ignored when `existing` set) */
    target?: ShareModalTarget
    /** edit mode — prefill from this share */
    existing?: ShareDto
    onClose: () => void
    onSaved?: (share: ShareDto) => void
}) {
    const isEdit = !!existing
    const [share, setShare] = useState<ShareDto | null>(existing ?? null)
    const [name, setName] = useState(existing?.name ?? target?.items[0]?.title ?? '')
    const [allowComments, setAllowComments] = useState(existing?.allowComments ?? true)
    const [allowDownload, setAllowDownload] = useState(existing?.allowDownload ?? false)
    const [downloadOnlyWhenApproved, setDlApproved] = useState(existing?.downloadOnlyWhenApproved ?? true)
    const [showAllVersions, setShowAllVersions] = useState(existing?.showAllVersions ?? false)
    // password: '' = keep (edit) / none (create); typing sets; CLEAR button removes.
    const [password, setPassword] = useState('')
    const [removePassword, setRemovePassword] = useState(false)
    // Edit mode with an existing expiry starts as 'keep' (do NOT touch it) — the old
    // code prefilled '30d' and then rewrote expiry to now+30d on ANY save, silently
    // extending a nearly-expired link (finding P5-R#6/#7).
    const [expiry, setExpiry] = useState<ExpiryKey>(() => (existing?.expiresAt ? 'keep' : 'none'))
    const [busy, setBusy] = useState(false)

    const itemsLabel = existing
        ? existing.items.map((i) => i.title).join(', ')
        : (target?.items ?? []).map((i) => i.title).join(', ')

    const expiresAtValue = (): string | null | undefined => {
        if (expiry === 'keep') return undefined // leave the existing expiry exactly as-is
        if (isEdit && expiry === 'none' && !existing?.expiresAt) return undefined // untouched
        if (expiry === 'none') return null
        const days = expiry === '7d' ? 7 : 30
        return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
    }

    const doCreate = async (): Promise<ShareDto | null> => {
        if (!target) return null
        setBusy(true)
        try {
            const { share: created } = await apiCreateShare({
                workspaceId: target.workspaceId,
                items: target.items.map(({ type, id }) => ({ type, id })),
                name: name.trim() || undefined,
                allowComments,
                allowDownload,
                downloadOnlyWhenApproved,
                showAllVersions,
                password: password.trim() ? password.trim() : undefined,
                expiresAt: expiresAtValue() ?? null,
            })
            setShare(created)
            onSaved?.(created)
            toast.success('Đã tạo link chia sẻ.', {
                action: { label: 'Sao chép', onClick: () => void copyUrl(created.url) },
            })
            return created
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Không tạo được link.')
            return null
        } finally {
            setBusy(false)
        }
    }

    const doSave = async () => {
        if (!share) return
        setBusy(true)
        try {
            const { share: updated } = await apiUpdateShare(share.id, {
                name: name.trim() || undefined,
                allowComments,
                allowDownload,
                downloadOnlyWhenApproved,
                showAllVersions,
                ...(removePassword ? { password: null } : password.trim() ? { password: password.trim() } : {}),
                ...(expiresAtValue() !== undefined ? { expiresAt: expiresAtValue() ?? null } : {}),
                expectedRowVersion: share.rowVersion,
            })
            setShare(updated)
            onSaved?.(updated)
            toast.success('Đã lưu cấu hình link.')
            onClose()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Không lưu được.')
        } finally {
            setBusy(false)
        }
    }

    const toggleRevoked = async () => {
        if (!share) return
        setBusy(true)
        try {
            const { share: updated } = await apiSetShareRevoked(share.id, !share.revokedAt)
            setShare(updated)
            onSaved?.(updated)
            toast.success(updated.revokedAt ? 'Đã tắt link chia sẻ.' : 'Đã bật lại link chia sẻ.')
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Không đổi được trạng thái link.')
        } finally {
            setBusy(false)
        }
    }

    const copyUrl = async (url: string) => {
        try {
            await navigator.clipboard.writeText(url)
            toast.success('Đã sao chép link.')
        } catch {
            toast.error('Không sao chép được — hãy copy thủ công.')
        }
    }

    const onCopyClick = async () => {
        if (share) return void copyUrl(share.url)
        const created = await doCreate() // "Sao chép" before create ⇒ create-then-copy (§7.2)
        if (created) void copyUrl(created.url)
    }

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
            <div
                className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950/95 p-5 shadow-2xl backdrop-blur-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between">
                    <h2 className="text-[15px] font-semibold text-white">
                        {isEdit || share ? 'Chỉnh sửa link chia sẻ' : 'Tạo link chia sẻ'}
                    </h2>
                    <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-white/10" aria-label="Đóng">
                        <X size={15} />
                    </button>
                </div>

                <p className="mt-1.5 truncate text-[12px] text-zinc-400" title={itemsLabel}>
                    Nội dung: {itemsLabel || '—'}
                </p>

                <label className="mt-3.5 block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tên link</span>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={200}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-900/50 px-3 py-2 text-[13px] text-white placeholder:text-muted-foreground focus:border-violet-400/50 focus:outline-none"
                        placeholder="Tên hiển thị nội bộ…"
                    />
                </label>

                <div className="mt-3.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Quyền</p>
                    <div className="mt-1.5 space-y-1.5">
                        <Toggle label="Cho phép bình luận" checked={allowComments} onChange={setAllowComments} />
                        <Toggle label="Cho phép tải xuống" checked={allowDownload} onChange={setAllowDownload} />
                        {allowDownload && (
                            <div className="pl-5">
                                <Toggle label="Chỉ cho tải khi đã duyệt" checked={downloadOnlyWhenApproved} onChange={setDlApproved} />
                            </div>
                        )}
                        <Toggle label="Hiện tất cả version" checked={showAllVersions} onChange={setShowAllVersions} />
                    </div>
                </div>

                <div className="mt-3.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Bảo mật</p>
                    <div className="mt-1.5 flex gap-2">
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value)
                                setRemovePassword(false)
                            }}
                            placeholder={
                                removePassword
                                    ? 'Sẽ bỏ mật khẩu khi lưu'
                                    : (share ?? existing)?.hasPassword
                                      ? 'Đang có mật khẩu — nhập để đổi'
                                      : 'Đặt mật khẩu…'
                            }
                            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-900/50 px-3 py-2 text-[13px] text-white placeholder:text-muted-foreground focus:border-violet-400/50 focus:outline-none"
                        />
                        {(share ?? existing)?.hasPassword && !removePassword && (
                            <button
                                onClick={() => {
                                    setRemovePassword(true)
                                    setPassword('')
                                }}
                                className="shrink-0 rounded-xl border border-white/10 px-2.5 text-[12px] text-zinc-400 hover:bg-white/10"
                            >
                                Bỏ mật khẩu
                            </button>
                        )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {existing?.expiresAt && (
                            <button
                                onClick={() => setExpiry('keep')}
                                className={`rounded-lg px-2.5 py-1 text-[11.5px] ${
                                    expiry === 'keep' ? 'bg-violet-500/20 text-violet-200' : 'text-zinc-400 hover:bg-white/[0.06]'
                                }`}
                            >
                                Giữ hạn (hết {fmtDay(existing.expiresAt)})
                            </button>
                        )}
                        {EXPIRY_PRESETS.map((p) => (
                            <button
                                key={p.key}
                                onClick={() => setExpiry(p.key)}
                                className={`rounded-lg px-2.5 py-1 text-[11.5px] ${
                                    expiry === p.key
                                        ? 'bg-violet-500/20 text-violet-200'
                                        : 'text-zinc-400 hover:bg-white/[0.06]'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* URL row */}
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/40 px-3 py-2">
                    <Link2 size={14} className="shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-zinc-300">
                        {share ? share.url.replace(/^https?:\/\//, '') : 'Link sẽ hiện sau khi tạo'}
                    </span>
                    <button
                        onClick={() => void onCopyClick()}
                        disabled={busy}
                        className="flex shrink-0 items-center gap-1 rounded-lg bg-white/[0.07] px-2 py-1 text-[11.5px] text-zinc-200 hover:bg-white/[0.12] disabled:opacity-50"
                    >
                        <Copy size={12} /> Sao chép
                    </button>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2">
                    {share ? (
                        <button
                            onClick={() => void toggleRevoked()}
                            disabled={busy}
                            className={`rounded-xl px-3 py-2 text-[12.5px] font-medium ${
                                share.revokedAt
                                    ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                                    : 'bg-red-500/10 text-red-300 hover:bg-red-500/20'
                            } disabled:opacity-50`}
                        >
                            {share.revokedAt ? 'Bật lại link' : 'Tắt link'}
                        </button>
                    ) : (
                        <span />
                    )}
                    <div className="flex gap-2">
                        <button onClick={onClose} className="rounded-xl px-3 py-2 text-[12.5px] text-zinc-400 hover:bg-white/[0.06]">
                            Hủy
                        </button>
                        <button
                            onClick={() => void (share ? doSave() : doCreate())}
                            disabled={busy}
                            className="flex items-center gap-1.5 rounded-xl bg-[#8B5CF6] px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#A855F7] disabled:opacity-60"
                        >
                            {busy && <Loader2 size={13} className="animate-spin" />}
                            {share ? 'Lưu' : 'Tạo link'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[12.5px] text-zinc-200 hover:bg-white/[0.04]"
        >
            {label}
            <span
                className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${checked ? 'bg-violet-500' : 'bg-white/15'}`}
            >
                <span
                    className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all ${checked ? 'left-[16px]' : 'left-[2px]'}`}
                />
            </span>
        </button>
    )
}
