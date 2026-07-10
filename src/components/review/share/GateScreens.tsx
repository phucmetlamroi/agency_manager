// [Review module P5.3] Full-page gate states for /r/{slug} (UI-UX §6.4) —
// password form, expired, unavailable (covers 404 + revoked + deleted content,
// same copy on purpose: no enumeration oracle).

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock3, Loader2, Lock } from 'lucide-react'
import { guestShareApi } from '@/lib/review/share-client'

export function GateScreen({ kind }: { kind: 'unavailable' | 'expired' }) {
    return (
        <Wrap>
            {kind === 'expired' ? (
                <>
                    <Clock3 className="mx-auto h-9 w-9 text-white/30" />
                    <h1 className="mt-3 text-lg font-semibold text-white">This link has expired</h1>
                    <p className="mt-1.5 text-sm text-white/50">Please contact the person who sent it to you.</p>
                </>
            ) : (
                <h1 className="text-lg font-semibold text-white">This link is no longer available.</h1>
            )}
        </Wrap>
    )
}

export function PasswordGate({ slug }: { slug: string }) {
    const router = useRouter()
    const [password, setPassword] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const submit = async () => {
        if (!password || busy) return
        setBusy(true)
        setError(null)
        try {
            await guestShareApi(slug).unlock(password)
            router.refresh() // cookie set → RSC re-resolves past the gate
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Incorrect password. Please try again.')
            setBusy(false)
        }
    }

    return (
        <Wrap>
            <Lock className="mx-auto h-9 w-9 text-white/30" />
            <h1 className="mt-3 text-lg font-semibold text-white">This link is password protected</h1>
            <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void submit()}
                placeholder="Password"
                autoFocus
                className="mt-4 w-full rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-primary/50 focus:outline-none"
            />
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
            <button
                onClick={() => void submit()}
                disabled={!password || busy}
                className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary disabled:opacity-50"
            >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Continue
            </button>
        </Wrap>
    )
}

function Wrap({ children }: { children: React.ReactNode }) {
    return (
        <div className="grid min-h-[100dvh] place-items-center bg-zinc-950 px-4">
            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900/60 p-7 text-center shadow-2xl">
                {children}
                <p className="mt-6 text-[11px] text-white/25">Sent via HustlyTasker</p>
            </div>
        </div>
    )
}
