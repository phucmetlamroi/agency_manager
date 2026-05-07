/**
 * Task status to icon + color mapping for HustlyTasker emails.
 * App uses Vietnamese status strings — map to visual indicators.
 */

interface StatusInfo {
    icon: string
    label: string
    color: string
    bg: string
}

const STATUS_MAP: Record<string, StatusInfo> = {
    'Chưa bắt đầu':    { icon: '⚪', label: 'Chờ xử lý',    color: '#6b7280', bg: '#f3f4f6' },
    'Chua bat dau':    { icon: '⚪', label: 'Chờ xử lý',    color: '#6b7280', bg: '#f3f4f6' },
    'TODO':            { icon: '⚪', label: 'Chờ xử lý',    color: '#6b7280', bg: '#f3f4f6' },
    'Đang thực hiện':  { icon: '🟡', label: 'Đang làm',    color: '#d97706', bg: '#fef3c7' },
    'Dang thuc hien':  { icon: '🟡', label: 'Đang làm',    color: '#d97706', bg: '#fef3c7' },
    'IN_PROGRESS':     { icon: '🟡', label: 'Đang làm',    color: '#d97706', bg: '#fef3c7' },
    'Review':          { icon: '🔵', label: 'Đang review', color: '#2563eb', bg: '#dbeafe' },
    'Đã nộp':          { icon: '🔵', label: 'Đang review', color: '#2563eb', bg: '#dbeafe' },
    'Hoàn tất':        { icon: '🟢', label: 'Hoàn thành',  color: '#059669', bg: '#d1fae5' },
    'Hoan tat':        { icon: '🟢', label: 'Hoàn thành',  color: '#059669', bg: '#d1fae5' },
    'DONE':            { icon: '🟢', label: 'Hoàn thành',  color: '#059669', bg: '#d1fae5' },
    'Revision':        { icon: '🔴', label: 'Cần sửa',     color: '#dc2626', bg: '#fee2e2' },
    'REJECTED':        { icon: '🔴', label: 'Bị từ chối',  color: '#dc2626', bg: '#fee2e2' },
    'Đã hủy':          { icon: '⚫', label: 'Đã hủy',      color: '#1f2937', bg: '#f3f4f6' },
    'Da huy':          { icon: '⚫', label: 'Đã hủy',      color: '#1f2937', bg: '#f3f4f6' },
    'CANCELLED':       { icon: '⚫', label: 'Đã hủy',      color: '#1f2937', bg: '#f3f4f6' },
    'Quá hạn':         { icon: '❗', label: 'Quá hạn',     color: '#dc2626', bg: '#fee2e2' },
    'Qua han':         { icon: '❗', label: 'Quá hạn',     color: '#dc2626', bg: '#fee2e2' },
}

export function getStatusInfo(status: string | null | undefined): StatusInfo {
    if (!status) return STATUS_MAP['Chưa bắt đầu']
    return STATUS_MAP[status] || {
        icon: '🔘',
        label: status,
        color: '#6b7280',
        bg: '#f3f4f6',
    }
}

export function renderStatusBadge(status: string | null | undefined): string {
    const info = getStatusInfo(status)
    return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;background:${info.bg};color:${info.color};font-size:12px;font-weight:600;">${info.icon} ${info.label}</span>`
}

interface PriorityInfo {
    icon: string
    label: string
    color: string
}

const PRIORITY_MAP: Record<string, PriorityInfo> = {
    URGENT: { icon: '🔴', label: 'Khẩn cấp', color: '#dc2626' },
    HIGH:   { icon: '🔴', label: 'Cao',      color: '#ea580c' },
    MEDIUM: { icon: '🟡', label: 'Trung bình', color: '#d97706' },
    LOW:    { icon: '🟢', label: 'Thấp',     color: '#059669' },
}

export function getPriorityInfo(priority: string | null | undefined): PriorityInfo | null {
    if (!priority) return null
    return PRIORITY_MAP[priority.toUpperCase()] || null
}
