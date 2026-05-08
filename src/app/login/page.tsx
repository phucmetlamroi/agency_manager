'use client'

import { useActionState } from 'react'
import { loginAction } from '@/actions/auth-actions'
import Link from 'next/link'

export default function LoginPage() {
    const [state, formAction, isPending] = useActionState(loginAction, null)

    return (
        <div style={{
            display: 'flex',
            minHeight: '100vh',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(circle at top right, #2d1b5e, #000)'
        }}>
            <form action={formAction} className="glass-panel" style={{
                padding: '2.5rem',
                width: '100%',
                maxWidth: '420px',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
                    <h1 className="title-gradient" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Đăng nhập</h1>
                    <p style={{ color: '#888' }}>HustlyTasker</p>
                </div>

                {state?.error && (
                    <div style={{
                        padding: '0.75rem',
                        background: 'rgba(255, 61, 0, 0.1)',
                        border: '1px solid var(--error)',
                        color: 'var(--error)',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        textAlign: 'center'
                    }}>
                        {state.error}
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.9rem', color: '#ccc' }}>Email hoặc tên đăng nhập</label>
                    <input
                        name="emailOrUsername"
                        type="text"
                        autoComplete="username"
                        required
                        placeholder="ban@congty.vn"
                        style={{
                            padding: '0.8rem',
                            borderRadius: '8px',
                            border: '1px solid var(--glass-border)',
                            background: 'rgba(0,0,0,0.3)',
                            color: 'white',
                            fontSize: '1rem',
                            outline: 'none'
                        }}
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.9rem', color: '#ccc' }}>Mật khẩu</label>
                    <input
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        required
                        style={{
                            padding: '0.8rem',
                            borderRadius: '8px',
                            border: '1px solid var(--glass-border)',
                            background: 'rgba(0,0,0,0.3)',
                            color: 'white',
                            fontSize: '1rem',
                            outline: 'none'
                        }}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#aaa' }}>
                        <input
                            type="checkbox"
                            name="rememberMe"
                            style={{ accentColor: '#8B5CF6' }}
                        />
                        Ghi nhớ 30 ngày
                    </label>
                    <Link
                        href="/forgot-password"
                        style={{ color: '#A78BFA', textDecoration: 'none' }}
                    >
                        Quên mật khẩu?
                    </Link>
                </div>

                <button
                    type="submit"
                    disabled={isPending}
                    className="btn btn-primary"
                    style={{ marginTop: '0.5rem', width: '100%' }}
                >
                    {isPending ? 'Đang xử lý...' : 'Đăng nhập'}
                </button>

                <p style={{ textAlign: 'center', fontSize: '0.85rem', color: '#888', marginTop: '0.5rem' }}>
                    Chưa có tài khoản?{' '}
                    <Link href="/signup" style={{ color: '#A78BFA', textDecoration: 'none', fontWeight: 600 }}>
                        Đăng ký
                    </Link>
                </p>
            </form>
        </div>
    )
}
