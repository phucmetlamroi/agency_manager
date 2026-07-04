// [Review module P2.3] Team-browser view preferences (FR-B09/FR-B10) + small pure
// UI helpers shared by the card/list/toolbar components. Client-only, no server
// imports. Appearance + Sort persist per-user in localStorage under a single key
// (`team.appearance`) — never a shared/server setting (FR-B09 AC3: user A's change
// is invisible to user B).

export type Layout = 'grid' | 'list'
export type CardSize = 'S' | 'M' | 'L'
export type Aspect = '16:9' | '1:1' | '9:16'
export type ThumbScale = 'fit' | 'fill'
export type SortField = 'name' | 'createdAt' | 'status' | 'duration' | 'sizeBytes' | 'uploader' | 'commentCount'
export type SortDir = 'asc' | 'desc'

export interface ViewPrefs {
    layout: Layout
    cardSize: CardSize
    aspect: Aspect
    /** thumbnail scaling: 'fit' = letterbox (contain), 'fill' = crop (cover). */
    thumb: ThumbScale
    /** false = bare thumbnail wall (no name/uploader/status rows). */
    showInfo: boolean
    sortField: SortField
    sortDir: SortDir
}

// Spec defaults (FR-B09 'Mặc định: Grid, size M, 16:9, Fill, Show Card Info ON' +
// FR-B10 'Date Uploaded, desc').
export const DEFAULT_PREFS: ViewPrefs = {
    layout: 'grid',
    cardSize: 'M',
    aspect: '16:9',
    thumb: 'fill',
    showInfo: true,
    sortField: 'createdAt',
    sortDir: 'desc',
}

export const PREFS_KEY = 'team.appearance'

const LAYOUTS: Layout[] = ['grid', 'list']
const SIZES: CardSize[] = ['S', 'M', 'L']
const ASPECTS: Aspect[] = ['16:9', '1:1', '9:16']
const THUMBS: ThumbScale[] = ['fit', 'fill']
const SORT_FIELD_VALUES: SortField[] = ['name', 'createdAt', 'status', 'duration', 'sizeBytes', 'uploader', 'commentCount']
const DIRS: SortDir[] = ['asc', 'desc']

function pick<T>(allowed: T[], v: unknown, fallback: T): T {
    return allowed.includes(v as T) ? (v as T) : fallback
}

/** Read prefs from localStorage, tolerating missing/corrupt values (always valid). */
export function loadPrefs(): ViewPrefs {
    if (typeof window === 'undefined') return DEFAULT_PREFS
    try {
        const raw = window.localStorage.getItem(PREFS_KEY)
        if (!raw) return DEFAULT_PREFS
        const p = JSON.parse(raw) as Partial<ViewPrefs>
        return {
            layout: pick(LAYOUTS, p.layout, DEFAULT_PREFS.layout),
            cardSize: pick(SIZES, p.cardSize, DEFAULT_PREFS.cardSize),
            aspect: pick(ASPECTS, p.aspect, DEFAULT_PREFS.aspect),
            thumb: pick(THUMBS, p.thumb, DEFAULT_PREFS.thumb),
            showInfo: typeof p.showInfo === 'boolean' ? p.showInfo : DEFAULT_PREFS.showInfo,
            sortField: pick(SORT_FIELD_VALUES, p.sortField, DEFAULT_PREFS.sortField),
            sortDir: pick(DIRS, p.sortDir, DEFAULT_PREFS.sortDir),
        }
    } catch {
        return DEFAULT_PREFS
    }
}

export function savePrefs(p: ViewPrefs): void {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(p))
    } catch {
        /* private mode / quota — prefs just won't persist this session */
    }
}

// ── Sort fields (VN labels, order per UI-UX-SPEC §1.4.3.2) ──
export const SORT_FIELDS: { field: SortField; label: string }[] = [
    { field: 'name', label: 'Tên' },
    { field: 'createdAt', label: 'Ngày tải lên' },
    { field: 'status', label: 'Trạng thái' },
    { field: 'duration', label: 'Thời lượng' },
    { field: 'sizeBytes', label: 'Dung lượng' },
    { field: 'uploader', label: 'Người tải lên' },
    { field: 'commentCount', label: 'Số bình luận' },
]

export function sortFieldLabel(f: SortField): string {
    return SORT_FIELDS.find((x) => x.field === f)?.label ?? 'Ngày tải lên'
}

// ── Grid sizing ──
/** Min card width (px) per size — drives `repeat(auto-fill, minmax(x, 1fr))`. */
export function gridMinWidth(size: CardSize): number {
    return size === 'S' ? 148 : size === 'L' ? 260 : 196
}

export function aspectCss(aspect: Aspect): string {
    return aspect === '1:1' ? '1 / 1' : aspect === '9:16' ? '9 / 16' : '16 / 9'
}

// ── Status chip colors (mirror the app's task-status chip; placeholder in P2.3 —
// the interactive status dropdown is P3/FR-D01). Kept in sync with the map used by
// the task tables (src/components/NewDesktopTaskTable.tsx). ──
export const STATUS_COLORS: Record<string, string> = {
    'Nhận task': '#3B82F6',
    'Đã nhận task': '#3B82F6',
    'Đang đợi giao': '#A855F7',
    'Đang thực hiện': '#EAB308',
    Revision: '#EF4444',
    'Sửa frame': '#EC4899',
    'Gửi lại': '#F97316',
    'Tạm ngưng': '#71717A',
    'Hoàn tất': '#10B981',
    'Quá hạn': '#DC2626',
    'Đã hủy': '#52525B',
}

export function statusColor(status: string | null | undefined): string {
    if (!status) return '#71717A'
    return STATUS_COLORS[status] ?? '#71717A'
}

// ── Formatters ──
/** ms → mm:ss (or h:mm:ss). null for missing/zero. */
export function msToClock(ms: number | null | undefined): string | null {
    if (ms == null || !Number.isFinite(ms) || ms <= 0) return null
    const total = Math.round(ms / 1000)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
    const ss = String(s).padStart(2, '0')
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** ISO → dd/MM/yyyy (UI-UX-SPEC §0.2). */
export function formatDate(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const dd = String(d.getDate()).padStart(2, '0')
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    return `${dd}/${mo}/${d.getFullYear()}`
}

/** ISO → dd/MM/yyyy lúc HH:mm (UI-UX-SPEC §0.2, uploader tooltip). */
export function formatDateTime(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${formatDate(iso)} lúc ${hh}:${mm}`
}
