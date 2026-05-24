'use client'

/**
 * [Username Handle] Forced migration modal for users with legacy username.
 *
 * Renders fullscreen overlay that blocks all underlying UI until user
 * picks a new ASCII handle. No close button, no skip button, no Esc handler.
 *
 * Triggered from [workspaceId]/layout.tsx + dashboard/layout.tsx via:
 *   `needsUsernameMigration(user.username, user.usernameSetByUser)`
 *
 * After successful migration, calls router.refresh() to re-evaluate the
 * server layout and remove the modal naturally.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { UsernameInput } from './UsernameInput'
import { completeUsernameMigration } from '@/actions/username-actions'

interface Props {
    /** User's current (legacy) username — shown so they know what's changing */
    currentUsername: string
    /** User's displayName (if any) — included in greeting */
    displayName?: string | null
}

export function UsernameMigrationModal({ currentUsername, displayName }: Props) {
    const router = useRouter()
    const [, startTransition] = useTransition()
    const [value, setValue] = useState('')
    const [valid, setValid] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    async function handleSubmit() {
        if (!valid || submitting) return
        setSubmitting(true)
        try {
            const res = await completeUsernameMigration(value)
            if ('error' in res) {
                toast.error(res.error)
                setSubmitting(false)
                return
            }
            toast.success('Đã cập nhật username thành công!')
            startTransition(() => router.refresh())
        } catch (err: any) {
            toast.error(err?.message ?? 'Lỗi khi cập nhật username.')
            setSubmitting(false)
        }
    }

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
            // Block clicks reaching underlying UI — no onClick close handler
            onClick={(e) => e.stopPropagation()}
        >
            <div
                className="w-full max-w-md rounded-3xl bg-zinc-950/95 backdrop-blur-xl border border-[rgba(139,92,246,0.30)] shadow-[0_24px_80px_rgba(0,0,0,0.7)] p-6 sm:p-8"
                style={{
                    background:
                        'radial-gradient(circle at top right, rgba(139,92,246,0.10), rgba(10,10,10,0.95))',
                }}
            >
                {/* Hero */}
                <div className="flex items-start gap-3 mb-5">
                    <div className="p-2.5 rounded-xl bg-violet-500/15 border border-violet-500/30 shrink-0">
                        <Sparkles size={20} className="text-violet-300" />
                    </div>
                    <div>
                        <h2 className="text-lg font-extrabold text-white">
                            Đặt Username mới
                        </h2>
                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                            Chào {displayName?.trim() || 'bạn'}! Hệ thống vừa cập nhật — username cần dạng mới (vd: <span className="text-violet-300 font-mono">bao_phuc.7</span>) để mời thành viên dễ hơn + tránh hiển thị email dài.
                        </p>
                    </div>
                </div>

                {/* Warning row showing current username */}
                <div className="mb-4 rounded-xl bg-amber-500/8 border border-amber-500/20 p-3 flex items-start gap-2.5">
                    <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-[11px] text-amber-200/90 leading-relaxed">
                        Username hiện tại:{' '}
                        <span className="font-mono text-amber-100 break-all">
                            {currentUsername}
                        </span>
                        <br />
                        Vui lòng đặt username mới để tiếp tục dùng app.
                    </div>
                </div>

                {/* Username input */}
                <div className="mb-5">
                    <label className="block text-xs font-bold uppercase tracking-wide text-zinc-400 mb-2">
                        Username mới
                    </label>
                    <UsernameInput
                        value={value}
                        onChange={(v, isValid) => {
                            setValue(v)
                            setValid(isValid)
                        }}
                        autoFocus
                        placeholder="vd: bao_phuc.7"
                    />
                </div>

                {/* Submit */}
                <button
                    onClick={handleSubmit}
                    disabled={!valid || submitting}
                    className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={14} />}
                    Hoàn tất
                </button>

                <p className="text-[10px] text-zinc-600 text-center mt-3 leading-relaxed">
                    Bạn có thể đổi lại username sau ở phần Settings nếu cần.
                </p>
            </div>
        </div>
    )
}
