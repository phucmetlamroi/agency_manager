'use client'

import { useActionState, useState, useEffect } from 'react'
import { loginAction } from '@/actions/auth-actions'
import Link from 'next/link'
import { Eye, EyeOff, Lock, Mail, Loader2 } from 'lucide-react'
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton'

export default function LoginPage() {
    const [state, formAction, isPending] = useActionState(loginAction, null)
    const [showPassword, setShowPassword] = useState(false)
    const [urlError, setUrlError] = useState<string | null>(null)

    // Surface Google sign-in errors passed back as ?error= (read from
    // window.location to avoid a useSearchParams Suspense requirement).
    useEffect(() => {
        const err = new URLSearchParams(window.location.search).get('error')
        if (err === 'google') setUrlError('Đăng nhập bằng Google thất bại. Vui lòng thử lại.')
        else if (err === 'google_unverified') setUrlError('Email Google của bạn chưa được xác minh.')
    }, [])

    return (
        <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-[#1a0e3d] via-[#0a0014] to-black px-4 py-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
            {/* Background glow */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-gradient-radial from-violet-600/20 to-transparent blur-3xl" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] bg-gradient-radial from-indigo-600/15 to-transparent blur-3xl" />
            </div>

            <form
                action={formAction}
                className="relative w-full max-w-[440px] bg-zinc-950/60 backdrop-blur-xl border border-white/8 rounded-3xl shadow-2xl shadow-black/60 p-6 sm:p-8 flex flex-col gap-5"
            >
                {/* Header */}
                <div className="text-center mb-2">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-violet-600/30">
                        <span className="text-white font-black text-2xl">H</span>
                    </div>
                    <h1 className="text-3xl font-extrabold text-white tracking-tight">Đăng nhập</h1>
                    <p className="text-zinc-400 text-sm mt-1">Hustly<span className="text-violet-400 font-semibold">Tasker</span></p>
                </div>

                {/* Error */}
                {(state?.error || urlError) && (
                    <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm text-center">
                        {state?.error || urlError}
                    </div>
                )}

                {/* Google sign-in */}
                <GoogleSignInButton />

                {/* Divider */}
                <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-xs text-zinc-500 font-medium">hoặc</span>
                    <div className="flex-1 h-px bg-white/10" />
                </div>

                {/* Email field */}
                <div className="flex flex-col gap-2">
                    <label className="text-sm text-zinc-300 font-medium">Email hoặc tên đăng nhập</label>
                    <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                        <input
                            name="emailOrUsername"
                            type="text"
                            autoComplete="username"
                            inputMode="email"
                            autoCapitalize="none"
                            required
                            placeholder="ban@congty.vn"
                            className="w-full h-12 pl-11 pr-4 rounded-xl bg-zinc-900/60 border border-white/10 text-white placeholder:text-zinc-600 focus:border-violet-500/50 focus:bg-zinc-900/80 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-all"
                        />
                    </div>
                </div>

                {/* Password field */}
                <div className="flex flex-col gap-2">
                    <label className="text-sm text-zinc-300 font-medium">Mật khẩu</label>
                    <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                        <input
                            name="password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            required
                            placeholder="••••••••"
                            className="w-full h-12 pl-11 pr-12 rounded-xl bg-zinc-900/60 border border-white/10 text-white placeholder:text-zinc-600 focus:border-violet-500/50 focus:bg-zinc-900/80 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-all"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
                            tabIndex={-1}
                            aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                        >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {/* Remember + Forgot */}
                <div className="flex items-center justify-between text-sm">
                    <label className="flex items-center gap-2 cursor-pointer text-zinc-400 hover:text-zinc-300 transition-colors select-none">
                        <input
                            type="checkbox"
                            name="rememberMe"
                            className="w-4 h-4 rounded accent-violet-500"
                        />
                        Ghi nhớ 30 ngày
                    </label>
                    <Link
                        href="/forgot-password"
                        className="text-violet-400 hover:text-violet-300 font-medium transition-colors"
                    >
                        Quên mật khẩu?
                    </Link>
                </div>

                {/* Submit */}
                <button
                    type="submit"
                    disabled={isPending}
                    className="w-full h-12 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold shadow-lg shadow-violet-600/30 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {isPending ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Đang xử lý…
                        </>
                    ) : (
                        'Đăng nhập'
                    )}
                </button>

                <p className="text-center text-sm text-zinc-500 mt-1">
                    Chưa có tài khoản?{' '}
                    <Link href="/signup" className="text-violet-400 hover:text-violet-300 font-semibold transition-colors">
                        Đăng ký
                    </Link>
                </p>
            </form>
        </div>
    )
}
