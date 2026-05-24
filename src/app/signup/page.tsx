'use client'

/**
 * Auth Phase 3 — Public signup page.
 *
 * Form fields:
 *   - displayName (Unicode tiếng Việt OK)
 *   - email
 *   - password (≥12 chars, HIBP-checked server-side)
 *   - acceptTos (required, không pre-tick)
 *   - honeypot (hidden, CSS, tabindex=-1)
 *   - [BotID migration] turnstileToken bỏ — Vercel BotID passive, no widget.
 */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, User, Lock, CheckCircle2, Loader2, ArrowLeft, AtSign } from 'lucide-react'
import PasswordStrengthMeter from '@/components/auth/PasswordStrengthMeter'
import { UsernameInput } from '@/components/auth/UsernameInput'

export default function SignupPage() {
    const router = useRouter()
    const [displayName, setDisplayName] = useState('')
    const [username, setUsername] = useState('')
    /** [Username Handle] tracks if username passes BOTH format + uniqueness check */
    const [usernameValid, setUsernameValid] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [acceptTos, setAcceptTos] = useState(false)
    const [honeypot, setHoneypot] = useState('')   // hidden field
    const [showPwd, setShowPwd] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
    const [isPending, startTransition] = useTransition()
    const [done, setDone] = useState(false)

    // [BotID migration] Bỏ Turnstile widget + 6s fallback timer. Vercel BotID
    // chạy passive trong background (initBotId trong instrumentation-client.ts),
    // không cần token state ở client.

    const lengthOk = password.length >= 12
    const canSubmit =
        displayName.trim().length >= 2 &&
        usernameValid &&
        email &&
        lengthOk &&
        acceptTos &&
        !isPending

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setFieldErrors({})

        startTransition(async () => {
            try {
                const res = await fetch('/api/auth/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email, password, displayName, username, acceptTos, honeypot,
                    }),
                })
                const data = await res.json()
                if (res.ok && data.success) {
                    setDone(true)
                } else if (data.errors) {
                    setFieldErrors(data.errors)
                } else {
                    setError(data.message || 'Đã xảy ra lỗi.')
                }
            } catch {
                setError('Không thể kết nối đến máy chủ.')
            }
        })
    }

    if (done) {
        return (
            <div className="min-h-dvh flex items-center justify-center px-4 py-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]" style={{
                background: 'radial-gradient(circle at top right, #2d1b5e, #000)'
            }}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full max-w-md p-6 sm:p-8 backdrop-blur-xl bg-zinc-950/60 border border-white/10 rounded-3xl shadow-2xl shadow-black/60 text-center"
                >
                    <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-zinc-100 mb-2">Kiểm tra email!</h1>
                    <p className="text-sm text-zinc-400 mb-6">
                        Nếu email <strong className="text-zinc-200">{email}</strong> hợp lệ, chúng tôi đã gửi link xác thực. Vui lòng kiểm tra hộp thư trong 5 phút tới (kể cả thư mục Spam).
                    </p>
                    <Link
                        href="/login"
                        className="inline-block px-6 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm transition-colors"
                    >
                        Quay lại đăng nhập
                    </Link>
                </motion.div>
            </div>
        )
    }

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
                    <div>
                        <h1 className="text-2xl font-extrabold text-zinc-100 tracking-tight">Tạo tài khoản</h1>
                        <p className="text-xs text-zinc-500">Hustly<span className="text-violet-400 font-semibold">Tasker</span> · Miễn phí, đầy đủ tính năng</p>
                    </div>
                </div>

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
                </AnimatePresence>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* DisplayName */}
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Tên hiển thị</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                            <input
                                type="text"
                                autoComplete="name"
                                required
                                minLength={2}
                                maxLength={60}
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="Nguyễn Văn An"
                                className="w-full h-12 pl-10 pr-4 bg-white/5 border border-white/10 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 rounded-xl text-zinc-100 outline-none transition-all"
                            />
                        </div>
                        {fieldErrors.displayName && <p className="text-xs text-red-400 mt-1">{fieldErrors.displayName}</p>}
                    </div>

                    {/* [Username Handle] Username (handle) */}
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                            Username <span className="text-zinc-600">· @handle dùng để mời / login</span>
                        </label>
                        <div className="relative">
                            <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 z-10 pointer-events-none" />
                            <div className="pl-7">
                                <UsernameInput
                                    value={username}
                                    onChange={(v, valid) => {
                                        setUsername(v)
                                        setUsernameValid(valid)
                                    }}
                                />
                            </div>
                        </div>
                        {fieldErrors.username && <p className="text-xs text-red-400 mt-1">{fieldErrors.username}</p>}
                    </div>

                    {/* Email */}
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
                                placeholder="ban@congty.vn"
                                className="w-full h-12 pl-10 pr-4 bg-white/5 border border-white/10 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 rounded-xl text-zinc-100 outline-none transition-all"
                            />
                        </div>
                        {fieldErrors.email && <p className="text-xs text-red-400 mt-1">{fieldErrors.email}</p>}
                    </div>

                    {/* Password */}
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Mật khẩu (≥ 12 ký tự)</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                            <input
                                type={showPwd ? 'text' : 'password'}
                                autoComplete="new-password"
                                required
                                minLength={12}
                                maxLength={128}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full h-12 pl-10 pr-14 bg-white/5 border border-white/10 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 rounded-xl text-zinc-100 outline-none transition-all"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPwd(s => !s)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-200"
                            >
                                {showPwd ? 'Ẩn' : 'Hiện'}
                            </button>
                        </div>
                        <PasswordStrengthMeter password={password} />
                        {fieldErrors.password && <p className="text-xs text-red-400 mt-1">{fieldErrors.password}</p>}
                    </div>

                    {/* Honeypot — hidden from real users */}
                    <input
                        type="text"
                        name="website"
                        value={honeypot}
                        onChange={(e) => setHoneypot(e.target.value)}
                        tabIndex={-1}
                        autoComplete="off"
                        aria-hidden="true"
                        style={{
                            position: 'absolute',
                            left: '-9999px',
                            opacity: 0,
                            pointerEvents: 'none',
                            height: 0,
                            width: 0,
                        }}
                    />

                    {/* ToS */}
                    <label className="flex items-start gap-2 cursor-pointer text-xs text-zinc-300 leading-relaxed">
                        <input
                            type="checkbox"
                            required
                            checked={acceptTos}
                            onChange={(e) => setAcceptTos(e.target.checked)}
                            className="mt-0.5 accent-violet-500"
                        />
                        <span>
                            Tôi đồng ý với{' '}
                            <Link href="/legal/terms" className="text-violet-400 hover:text-violet-300 underline">
                                Điều khoản dịch vụ
                            </Link>
                            {' '}và{' '}
                            <Link href="/legal/privacy" className="text-violet-400 hover:text-violet-300 underline">
                                Chính sách bảo mật
                            </Link>
                        </span>
                    </label>
                    {fieldErrors.tos && <p className="text-xs text-red-400">{fieldErrors.tos}</p>}

                    {/* Bot detection error (server returns errors.turnstile khi BotID flag bot) */}
                    {fieldErrors.turnstile && <p className="text-xs text-red-400">{fieldErrors.turnstile}</p>}

                    {/* Submit + diagnostics khi disabled */}
                    <button
                        type="submit"
                        disabled={!canSubmit}
                        className="w-full h-12 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold rounded-xl shadow-lg shadow-violet-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Đăng ký
                    </button>

                    {/* Diagnostic: hiển thị lý do disabled khi user đã fill các field cơ bản */}
                    {!canSubmit && !isPending && displayName && email && (
                        <div className="text-xs text-zinc-500 text-center space-y-0.5">
                            {!lengthOk && (
                                <p>⚠️ Mật khẩu cần ≥12 ký tự (hiện: {password.length})</p>
                            )}
                            {!acceptTos && (
                                <p>⚠️ Vui lòng tick đồng ý điều khoản</p>
                            )}
                        </div>
                    )}

                    <p className="text-center text-xs text-zinc-500 mt-2">
                        Đã có tài khoản?{' '}
                        <Link href="/login" className="text-violet-400 hover:text-violet-300">
                            Đăng nhập
                        </Link>
                    </p>
                </form>
            </motion.div>
        </div>
    )
}
