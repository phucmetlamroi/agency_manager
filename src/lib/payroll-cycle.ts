/**
 * [AUDIT R5] Single source of truth for resolving a workspace's payroll cycle
 * (month/year) from its name, e.g. "Tháng 6/2026" → { month: 6, year: 2026 }.
 *
 * Previously this logic lived only inside bonus-actions.ts (which locks a cycle via
 * PayrollLock) while payroll-actions trusted a client-supplied month/year that the
 * payroll page hardcoded to (0,0). The two never matched, so the anti-fraud revert
 * guard was dead. Both modules now import THIS helper so the lock key, the Payroll
 * row key, and the revert lookup are always derived identically.
 */
export function extractPayrollCycle(
  workspaceName: string | null | undefined,
): { month: number; year: number } {
  if (workspaceName) {
    const match = workspaceName.match(/(\d{1,2})\s*\/\s*(\d{4})/)
    if (match) {
      const month = parseInt(match[1], 10)
      const year = parseInt(match[2], 10)
      if (month >= 1 && month <= 12 && year >= 2020 && year <= 2099) {
        return { month, year }
      }
    }
  }
  // Fallback: workspace name không có format MM/YYYY → dùng tháng/năm hiện tại
  const now = new Date()
  return { month: now.getMonth() + 1, year: now.getFullYear() }
}
