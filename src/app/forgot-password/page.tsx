'use client'

/**
 * Auth Phase 2 — Forgot Password 3-step UI.
 *
 * Step 1: Enter email → request OTP
 * Step 2: Enter 6-digit OTP → verify → receive resetToken
 * Step 3: Enter new password (twice) → reset
 */

import { useState, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, KeyRound, Lock, ArrowLeft, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'

type Step = 'email' | 'otp' | 'password' | 'done'

export default function ForgotPasswordPage() {
    const router = useRouter()
    const [step, setStep] = useState<Step>('email')
    const [email, setEmail] = useState('')
    const [resetToken, setResetToken] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [info, setInfo] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    return (
        <div className="min-h-dvh flex items-center justify-center px-4 py-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]" style={{
            background: 'radial-gradient(circle at top right, #2d1b5e, #000)'
        }}>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="w-full max-w-md p-6 sm:p-8 backdrop-blur-xl bg-zinc-950/60 border border-white/10 rounded-3xl shadow-2xl shadow-black/60"
            >
                <div className="flex items-center gap-3 mb-6">
                    <Link
                        href="/login"
                        className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-zinc-100 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </Link>
                    <h1 className="text-xl font-extrabold text-zinc-100 tracking-tight">Quên mật khẩu</h1>
                </div>

                {/* Step indicator */}
                <div className="flex items-center gap-2 mb-8">
                    {(['email', 'otp', 'password'] as Step[]).map((s, i) => {
                        const isActive = s === step
                        const isDone = ['email', 'otp', 'password'].indexOf(step) > i || step === 'done'
                        return (
                            <div key={s} className="flex-1 flex items-center gap-2">
                                <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${
                                    isDone ? 'bg-emerald-500/20 text-emerald-400' :
                                    isActive ? 'bg-violet-500/30 text-violet-300 ring-2 ring-violet-500/50' :
                                    'bg-zinc-800/50 text-zinc-500'
                                }`}>
                                    {isDone ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                                </div>
                                {i < 2 && (
                                    <div className={`flex-1 h-0.5 ${isDone ? 'bg-emerald-500/30' : 'bg-zinc-800'}`} />
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* Error / info banner */}
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
                            email={email}
                            setEmail={setEmail}
                            isPending={isPending}
                            onSubmit={async (em) => {
                                setError(null); setInfo(null)
                                startTransition(async () => {
                                    try {
                                        const res = await fetch('/api/auth/forgot-password', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ email: em }),
                                        })
                                        const data = await res.json()
                                        if (res.ok) {
                                            setEmail(em)
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
                            email={email}
                            isPending={isPending}
                            onResend={async () => {
                                setError(null); setInfo(null)
                                startTransition(async () => {
                                    try {
                                        const res = await fetch('/api/auth/forgot-password', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ email }),
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
                                        const res = await fetch('/api/auth/verify-otp', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ email, otp }),
                                        })
                                        const data = await res.json()
                                        if (res.ok && data.success) {
                                            setResetToken(data.resetToken)
                                            setStep('password')
                                        } else {
                                            setError(data.message || 'Mã OTP không đúng.')
                                        }
                                    } catch {
                                        setError('Không thể kết nối đến máy chủ.')
                                    }
                                })
                            }}
                            onBack={() => setStep('email')}
                        />
                    )}

                    {step === 'password' && (
                        <StepPassword
                            key="password"
                            isPending={isPending}
                            onSubmit={async (newPassword) => {
                                setError(null); setInfo(null)
                                startTransition(async () => {
                                    try {
                                        const res = await fetch('/api/auth/reset-password', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ resetToken, newPassword }),
                                        })
                                        const data = await res.json()
                                        if (res.ok && data.success) {
                                            setStep('done')
                                            setTimeout(() => router.push('/login'), 2500)
                                        } else {
                                            setError(data.message || 'Đặt lại mật khẩu thất bại.')
                                        }
                                    } catch {
                                        setError('Không thể kết nối đến máy chủ.')
                                    }
                                })
                            }}
                        />
                    )}

                    {step === 'done' && (
                        <motion.div
                            key="done"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-center py-8"
                        >
                            <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
                            <h2 className="text-xl font-bold text-zinc-100 mb-2">Đã cập nhật!</h2>
                            <p className="text-sm text-zinc-400 mb-1">Mật khẩu của bạn đã được thay đổi thành công.</p>
                            <p className="text-xs text-zinc-500">Đang chuyển đến trang đăng nhập...</p>
                        </motion.div>
                    )}
                </AnimatePresence>
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
            <p className="text-sm text-zinc-400 mb-4">
                Nhập email tài khoản. Chúng tôi sẽ gửi mã OTP 6 chữ số tới hộp thư của bạn.
            </p>

            <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Email</label>
                <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        autoCapitalize="none"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full h-12 pl-10 pr-4 bg-white/5 border border-white/10 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 rounded-xl text-zinc-100 outline-none transition-all"
                        placeholder="ban@congty.vn"
                    />
                </div>
            </div>

            <button
                type="submit"
                disabled={isPending || !email}
                className="w-full h-12 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold rounded-xl shadow-lg shadow-violet-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
            >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Gửi mã OTP
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

    // Countdown for resend button
    useEffect(() => {
        if (resendCooldown <= 0) return
        const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
        return () => clearTimeout(t)
    }, [resendCooldown])

    // Focus first input on mount
    useEffect(() => {
        inputsRef.current[0]?.focus()
    }, [])

    const otpComplete = digits.every(d => d !== '')

    function handleChange(i: number, v: string) {
        // Only digits
        const digit = v.replace(/\D/g, '').slice(-1)
        const next = [...digits]
        next[i] = digit
        setDigits(next)
        if (digit && i < 5) {
            inputsRef.current[i + 1]?.focus()
        }
    }

    function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Backspace' && !digits[i] && i > 0) {
            inputsRef.current[i - 1]?.focus()
        } else if (e.key === 'ArrowLeft' && i > 0) {
            inputsRef.current[i - 1]?.focus()
        } else if (e.key === 'ArrowRight' && i < 5) {
            inputsRef.current[i + 1]?.focus()
        }
    }

    function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
        e.preventDefault()
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
        if (pasted.length === 6) {
            setDigits(pasted.split(''))
            inputsRef.current[5]?.focus()
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="space-y-4"
        >
            <p className="text-sm text-zinc-400 mb-2">
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
                className="w-full h-12 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold rounded-xl shadow-lg shadow-violet-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
            >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                Xác minh mã
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

// ─── Step 3: New password ───────────────────────────────────────

function StepPassword({ isPending, onSubmit }: {
    isPending: boolean
    onSubmit: (newPassword: string) => void
}) {
    const [pwd1, setPwd1] = useState('')
    const [pwd2, setPwd2] = useState('')
    const [showPwd, setShowPwd] = useState(false)

    const lengthOk = pwd1.length >= 12
    const matchOk = pwd1 && pwd1 === pwd2
    const canSubmit = lengthOk && matchOk

    return (
        <motion.form
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            onSubmit={(e) => { e.preventDefault(); if (canSubmit) onSubmit(pwd1) }}
            className="space-y-4"
        >
            <p className="text-sm text-zinc-400 mb-2">
                Đặt mật khẩu mới (tối thiểu 12 ký tự, không cần ký tự đặc biệt).
            </p>

            <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Mật khẩu mới</label>
                <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                        type={showPwd ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        value={pwd1}
                        onChange={(e) => setPwd1(e.target.value)}
                        className="w-full h-12 pl-10 pr-12 bg-white/5 border border-white/10 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 rounded-xl text-zinc-100 outline-none transition-all"
                    />
                    <button
                        type="button"
                        onClick={() => setShowPwd(s => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-200"
                    >
                        {showPwd ? 'Ẩn' : 'Hiện'}
                    </button>
                </div>
                <p className={`text-xs mt-1 ${lengthOk ? 'text-emerald-400' : 'text-zinc-500'}`}>
                    {lengthOk ? '✓' : '○'} Tối thiểu 12 ký tự
                </p>
            </div>

            <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Xác nhận mật khẩu</label>
                <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                        type={showPwd ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        value={pwd2}
                        onChange={(e) => setPwd2(e.target.value)}
                        className="w-full h-12 pl-10 pr-4 bg-white/5 border border-white/10 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 rounded-xl text-zinc-100 outline-none transition-all"
                    />
                </div>
                {pwd2 && (
                    <p className={`text-xs mt-1 ${matchOk ? 'text-emerald-400' : 'text-red-400'}`}>
                        {matchOk ? '✓ Mật khẩu trùng khớp' : '✗ Mật khẩu chưa khớp'}
                    </p>
                )}
            </div>

            <button
                type="submit"
                disabled={!canSubmit || isPending}
                className="w-full h-12 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold rounded-xl shadow-lg shadow-violet-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
            >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Cập nhật mật khẩu
            </button>
        </motion.form>
    )
}
