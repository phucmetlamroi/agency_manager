'use client'

/**
 * Auth Phase 3 — Password strength meter (5 bars).
 *
 * Algorithm: heuristic scoring (no zxcvbn dep needed cho v1):
 *   - 0 bars: empty
 *   - 1: <8 chars
 *   - 2: 8-11 chars (under min)
 *   - 3: 12+ chars but only single charset (vd all letters)
 *   - 4: 12+ chars + 2 charsets (vd letters + digits)
 *   - 5: 12+ chars + 3+ charsets (vd letters + digits + symbols)
 *
 * Note: KHÔNG ép user phải dùng symbols (NIST 800-63B-4 cấm composition rules).
 * Đây chỉ là feedback visual; signup vẫn pass với password 12 chars cùng charset.
 */

interface Props {
    password: string
}

function score(password: string): number {
    if (!password) return 0
    if (password.length < 8) return 1
    if (password.length < 12) return 2

    let charsets = 0
    if (/[a-z]/.test(password)) charsets++
    if (/[A-Z]/.test(password)) charsets++
    if (/\d/.test(password)) charsets++
    if (/[^a-zA-Z0-9]/.test(password)) charsets++

    if (charsets <= 1) return 3
    if (charsets === 2) return 4
    return 5
}

const COLORS = ['#3f3f46', '#dc2626', '#f97316', '#eab308', '#22c55e', '#10b981']  // index 0..5
const LABELS = ['', 'Quá yếu', 'Yếu', 'Trung bình', 'Khá', 'Mạnh']

export default function PasswordStrengthMeter({ password }: Props) {
    const s = score(password)
    return (
        <div className="mt-1.5">
            <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((bar) => (
                    <div
                        key={bar}
                        className="h-1 flex-1 rounded-full transition-colors duration-200"
                        style={{ background: bar <= s ? COLORS[s] : COLORS[0] }}
                    />
                ))}
            </div>
            {password && (
                <p className="text-[11px] mt-1" style={{ color: COLORS[s] }}>
                    {LABELS[s]}
                </p>
            )}
        </div>
    )
}
