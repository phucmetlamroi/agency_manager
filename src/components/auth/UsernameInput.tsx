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

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, X, Circle, Loader2 } from 'lucide-react'
import { validateUsername } from '@/lib/username-validation'
import { checkUsernameAvailable } from '@/actions/username-actions'

interface Props {
    value: string
    onChange: (newValue: string, isValid: boolean) => void
    /** Pre-existing username for current user (for "no change" case in migration/settings) */
    skipUniquenessCheckFor?: string
    placeholder?: string
    autoFocus?: boolean
    /** [M14] Optional leading glyph rendered INSIDE the input frame (vd @ ở signup — hết lệch lề f_0023). */
    leadingIcon?: ReactNode
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
    leadingIcon,
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
    const typed = value.length > 0

    return (
        <div className="flex flex-col gap-2">
            {/* Input field with status icon */}
            <div className="relative">
                {leadingIcon && (
                    <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground">
                        {leadingIcon}
                    </span>
                )}
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value, false)}
                    placeholder={placeholder}
                    autoFocus={autoFocus}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className={`h-12 w-full rounded-xl bg-white/[0.04] border border-white/10 text-body text-zinc-100 placeholder:text-muted-foreground outline-none transition-colors focus:border-primary/60 focus:bg-white/[0.06] pr-10 ${leadingIcon ? 'pl-9' : 'px-4'}`}
                />
                {/* Status icon */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {availability.status === 'checking' && (
                        <Loader2 size={16} className="animate-spin text-muted-foreground" />
                    )}
                    {availability.status === 'available' && (
                        <Check size={16} className="text-success" />
                    )}
                    {(availability.status === 'taken' || availability.status === 'error') && (
                        <X size={16} className="text-destructive" />
                    )}
                </div>
            </div>

            {/* [M14/FR-F2.2] Rule checklist — 1 CỘT, text-body-sm (14px), 3 trạng thái. Đạt hết định dạng →
                collapse 1 dòng. Chưa đạt KHÔNG dùng dấu × (gây nhầm f_0024) — dùng chấm trung tính. */}
            {formatValid ? (
                <p className="flex items-center gap-2 text-body-sm text-success">
                    <Check size={16} /> Định dạng hợp lệ
                </p>
            ) : (
                <div className="flex flex-col gap-1">
                    <RuleRow ok={checks.length} typed={typed} label="3–30 ký tự" />
                    <RuleRow ok={checks.letter} typed={typed} label="Có chữ cái (a–Z)" />
                    <RuleRow ok={checks.digit} typed={typed} label="Có số (0–9)" />
                    <RuleRow ok={checks.special} typed={typed} label="Có _ . hoặc -" />
                </div>
            )}
            {!checks.onlyAllowed && typed && (
                <p className="text-body-sm text-destructive">
                    ⚠️ Username chỉ dùng chữ ASCII (a–Z), số, và _ . - (không dấu, không khoảng trắng)
                </p>
            )}

            {/* Uniqueness feedback */}
            {availability.status === 'available' && (
                <p className="flex items-center gap-1.5 text-body-sm text-success">
                    <Check size={14} /> Username có thể sử dụng
                </p>
            )}
            {(availability.status === 'taken' || availability.status === 'error') && (
                <p className="flex items-center gap-1.5 text-body-sm text-destructive">
                    <X size={14} /> {availability.message}
                </p>
            )}
        </div>
    )
}

// [M14/FR-F2.2] 3 trạng thái: chưa gõ = chấm trung tính (zinc-500); đạt = Check (success);
// đã gõ nhưng chưa đạt = chấm mờ (zinc-400) — TUYỆT ĐỐI không dùng dấu × ở checklist.
function RuleRow({ ok, typed, label }: { ok: boolean; typed: boolean; label: string }) {
    const state = !typed ? 'idle' : ok ? 'ok' : 'unmet'
    return (
        <div
            className={`flex items-center gap-2 text-body-sm ${
                state === 'ok' ? 'text-success' : state === 'unmet' ? 'text-zinc-400' : 'text-zinc-500'
            }`}
        >
            {state === 'ok' ? <Check size={16} /> : <Circle size={8} className="shrink-0" />}
            <span>{label}</span>
        </div>
    )
}
