// src/lib/status-colors.ts
// [P3] Single, SERVER-SAFE source of truth for task status/type display colors.
// Extracted verbatim from components/tasks/detail-sections/_shared.tsx (a "use client"
// module that can't be imported by server code because it also pulls DOMPurify). The
// client _shared.tsx now RE-EXPORTS from here, so both surfaces share one map (progresses
// the deferred "unify STATUS_COLORS maps" cleanup). Values are byte-identical to _shared
// → desktop render unchanged (DR-3 safe).
//
// NB: these hex values intentionally mirror the --status-* board tokens; keeping them as
// literal hex here (not hsl(var(--…))) is required because callers concat alpha suffixes
// and pass raw hex to inline `style` (server + client). See P0-08d note.

export const STATUS_COLORS: Record<string, { label: string; color: string; bg: string }> = {
    'Nhận task': { label: 'Nhận task', color: '#3B82F6', bg: 'rgba(59,130,246,0.10)' },
    'Đã nhận task': { label: 'Đã nhận task', color: '#3B82F6', bg: 'rgba(59,130,246,0.10)' },
    'Đang đợi giao': { label: 'Đang đợi giao', color: '#A855F7', bg: 'rgba(168,85,247,0.10)' },
    'Đang thực hiện': { label: 'Đang thực hiện', color: '#EAB308', bg: 'rgba(234,179,8,0.10)' },
    'Revision': { label: 'Sửa lại', color: '#EF4444', bg: 'rgba(239,68,68,0.10)' }, // [L18a] display only; value stays 'Revision'
    'Sửa frame': { label: 'Sửa frame', color: '#EC4899', bg: 'rgba(236,72,153,0.10)' },
    'Gửi lại': { label: 'Gửi lại', color: '#F97316', bg: 'rgba(249,115,22,0.10)' },
    'Tạm ngưng': { label: 'Tạm ngưng', color: '#71717A', bg: 'rgba(113,113,122,0.10)' },
    'Hoàn tất': { label: 'Hoàn tất', color: '#10B981', bg: 'rgba(16,185,129,0.10)' },
    'Quá hạn': { label: 'Quá hạn', color: '#DC2626', bg: 'rgba(220,38,38,0.10)' },
    'Đã hủy': { label: 'Đã hủy', color: '#52525B', bg: 'rgba(82,82,91,0.10)' },
    // [P2-P4] 6 video-lifecycle statuses (A2–A7). Hues mirror TaskWorkflowTabs
    // (--status-* tokens); hex + matching rgba to stay consistent with entries above.
    'Đã nộp video (nội bộ)':      { label: 'Đã nộp video (nội bộ)',      color: '#6366F1', bg: 'rgba(99,102,241,0.10)' },  // --status-submitted (indigo)
    'Đang sửa feedback (nội bộ)': { label: 'Đang sửa feedback (nội bộ)', color: '#F59E0B', bg: 'rgba(245,158,11,0.10)' },  // --status-fixing (amber)
    'Đã sửa feedback (nội bộ)':   { label: 'Đã sửa feedback (nội bộ)',   color: '#14B8A6', bg: 'rgba(20,184,166,0.10)' },  // --status-fixed (teal)
    'Đã gửi video (khách)':       { label: 'Đã gửi video (khách)',       color: '#06B6D4', bg: 'rgba(6,182,212,0.10)' },   // --status-sent (cyan)
    'Đã nhận feedback (khách)':   { label: 'Đã nhận feedback (khách)',   color: '#EF4444', bg: 'rgba(239,68,68,0.10)' },   // --status-revision (red, shared hue)
    'Đã sửa feedback (khách)':    { label: 'Đã sửa feedback (khách)',    color: '#8B5CF6', bg: 'rgba(139,92,246,0.10)' },  // --status-client-fixed (violet)
}

export const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
    'Short form': { color: '#38BDF8', bg: 'rgba(56,189,248,0.10)' },
    'Long form': { color: '#A78BFA', bg: 'rgba(139,92,246,0.10)' },
    'Trial': { color: '#FBBF24', bg: 'rgba(245,158,11,0.10)' },
    'Short': { color: '#38BDF8', bg: 'rgba(56,189,248,0.10)' },
    'Long': { color: '#A78BFA', bg: 'rgba(139,92,246,0.10)' },
}

export function getStatusInfo(status: string) {
    return STATUS_COLORS[status] || { label: status, color: '#71717A', bg: 'rgba(113,113,122,0.10)' }
}
export function getTypeInfo(type: string) {
    return TYPE_COLORS[type] || { color: '#A1A1AA', bg: 'rgba(161,161,170,0.10)' }
}
