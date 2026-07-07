/**
 * Display-label helpers — map STORED enum values to Vietnamese labels for the
 * staff UI (admin + user). The Vietnamese-market language pass keeps the stored
 * values unchanged (English task types, role codes) so DB rows, the Velox
 * classifier, pricing and permission checks all keep working — only the on-screen
 * text changes. Pass anything through these at render time.
 *
 * NOTE: task STATUS values are already stored in Vietnamese (see task-statuses.ts)
 * and are load-bearing in comparisons (`=== 'Hoàn tất'`), so they are NOT mapped
 * here — render them verbatim. The ONE exception is 'Revision' (Sprint A merged
 * 'Review'→'Revision'), the single English status value; `statusLabel` below remaps
 * only its DISPLAY — the stored value + every `=== 'Revision'` comparison stay 'Revision'.
 */

/* ── Task status (display only — value never changes) ── */

const STATUS_LABEL: Record<string, string> = {
  // [L18a] Only the English 'Revision' leaks into the Vietnamese staff UI; give it the same
  // wording the workflow tabs already use ('Sửa lại'). All Vietnamese statuses pass through.
  Revision: 'Sửa lại',
}

/** Vietnamese display label for a stored task status. Only 'Revision' is remapped; every
 *  other (already-Vietnamese) status passes through verbatim. NEVER changes the stored value. */
export function statusLabel(status: string | null | undefined): string {
  if (!status) return ''
  return STATUS_LABEL[status] ?? status
}

/**
 * [Bug#2b] Shortened display label for the 6 long video-lifecycle statuses so the fixed-width
 * board status pill (a Radix Select trigger, ~1 line) doesn't clip them mid-word. Render-only:
 * the stored value is untouched, and the full label is still shown as a `title` tooltip + in the
 * dropdown list. The '(nội bộ)' / '(khách)' scope suffix is KEPT so who-did-what stays clear.
 * Non-video statuses fall through to statusLabel() unchanged.
 */
const SHORT_STATUS_LABEL: Record<string, string> = {
  'Đã nộp video (nội bộ)': 'Đã nộp (nội bộ)',
  'Đang sửa feedback (nội bộ)': 'Đang sửa (nội bộ)',
  'Đã sửa feedback (nội bộ)': 'Đã sửa (nội bộ)',
  'Đã gửi video (khách)': 'Đã gửi (khách)',
  'Đã nhận feedback (khách)': 'Nhận feedback (khách)',
  'Đã sửa feedback (khách)': 'Đã sửa (khách)',
}

/** Compact status label for narrow board pills. Falls through to statusLabel() for every
 *  status without a short form. NEVER changes the stored value. */
export function statusShort(status: string | null | undefined): string {
  if (!status) return ''
  return SHORT_STATUS_LABEL[status] ?? statusLabel(status)
}

/* ── Task type (stored 'Short form' | 'Long form' | 'Trial') ── */

const TASK_TYPE_LABEL: Record<string, string> = {
  'Short form': 'Video ngắn',
  'Long form': 'Video dài',
  Trial: 'Dùng thử',
}

/** Full Vietnamese label for a stored task type. Unknown values pass through. */
export function taskTypeLabel(type: string | null | undefined): string {
  if (!type) return ''
  return TASK_TYPE_LABEL[type] ?? type
}

const TASK_TYPE_SHORT: Record<string, string> = {
  'Short form': 'Ngắn',
  'Long form': 'Dài',
  Trial: 'Thử',
}

/** Compact badge label (e.g. table/board pills) for a stored task type. */
export function taskTypeShort(type: string | null | undefined): string {
  if (!type) return ''
  return TASK_TYPE_SHORT[type] ?? type
}

/* ── Roles ── */
// Mirrors ROLE_LABEL in src/lib/notification-emails/templates/auth/workspace-invitation.ts.
// Covers both workspace roles (OWNER/ADMIN/MEMBER/GUEST) and global roles (ADMIN/USER/CLIENT/LOCKED).

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Chủ sở hữu',
  ADMIN: 'Quản trị',
  MEMBER: 'Thành viên',
  GUEST: 'Khách',
  USER: 'Nhân viên',
  CLIENT: 'Khách hàng',
  LOCKED: 'Đã khoá',
}

/** Vietnamese label for a workspace/global role code. Unknown values pass through. */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return ''
  return ROLE_LABEL[role.toUpperCase()] ?? role
}
