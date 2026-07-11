// src/lib/format-compact.ts
// [P3 / FR-C1, FR-E1, FR-E6] Compact vi-VN number formatting for mobile KPI/cards.
// Fixes the desktop bug where "$107.500.000" / 9-digit revenue overflowed circular
// badges and wrapped one-word-per-line on 375px (f_0034–f_0042, f_0078).
// Pure display helper — no rounding of stored money values (PHAM-VI-LOAI-BO §0.5).

/**
 * Compact a VND amount for a narrow mobile slot:
 *   1_250          → "1.250"
 *   9_500_000      → "9,5 Tr"
 *   107_500_000    → "107,5 Tr"
 *   2_300_000_000  → "2,3 Tỷ"
 * Comma is the vi-VN decimal separator; "Tr" = triệu (million), "Tỷ" = billion.
 */
export function formatCompactVND(value: number | null | undefined): string {
    const n = Number(value ?? 0)
    if (!isFinite(n)) return '0'
    const abs = Math.abs(n)
    const sign = n < 0 ? '-' : ''
    if (abs >= 1_000_000_000) {
        return `${sign}${(abs / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} Tỷ`
    }
    if (abs >= 1_000_000) {
        return `${sign}${(abs / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} Tr`
    }
    return `${sign}${abs.toLocaleString('vi-VN')}`
}

/** VND value with the currency mark appended, e.g. "9,5 Tr ₫". */
export function formatCompactVNDWithUnit(value: number | null | undefined): string {
    return `${formatCompactVND(value)} ₫`
}

/** Plain integer counts with vi-VN grouping ("1.234"); large counts compacted like VND without unit. */
export function formatCompactCount(value: number | null | undefined): string {
    const n = Number(value ?? 0)
    if (!isFinite(n)) return '0'
    if (Math.abs(n) >= 1_000_000) return formatCompactVND(n)
    return Math.round(n).toLocaleString('vi-VN')
}
