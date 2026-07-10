// [review-fixes P4/FR-11] Guest email-updates control for the /r/{slug} header. Self-contained:
// fetches its own subscription status and drives the double-opt-in (email → 6-digit PIN → subscribed).
// Turning updates OFF is via the unsubscribe link in every email (token-based) — not exposed here.
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, BellRing, Loader2, X } from 'lucide-react'

interface Props {
    slug: string
    assetId: string
    compact?: boolean
}

type Step = 'form' | 'pin'

async function readErr(res: Response): Promise<string> {
    try {
        const b = (await res.json()) as { error?: { message?: string } }
        return b?.error?.message ?? 'Something went wrong. Please try again.'
    } catch {
        return 'Something went wrong. Please try again.'
    }
}

export function GuestNotifyControl({ slug, assetId, compact = false }: Props) {
    const [subscribed, setSubscribed] = useState<boolean | null>(null)
    const [open, setOpen] = useState(false)
    const [step, setStep] = useState<Step>('form')
    const [email, setEmail] = useState('')
    const [pin, setPin] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [info, setInfo] = useState<string | null>(null)
    // [Bug#5] The popover was rendered INSIDE the /r/ header, whose `backdrop-blur` creates a
    // stacking context — so its z-30/z-40 were local and the opaque panel parked ON TOP of the
    // update-log/comments surface with no reliable outside-click dismiss. We portal it to
    // <body> and position it `fixed` (anchored to the bell) at app-level z, ABOVE the log but
    // BELOW the decision/identity modals (z-[95]/z-[96]).
    const triggerRef = useRef<HTMLButtonElement>(null)
    const [mounted, setMounted] = useState(false)
    const [pos, setPos] = useState<{ top: number; right: number }>({ top: 56, right: 12 })
    useEffect(() => setMounted(true), [])

    const base = `/api/r/${encodeURIComponent(slug)}/notifications`

    const togglePanel = useCallback(() => {
        if (open) {
            setOpen(false)
            return
        }
        const r = triggerRef.current?.getBoundingClientRect()
        if (r) setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) })
        setOpen(true)
    }, [open])

    const loadStatus = useCallback(async (): Promise<boolean> => {
        try {
            const res = await fetch(`${base}?assetId=${encodeURIComponent(assetId)}`, { credentials: 'same-origin', cache: 'no-store' })
            if (!res.ok) return false
            const d = (await res.json()) as { subscribed: boolean; email: string | null }
            setSubscribed(d.subscribed)
            if (d.email) setEmail((e) => e || d.email!)
            return d.subscribed
        } catch {
            return false
        }
    }, [base, assetId])

    useEffect(() => {
        setSubscribed(null)
        setOpen(false)
        setStep('form')
        setPin('')
        setError(null)
        setInfo(null)
        void loadStatus()
    }, [loadStatus])

    const sendCode = useCallback(async () => {
        if (busy) return
        setBusy(true)
        setError(null)
        setInfo(null)
        try {
            await fetch(`${base}/request-pin`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assetId, ...(email.trim() ? { email: email.trim() } : {}) }),
            })
            // request-pin is intentionally neutral (no status oracle). If this was the guest's OWN
            // already-verified email, the server subscribed them straight away — the session-gated
            // status endpoint is the only trustworthy signal, so re-check it before showing the PIN.
            const nowSubscribed = await loadStatus()
            if (nowSubscribed) {
                setOpen(false)
            } else {
                setInfo(`If that email can receive updates, we've sent it a 6-digit code.`)
                setStep('pin')
            }
        } catch {
            setError('Could not send the code. Please try again.')
        } finally {
            setBusy(false)
        }
    }, [busy, base, assetId, email, loadStatus])

    const verify = useCallback(async () => {
        if (busy) return
        setBusy(true)
        setError(null)
        try {
            const res = await fetch(`${base}/verify-pin`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assetId, pin: pin.trim(), ...(email.trim() ? { email: email.trim() } : {}) }),
            })
            if (res.ok) {
                setSubscribed(true)
                setOpen(false)
            } else {
                setError(await readErr(res))
            }
        } catch {
            setError('Could not verify the code. Please try again.')
        } finally {
            setBusy(false)
        }
    }, [busy, base, assetId, pin, email])

    // Subscribed: a calm "on" indicator (unsubscribe is via the email link).
    if (subscribed) {
        return (
            <span
                title="Email updates are on. Use the unsubscribe link in any email to turn them off."
                aria-label="Email updates are on"
                className={
                    compact
                        ? 'grid h-8 w-8 place-items-center rounded-md border border-emerald-400/25 bg-emerald-500/10 text-emerald-300'
                        : 'flex h-9 items-center gap-1.5 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 text-sm font-medium text-emerald-300'
                }
            >
                <BellRing className="h-4 w-4" />
                <span className={compact ? 'sr-only' : 'hidden sm:inline'}>Updates on</span>
            </span>
        )
    }

    return (
        <div className="relative">
            <button
                ref={triggerRef}
                onClick={togglePanel}
                className={
                    compact
                        ? 'grid h-8 w-8 place-items-center rounded-md text-white/70 transition hover:bg-white/[0.08] hover:text-white'
                        : 'flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-sm text-white/80 hover:bg-white/10'
                }
                title="Get email updates for this review"
                aria-label="Get email updates for this review"
            >
                <Bell className="h-4 w-4" />
                <span className={compact ? 'sr-only' : 'hidden sm:inline'}>Get updates</span>
            </button>
            {open && mounted && createPortal(
                <>
                    <div className="fixed inset-0 z-[85]" onClick={() => setOpen(false)} />
                    <div
                        className="fixed z-[86] w-72 rounded-xl border border-white/10 bg-zinc-900/95 p-3 shadow-2xl backdrop-blur"
                        style={{ top: pos.top, right: pos.right }}
                    >
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm font-semibold text-white/90">Email updates</span>
                            <button onClick={() => setOpen(false)} className="grid h-6 w-6 place-items-center rounded text-white/50 hover:bg-white/10">
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {step === 'form' ? (
                            <>
                                <p className="mb-2 text-xs text-white/50">Get an email when a new version is ready. We&apos;ll send a 6-digit code to confirm.</p>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    className="mb-2 w-full rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-violet-400/50"
                                    onKeyDown={(e) => e.key === 'Enter' && email.trim() && sendCode()}
                                />
                                <button
                                    onClick={sendCode}
                                    disabled={busy || !email.trim()}
                                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-500 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-50"
                                >
                                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                    Send code
                                </button>
                            </>
                        ) : (
                            <>
                                {info && <p className="mb-2 text-xs text-white/60">{info}</p>}
                                <input
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="000000"
                                    className="mb-2 w-full rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-center text-lg font-semibold tracking-[0.4em] text-white placeholder-white/25 outline-none focus:border-indigo-400/50"
                                    onKeyDown={(e) => e.key === 'Enter' && pin.length === 6 && verify()}
                                />
                                <button
                                    onClick={verify}
                                    disabled={busy || pin.length !== 6}
                                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-50"
                                >
                                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                    Confirm
                                </button>
                                <button onClick={() => { setStep('form'); setError(null) }} className="mt-1.5 w-full text-center text-xs text-white/40 hover:text-white/70">
                                    Use a different email
                                </button>
                            </>
                        )}
                        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
                    </div>
                </>,
                document.body,
            )}
        </div>
    )
}
