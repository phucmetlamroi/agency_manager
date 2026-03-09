'use client'

import { useActionState } from 'react'
import { loginAction } from '@/actions/auth-actions'

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
                maxWidth: '400px',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
                    <h1 className="title-gradient" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Sign In</h1>
                    <p style={{ color: '#888' }}>Internal Management System</p>
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
                    <label style={{ fontSize: '0.9rem', color: '#ccc' }}>Username</label>
                    <input
                        name="username"
                        type="text"
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

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.9rem', color: '#ccc' }}>Password</label>
                    <input
                        name="password"
                        type="password"
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

                <button
                    type="submit"
                    disabled={isPending}
                    className="btn btn-primary"
                    style={{ marginTop: '1rem', width: '100%' }}
                >
                    {isPending ? 'Processing...' : 'Sign In'}
                </button>
            </form>
        </div>
    )
}
