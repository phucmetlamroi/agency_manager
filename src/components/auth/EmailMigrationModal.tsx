'use client'

/**
 * Auth Phase 3 — Email Migration Modal cho user cũ.
 *
 * Hiển thị khi user (Vietnamese username, không có email) login lần đầu sau Phase 1 deploy.
 * Modal KHÔNG thể đóng (no X, no backdrop dismiss) — user MUST nhập email.
 *
 * 2-step flow:
 *   Step 1: Nhập email → gửi OTP đến email đó
 *   Step 2: Nhập OTP 6 digits → verify → server update User.email + bump sessionVersion
 *           → user phải re-login với email mới (sessionVersion mismatch).
 *
 * Props: chỉ cần displayName để hiển thị greeting.
 */

import { useState, useRef, useEffect, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Lock, Loader2, RefreshCw } from 'lucide-react'

interface Props {
    displayName: string
    /** Optional — nếu provide, gọi sau khi migration thành công thay vì redirect /login. */
    onSuccess?: () => void
}

type Step = 'email' | 'otp'

export default function EmailMigrationModal({ displayName, onSuccess }: Props) {
    const [step, setStep] = useState<Step>('email')
    const [newEmail, setNewEmail] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [info, setInfo] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 py-8 bg-black/80 backdrop-blur-md">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-md p-8 backdrop-blur-2xl bg-zinc-950/90 border border-white/10 rounded-2xl shadow-2xl"
            >
                <div className="flex items-center gap-3 mb-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400">
                        🔐
                    </div>
                    <h2 className="text-xl font-bold text-zinc-100">Cần thiết lập email</h2>
                </div>

                <p className="text-sm text-zinc-400 mb-1 mt-3">
                    Chào <strong className="text-zinc-200">{displayName}</strong>,
                </p>
                <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                    Để tiếp tục sử dụng HustlyTasker, vui lòng cung cấp địa chỉ email của bạn.
                    Tên <strong className="text-zinc-200">"{displayName}"</strong> của bạn sẽ được giữ nguyên làm tên hiển thị.
                </p>

                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm"
                        >
                            {error}
                        </motion.div>
                    )}
                    {info && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mb-4 p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-300 text-sm"
                        >
                            {info}
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                    {step === 'email' && (
                        <StepEmail
                            key="email"
                            email={newEmail}
                            setEmail={setNewEmail}
                            isPending={isPending}
                            onSubmit={async (em) => {
                                setError(null); setInfo(null)
                                startTransition(async () => {
                                    try {
                                        const res = await fetch('/api/auth/migrate-email', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ step: 'request_otp', newEmail: em }),
                                        })
                                        const data = await res.json()
                                        if (res.ok && data.success) {
                                            setInfo(data.message)
                                            setStep('otp')
                                        } else {
                                            setError(data.message || 'Đã xảy ra lỗi.')
                                        }
                                    } catch {
                                        setError('Không thể kết nối đến máy chủ.')
                                    }
                                })
                            }}
                        />
                    )}

                    {step === 'otp' && (
                        <StepOtp
                            key="otp"
                            email={newEmail}
                            isPending={isPending}
                            onResend={async () => {
                                setError(null); setInfo(null)
                                startTransition(async () => {
                                    try {
                                        const res = await fetch('/api/auth/migrate-email', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ step: 'request_otp', newEmail }),
                                        })
                                        const data = await res.json()
                                        setInfo(data.message || 'Đã gửi lại mã.')
                                    } catch {
                                        setError('Không thể gửi lại mã.')
                                    }
                                })
                            }}
                            onVerify={async (otp) => {
                                setError(null); setInfo(null)
                                startTransition(async () => {
                                    try {
                                        const res = await fetch('/api/auth/migrate-email', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ step: 'verify_otp', newEmail, otp }),
                                        })
                                        const data = await res.json()
                                        if (res.ok && data.success) {
                                            // Email migrated — JWT cũ giờ invalid (sessionVersion bumped).
                                            // Force re-login.
                                            if (onSuccess) {
                                                onSuccess()
                                            } else {
                                                window.location.href = '/api/auth/logout'
                                            }
                                        } else {
                                            setError(data.message || 'Mã OTP không đúng.')
                                        }
                                    } catch {
                                        setError('Không thể kết nối đến máy chủ.')
                                    }
                                })
                            }}
                            onBack={() => { setStep('email'); setError(null); setInfo(null) }}
                        />
                    )}
                </AnimatePresence>

                <p className="mt-5 text-xs text-zinc-500 text-center">
                    Mọi tasks, workspace, và lịch sử của bạn vẫn được giữ nguyên.
                </p>
            </motion.div>
        </div>
    )
}

// ─── Step 1: Email ──────────────────────────────────────────────

function StepEmail({ email, setEmail, isPending, onSubmit }: {
    email: string
    setEmail: (e: string) => void
    isPending: boolean
    onSubmit: (email: string) => void
}) {
    return (
        <motion.form
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            onSubmit={(e) => { e.preventDefault(); onSubmit(email) }}
            className="space-y-4"
        >
            <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Email của bạn</label>
                <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 rounded-lg text-zinc-100 outline-none transition-all"
                        placeholder="ban@congty.vn"
                    />
                </div>
            </div>

            <button
                type="submit"
                disabled={isPending || !email}
                className="w-full py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold rounded-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Gửi mã xác thực
            </button>
        </motion.form>
    )
}

// ─── Step 2: OTP ────────────────────────────────────────────────

function StepOtp({ email, isPending, onVerify, onResend, onBack }: {
    email: string
    isPending: boolean
    onVerify: (otp: string) => void
    onResend: () => void
    onBack: () => void
}) {
    const [digits, setDigits] = useState<string[]>(['', '', '', '', '', ''])
    const inputsRef = useRef<(HTMLInputElement | null)[]>([])
    const [resendCooldown, setResendCooldown] = useState(60)

    useEffect(() => {
        if (resendCooldown <= 0) return
        const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
        return () => clearTimeout(t)
    }, [resendCooldown])

    useEffect(() => { inputsRef.current[0]?.focus() }, [])

    const otpComplete = digits.every(d => d !== '')

    function handleChange(i: number, v: string) {
        const digit = v.replace(/\D/g, '').slice(-1)
        const next = [...digits]; next[i] = digit; setDigits(next)
        if (digit && i < 5) inputsRef.current[i + 1]?.focus()
    }
    function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Backspace' && !digits[i] && i > 0) inputsRef.current[i - 1]?.focus()
    }
    function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
        e.preventDefault()
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
        if (pasted.length === 6) { setDigits(pasted.split('')); inputsRef.current[5]?.focus() }
    }

    return (
        <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="space-y-4"
        >
            <p className="text-sm text-zinc-400">
                Mã 6 chữ số đã được gửi đến <strong className="text-zinc-200">{email}</strong>.
            </p>

            <div className="flex justify-center gap-2 my-6" onPaste={handlePaste}>
                {digits.map((d, i) => (
                    <input
                        key={i}
                        ref={(el) => { inputsRef.current[i] = el }}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={1}
                        value={d}
                        onChange={(e) => handleChange(i, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(i, e)}
                        className="w-12 h-14 text-center text-2xl font-bold bg-white/5 border border-white/10 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 rounded-lg text-zinc-100 outline-none transition-all"
                    />
                ))}
            </div>

            <button
                type="button"
                onClick={() => onVerify(digits.join(''))}
                disabled={!otpComplete || isPending}
                className="w-full py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold rounded-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                Xác minh
            </button>

            <div className="flex items-center justify-between text-xs">
                <button
                    type="button"
                    onClick={onBack}
                    className="text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                    ← Đổi email
                </button>
                <button
                    type="button"
                    onClick={() => { onResend(); setResendCooldown(60) }}
                    disabled={resendCooldown > 0 || isPending}
                    className="text-violet-400 hover:text-violet-300 disabled:text-zinc-600 transition-colors flex items-center gap-1"
                >
                    <RefreshCw className="w-3 h-3" />
                    {resendCooldown > 0 ? `Gửi lại (${resendCooldown}s)` : 'Gửi lại mã'}
                </button>
            </div>
        </motion.div>
    )
}
