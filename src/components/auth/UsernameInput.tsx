'use client'

/**
 * [Username Handle] Reusable username input with inline validation + uniqueness check.
 *
 * Used in:
 *   - Signup form (src/app/signup/page.tsx)
 *   - UsernameMigrationModal (forced migration for legacy users)
 *   - Settings page (future: post-signup username change)
 *
 * UX:
 *   - 4 inline ✓/✗ checks (length, letter, digit, special) — update live as user types
 *   - Debounced (300ms) uniqueness check via /api → "Available" or "Taken"
 *   - parent receives onChange(username, isValid) so it can enable/disable submit
 */

import { useEffect, useRef, useState } from 'react'
import { Check, X, Loader2 } from 'lucide-react'
import { validateUsername } from '@/lib/username-validation'
import { checkUsernameAvailable } from '@/actions/username-actions'

interface Props {
    value: string
    onChange: (newValue: string, isValid: boolean) => void
    /** Pre-existing username for current user (for "no change" case in migration/settings) */
    skipUniquenessCheckFor?: string
    placeholder?: string
    autoFocus?: boolean
}

type AvailabilityState =
    | { status: 'idle' }
    | { status: 'checking' }
    | { status: 'available' }
    | { status: 'taken'; message: string }
    | { status: 'error'; message: string }

export function UsernameInput({
    value,
    onChange,
    skipUniquenessCheckFor,
    placeholder = 'vd: bao_phuc.7',
    autoFocus,
}: Props) {
    const [availability, setAvailability] = useState<AvailabilityState>({ status: 'idle' })
    const debounceRef = useRef<NodeJS.Timeout | null>(null)

    const validation = validateUsername(value)
    const formatValid = validation.valid

    /* ── Debounced uniqueness check ─────────────────────────────────── */
    useEffect(() => {
        // Reset state immediately if format invalid
        if (!formatValid) {
            setAvailability({ status: 'idle' })
            onChange(value, false)
            return
        }

        // Skip uniqueness check if this is the user's existing username
        if (skipUniquenessCheckFor && value === skipUniquenessCheckFor) {
            setAvailability({ status: 'available' })
            onChange(value, true)
            return
        }

        // Debounce 300ms
        if (debounceRef.current) clearTimeout(debounceRef.current)
        setAvailability({ status: 'checking' })

        debounceRef.current = setTimeout(async () => {
            try {
                const res = await checkUsernameAvailable(value)
                if (res.available) {
                    setAvailability({ status: 'available' })
                    onChange(value, true)
                } else {
                    setAvailability({
                        status: res.reason === 'taken' ? 'taken' : 'error',
                        message: res.error ?? 'Không hợp lệ',
                    })
                    onChange(value, false)
                }
            } catch {
                setAvailability({ status: 'error', message: 'Lỗi kiểm tra' })
                onChange(value, false)
            }
        }, 300)

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, formatValid, skipUniquenessCheckFor])

    const checks = validation.checks

    return (
        <div className="flex flex-col gap-2">
            {/* Input field with status icon */}
            <div className="relative">
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value, false)}
                    placeholder={placeholder}
                    autoFocus={autoFocus}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className="w-full h-11 px-4 pr-10 rounded-xl bg-white/[0.04] border border-[rgba(139,92,246,0.20)] text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors focus:border-[#8B5CF6]/60 focus:bg-white/[0.06]"
                />
                {/* Status icon */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {availability.status === 'checking' && (
                        <Loader2 size={16} className="animate-spin text-zinc-500" />
                    )}
                    {availability.status === 'available' && (
                        <Check size={16} className="text-emerald-400" />
                    )}
                    {(availability.status === 'taken' || availability.status === 'error') && (
                        <X size={16} className="text-red-400" />
                    )}
                </div>
            </div>

            {/* Inline rule checks (4 ✓/✗ bullets) */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <RuleRow ok={checks.length} label="3-30 ký tự" />
                <RuleRow ok={checks.letter} label="Có chữ cái (a-Z)" />
                <RuleRow ok={checks.digit} label="Có số (0-9)" />
                <RuleRow ok={checks.special} label="Có _ . hoặc -" />
            </div>
            {!checks.onlyAllowed && value.length > 0 && (
                <p className="text-[11px] text-red-400">
                    ⚠️ Username chỉ được dùng chữ ASCII (a-Z), số, và _ . - (không dấu, không khoảng trắng)
                </p>
            )}

            {/* Uniqueness feedback */}
            {availability.status === 'available' && (
                <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                    <Check size={11} /> Username có thể sử dụng
                </p>
            )}
            {(availability.status === 'taken' || availability.status === 'error') && (
                <p className="text-[11px] text-red-400 flex items-center gap-1">
                    <X size={11} /> {availability.message}
                </p>
            )}
        </div>
    )
}

function RuleRow({ ok, label }: { ok: boolean; label: string }) {
    return (
        <div className={`flex items-center gap-1.5 ${ok ? 'text-emerald-400' : 'text-zinc-500'}`}>
            {ok ? <Check size={11} /> : <X size={11} className="opacity-50" />}
            <span>{label}</span>
        </div>
    )
}
