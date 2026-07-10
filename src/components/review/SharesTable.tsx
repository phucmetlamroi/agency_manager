// [Review module P5.5] Trang "Link chia sẻ" (UI-UX §7.3, FR-F04): every share of
// the workspace (ADMIN) / own + assigned-task shares (USER). Copy / Chỉnh sửa
// (ShareLinkModal edit mode) / Tắt–Bật lại / Xóa (server enforces ADMIN).

'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Copy, Eye, Link2, Loader2, MoreHorizontal, Pencil, Power, RefreshCw, Trash2 } from 'lucide-react'
import { REVIEW_MODULE_LABEL } from '@/lib/review/labels'
import {
    apiDeleteShare,
    apiListShares,
    apiSetShareRevoked,
    type ShareDto,
    type ShareState,
} from '@/lib/review/share-admin-client'
import { ShareLinkModal } from './ShareLinkModal'

const STATE_CHIP: Record<ShareState, { label: string; cls: string }> = {
    active: { label: 'Đang hoạt động', cls: 'bg-emerald-500/15 text-emerald-300' },
    revoked: { label: 'Đã tắt', cls: 'bg-zinc-500/20 text-zinc-400' },
    expired: { label: 'Hết hạn', cls: 'bg-red-500/10 text-red-300' },
}

export function SharesTable({ workspaceId }: { workspaceId: string }) {
    const [items, setItems] = useState<ShareDto[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [stateFilter, setStateFilter] = useState<ShareState | 'all'>('all')
    const [editing, setEditing] = useState<ShareDto | null>(null)
    const [menuFor, setMenuFor] = useState<string | null>(null)

    const load = useCallback(async () => {
        setError(null)
        try {
            const res = await apiListShares({
                workspaceId,
                state: stateFilter === 'all' ? undefined : stateFilter,
            })
            setItems(res.items)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Không tải được danh sách link.')
        }
    }, [workspaceId, stateFilter])

    useEffect(() => {
        void load()
    }, [load])

    const copyUrl = async (url: string) => {
        try {
            await navigator.clipboard.writeText(url)
            toast.success('Đã sao chép link.')
        } catch {
            toast.error('Không sao chép được.')
        }
    }
    const toggleRevoked = async (s: ShareDto) => {
        try {
            await apiSetShareRevoked(s.id, !s.revokedAt)
            toast.success(s.revokedAt ? 'Đã bật lại link chia sẻ.' : 'Đã tắt link chia sẻ.')
            void load()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Không đổi được trạng thái.')
        }
    }
    const remove = async (s: ShareDto) => {
        if (!confirm(`Xóa link "${s.name}"? Khách sẽ không mở được nữa.`)) return
        try {
            await apiDeleteShare(s.id)
            toast.success('Đã xóa link.')
            void load()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Không xóa được (chỉ admin xóa được link).')
        }
    }

    return (
        <div className="min-h-[100dvh] bg-zinc-950 px-4 py-5 text-zinc-100 sm:px-6">
            <div className="mx-auto max-w-5xl">
                <div className="flex flex-wrap items-center gap-3">
                    <a
                        href={`/${workspaceId}/team`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
                        aria-label={`Quay lại ${REVIEW_MODULE_LABEL}`}
                    >
                        <ArrowLeft size={16} />
                    </a>
                    <h1 className="text-[15px] font-semibold">Link chia sẻ</h1>
                    {items && <span className="text-[12px] text-muted-foreground">{items.length} link</span>}
                    <div className="flex-1" />
                    <div className="flex gap-1">
                        {(['all', 'active', 'revoked', 'expired'] as const).map((k) => (
                            <button
                                key={k}
                                onClick={() => setStateFilter(k)}
                                className={`rounded-lg px-2.5 py-1.5 text-[11.5px] ${
                                    stateFilter === k ? 'bg-violet-500/20 text-violet-200' : 'text-zinc-400 hover:bg-white/[0.06]'
                                }`}
                            >
                                {k === 'all' ? 'Tất cả' : STATE_CHIP[k].label}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => void load()}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/[0.06]"
                        aria-label="Tải lại"
                    >
                        <RefreshCw size={14} />
                    </button>
                </div>

                {error ? (
                    <div className="mt-10 text-center text-[13px] text-red-300">
                        {error}{' '}
                        <button onClick={() => void load()} className="underline">
                            Thử lại
                        </button>
                    </div>
                ) : !items ? (
                    <div className="grid h-48 place-items-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : items.length === 0 ? (
                    <div className="mt-14 text-center">
                        <Link2 className="mx-auto h-8 w-8 text-zinc-700" />
                        <p className="mt-2 text-[13.5px] font-medium text-zinc-300">Chưa có link chia sẻ nào</p>
                        <p className="mt-1 text-[12px] text-muted-foreground">
                            Tạo link từ menu chuột phải trên asset, hoặc từ khối BÀN GIAO của task.
                        </p>
                    </div>
                ) : (
                    <div className="mt-4 overflow-x-auto rounded-2xl border border-white/[0.07]">
                        <table className="w-full min-w-[760px] text-left text-[12.5px]">
                            <thead>
                                <tr className="border-b border-white/[0.07] text-[11px] uppercase tracking-wide text-muted-foreground">
                                    <th className="px-3.5 py-2.5 font-medium">Tên</th>
                                    <th className="px-3.5 py-2.5 font-medium">Đích</th>
                                    <th className="px-3.5 py-2.5 font-medium">Trạng thái</th>
                                    <th className="px-3.5 py-2.5 font-medium">Lượt xem</th>
                                    <th className="px-3.5 py-2.5 font-medium">Ngày tạo</th>
                                    <th className="px-3.5 py-2.5 font-medium">Người tạo</th>
                                    <th className="w-10 px-2 py-2.5" />
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((s) => {
                                    const chip = STATE_CHIP[s.state]
                                    return (
                                        <tr key={s.id} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.03]">
                                            <td className="px-3.5 py-2.5">
                                                <button onClick={() => setEditing(s)} className="max-w-[220px] truncate font-medium text-zinc-100 hover:underline">
                                                    {s.name}
                                                </button>
                                                {s.hasPassword && <span className="ml-1.5 text-[10px]">🔒</span>}
                                            </td>
                                            <td className="max-w-[200px] truncate px-3.5 py-2.5 text-zinc-400" title={s.items.map((i) => i.title).join(', ')}>
                                                {s.items.map((i) => i.title).join(', ')}
                                            </td>
                                            <td className="px-3.5 py-2.5">
                                                <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${chip.cls}`}>{chip.label}</span>
                                            </td>
                                            <td className="px-3.5 py-2.5 text-zinc-300" title={s.lastViewedAt ? `Xem lần cuối: ${fmtDate(s.lastViewedAt)}` : undefined}>
                                                <span className="inline-flex items-center gap-1">
                                                    <Eye size={12} className="text-muted-foreground" /> {s.viewCount}
                                                </span>
                                            </td>
                                            <td className="px-3.5 py-2.5 text-zinc-400">{fmtDate(s.createdAt)}</td>
                                            <td className="max-w-[130px] truncate px-3.5 py-2.5 text-zinc-400">{s.createdBy?.name ?? '—'}</td>
                                            <td className="relative px-2 py-2.5">
                                                <button
                                                    onClick={() => setMenuFor(menuFor === s.id ? null : s.id)}
                                                    className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-white/[0.08]"
                                                    aria-label="Hành động"
                                                >
                                                    <MoreHorizontal size={14} />
                                                </button>
                                                {menuFor === s.id && (
                                                    <>
                                                        <div className="fixed inset-0 z-30" onClick={() => setMenuFor(null)} />
                                                        <div className="absolute right-2 top-9 z-40 w-44 rounded-xl border border-white/10 bg-zinc-950/95 p-1 shadow-2xl backdrop-blur">
                                                            <MenuBtn icon={<Copy size={13} />} label="Sao chép URL" onClick={() => { setMenuFor(null); void copyUrl(s.url) }} />
                                                            <MenuBtn icon={<Pencil size={13} />} label="Chỉnh sửa" onClick={() => { setMenuFor(null); setEditing(s) }} />
                                                            <MenuBtn
                                                                icon={<Power size={13} />}
                                                                label={s.revokedAt ? 'Bật lại link' : 'Tắt link'}
                                                                onClick={() => { setMenuFor(null); void toggleRevoked(s) }}
                                                            />
                                                            <div className="my-1 h-px bg-white/[0.07]" />
                                                            <MenuBtn icon={<Trash2 size={13} />} label="Xóa link" danger onClick={() => { setMenuFor(null); void remove(s) }} />
                                                        </div>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {editing && (
                <ShareLinkModal
                    existing={editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => void load()}
                />
            )}
        </div>
    )
}

function MenuBtn({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
    return (
        <button
            onClick={onClick}
            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-[7px] text-left text-[12px] ${
                danger ? 'text-red-300 hover:bg-red-500/15' : 'text-zinc-200 hover:bg-white/[0.07]'
            }`}
        >
            {icon} {label}
        </button>
    )
}

function fmtDate(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    } catch {
        return iso
    }
}
