// [Giao diện 2 · Mission Control · M1 Tổng quan] Desktop admin dashboard-as-board.
// Ported pixel-faithful from the owner's Claude Design bundle ("Giao dien 2 - Mission Control.dc.html",
// frame "MÀN 1 — TỔNG QUAN"). Dark #050505 + indigo #6366F1 + Plus Jakarta Sans (already the app font).
//
// SCOPE OF THIS FIRST COMMIT: static-faithful render (design sample data) mounted at its OWN full-screen
// route so it does NOT inherit the current admin AppShell — Giao diện 1 (/admin) stays 100% untouched.
// NEXT commit wires the 6-column board + KPI ribbon + right panel to REAL data (reusing the existing
// admin dashboard loaders), plus the avatar-menu "Đổi giao diện 1 ⇄ 2" toggle. Everything here is
// presentation only — no server action, no schema.
import type { LucideIcon } from 'lucide-react'
import {
    LayoutDashboard, ListTodo, Inbox, Clapperboard, CalendarDays, Wallet, Building2,
    UsersRound, Trash2, Activity, ScrollText, Settings, LayoutGrid, ChevronUp, Search,
    Store, Plus, Maximize2, Play, MessageSquare, Archive, Trophy, Users, ChevronsRight,
    Crown,
} from 'lucide-react'

// ─────────────────────────── sample data (design mock — replaced by real data next commit) ───────────────────────────
interface McTask {
    title: string
    statusLabel: string
    dot: string          // status dot / pill hue
    assignee: string
    initials: string
    avatar: string       // gradient
    rank?: string
    rankColor?: string
    meta: string         // right-aligned meta (date / "2h trước" / money)
    progress?: number    // 0..100 for "Đang làm"
    note?: { icon: LucideIcon; text: string; tone: string }
    danger?: boolean     // red card border (overdue / client feedback)
}
interface McColumn {
    label: string
    hue: string          // dot + count colours
    count: number
    glow: string
    accent?: 'danger' | 'success'
    tasks: McTask[]
    moreText: string
}

const RANK = {
    A: { color: '#34D399', border: 'rgba(52,211,153,0.4)' },
    B: { color: '#60A5FA', border: 'rgba(96,165,250,0.4)' },
    S: { color: '#FACC15', border: 'rgba(250,204,21,0.4)' },
} as const

const COLUMNS: McColumn[] = [
    {
        label: 'Đã giao task', hue: '#3B82F6', count: 3, glow: 'rgba(59,130,246,0.06)', moreText: '+ 1 task nữa',
        tasks: [
            { title: 'Ads 30s — Jacob', statusLabel: 'Nhận task', dot: '#3B82F6', assignee: 'Trang', initials: 'TR', avatar: 'linear-gradient(135deg,#10B981,#06B6D4)', rank: 'A', rankColor: RANK.A.color, meta: 'T5 16/07' },
            { title: 'Recap intro — Pullio', statusLabel: 'Đã nhận task', dot: '#3B82F6', assignee: 'Minh', initials: 'MI', avatar: 'linear-gradient(135deg,#EC4899,#F43F5E)', rank: 'B', rankColor: RANK.B.color, meta: 'T6 17/07' },
        ],
    },
    {
        label: 'Đang làm', hue: '#EAB308', count: 8, glow: 'rgba(234,179,8,0.05)', moreText: '+ 6 task nữa',
        tasks: [
            { title: 'VSL 05 — Ryan', statusLabel: 'Đang thực hiện', dot: '#EAB308', assignee: 'Phuc', initials: 'PH', avatar: 'linear-gradient(135deg,#6366F1,#8B5CF6)', rank: 'A', rankColor: RANK.A.color, meta: 'T4 15/07', progress: 60 },
            { title: 'Shorts #15 — Kash', statusLabel: 'Đang thực hiện', dot: '#EAB308', assignee: 'Bao', initials: 'BA', avatar: 'linear-gradient(135deg,#A855F7,#EC4899)', rank: 'S', rankColor: RANK.S.color, meta: 'T5 16/07', progress: 35 },
        ],
    },
    {
        label: 'Duyệt nội bộ', hue: '#6366F1', count: 4, glow: 'rgba(99,102,241,0.07)', moreText: '+ 2 task nữa',
        tasks: [
            { title: 'Shorts #12 — Kash', statusLabel: 'Đã nộp video', dot: '#6366F1', assignee: 'Trang', initials: 'TR', avatar: 'linear-gradient(135deg,#10B981,#06B6D4)', meta: '2h trước', note: { icon: Play, text: 'v2 — cần bạn duyệt', tone: '#A5B4FC' } },
            { title: 'Intro 3D — Pullio', statusLabel: 'Sửa lại', dot: '#EF4444', assignee: 'Bao', initials: 'BA', avatar: 'linear-gradient(135deg,#A855F7,#EC4899)', rank: 'S', rankColor: RANK.S.color, meta: 'vòng 2' },
        ],
    },
    {
        label: 'Khách duyệt', hue: '#06B6D4', count: 4, glow: 'rgba(6,182,212,0.06)', moreText: '+ 2 task nữa',
        tasks: [
            { title: 'VSL 01 — Jacob', statusLabel: 'Đã gửi khách', dot: '#06B6D4', assignee: 'Phuc', initials: 'PH', avatar: 'linear-gradient(135deg,#6366F1,#8B5CF6)', meta: 'hôm qua' },
            { title: 'Recap Q2 — Michael', statusLabel: 'Feedback khách', dot: '#EF4444', assignee: 'Minh', initials: 'MI', avatar: 'linear-gradient(135deg,#EC4899,#F43F5E)', meta: '30 phút', danger: true, note: { icon: MessageSquare, text: '3 ghi chú mới', tone: '#F87171' } },
        ],
    },
    {
        label: 'Quá hạn', hue: '#DC2626', count: 3, glow: 'rgba(220,38,38,0.07)', accent: 'danger', moreText: '+ 1 task nữa',
        tasks: [
            { title: 'Podcast cut — Michael', statusLabel: 'Quá hạn', dot: '#DC2626', assignee: 'Minh', initials: 'MI', avatar: 'linear-gradient(135deg,#EC4899,#F43F5E)', rank: 'B', rankColor: RANK.B.color, meta: 'Trễ 2 ngày', danger: true },
            { title: 'Logo sting — Pullio', statusLabel: 'Quá hạn', dot: '#DC2626', assignee: 'Bao', initials: 'BA', avatar: 'linear-gradient(135deg,#A855F7,#EC4899)', rank: 'S', rankColor: RANK.S.color, meta: 'Trễ 1 ngày' },
        ],
    },
    {
        label: 'Hoàn tất', hue: '#10B981', count: 22, glow: 'rgba(16,185,129,0.06)', accent: 'success', moreText: '+ 20 task nữa',
        tasks: [
            { title: 'Shorts #11 — Kash', statusLabel: 'Hoàn tất', dot: '#10B981', assignee: 'Trang', initials: 'TR', avatar: 'linear-gradient(135deg,#10B981,#06B6D4)', meta: '400.000 đ' },
            { title: 'VSL 04 — Ryan', statusLabel: 'Hoàn tất', dot: '#10B981', assignee: 'Phuc', initials: 'PH', avatar: 'linear-gradient(135deg,#6366F1,#8B5CF6)', meta: '1.250.000 đ' },
        ],
    },
]

const RAIL_ICONS: { icon: LucideIcon; active?: boolean; badge?: number; divider?: boolean; title?: string }[] = [
    { icon: LayoutDashboard, active: true },
    { icon: ListTodo },
    { icon: Inbox, badge: 3 },
    { icon: Clapperboard },
    { icon: CalendarDays },
    { icon: Wallet, divider: true },
    { icon: Building2 },
    { icon: UsersRound, divider: true },
    { icon: Trash2 },
    { icon: Activity, title: 'Phân tích' },
    { icon: ScrollText, title: 'Nhật ký hoạt động' },
]

const card = 'rgba(24,24,27,0.60)'
const cardBorder = '1px solid rgba(255,255,255,0.06)'

// ─────────────────────────── sub-components ───────────────────────────
function RailIcon({ icon: Icon, active, badge, title }: { icon: LucideIcon; active?: boolean; badge?: number; title?: string }) {
    return (
        <div title={title} style={{ position: 'relative', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? '#A5B4FC' : '#A1A1AA', background: active ? 'rgba(99,102,241,0.18)' : 'transparent', border: active ? '1px solid rgba(99,102,241,0.30)' : '1px solid transparent', boxShadow: active ? '0 4px 16px rgba(99,102,241,0.15)' : 'none' }}>
            <Icon style={{ width: 18, height: 18 }} />
            {badge != null && (
                <span style={{ position: 'absolute', top: 4, right: 4, minWidth: 14, height: 14, borderRadius: 999, background: 'rgba(168,85,247,0.9)', color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 10px rgba(168,85,247,0.5)' }}>{badge}</span>
            )}
        </div>
    )
}

function TaskCard({ t }: { t: McTask }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, borderRadius: 12, background: card, backdropFilter: 'blur(12px)', border: t.danger ? '1px solid rgba(239,68,68,0.25)' : cardBorder, padding: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#F4F4F5', lineHeight: 1.35 }}>{t.title}</span>
            <span style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: `${t.dot}1a`, color: t.dot, border: `1px solid ${t.dot}4d`, whiteSpace: 'nowrap' }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: t.dot }} />{t.statusLabel}
            </span>
            {t.progress != null && (
                <div style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ width: `${t.progress}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#6366F1,#8B5CF6)' }} />
                </div>
            )}
            {t.note && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 8, background: `${t.note.tone}14`, border: `1px solid ${t.note.tone}26` }}>
                    <t.note.icon style={{ width: 12, height: 12, color: t.note.tone }} />
                    <span style={{ fontSize: 10, color: t.note.tone, fontWeight: 600, whiteSpace: 'nowrap' }}>{t.note.text}</span>
                </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 20, height: 20, borderRadius: 999, background: t.avatar, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff' }}>{t.initials}</span>
                <span style={{ fontSize: 11, color: '#D4D4D8' }}>{t.assignee}</span>
                {t.rank && <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 9, fontWeight: 800, color: t.rankColor, border: `1px solid ${t.rankColor}66`, borderRadius: 4, padding: '0 4px' }}>{t.rank}</span>}
                <div style={{ flex: 1 }} />
                <span style={{ fontFamily: t.meta.includes('đ') ? 'ui-monospace,Menlo,monospace' : undefined, fontSize: 10, fontWeight: t.meta.startsWith('Trễ') ? 700 : 400, color: t.meta.startsWith('Trễ') ? '#F87171' : '#A1A1AA', whiteSpace: 'nowrap' }}>{t.meta}</span>
            </div>
        </div>
    )
}

function Column({ col }: { col: McColumn }) {
    const bg = col.accent === 'danger' ? 'rgba(220,38,38,0.03)' : col.accent === 'success' ? 'rgba(16,185,129,0.02)' : 'rgba(255,255,255,0.02)'
    const border = col.accent === 'danger' ? '1px solid rgba(220,38,38,0.18)' : col.accent === 'success' ? '1px solid rgba(16,185,129,0.15)' : '1px solid rgba(255,255,255,0.05)'
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, background: bg, border, borderRadius: 16, padding: 10, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, borderRadius: 999, background: col.glow, filter: 'blur(28px)', pointerEvents: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: col.hue, boxShadow: `0 0 8px ${col.hue}99` }} />
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: col.accent === 'danger' ? '#FCA5A5' : '#D4D4D8', whiteSpace: 'nowrap' }}>{col.label}</span>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 8px', borderRadius: 999, background: `${col.hue}1f`, color: col.hue, border: `1px solid ${col.hue}4d` }}>{col.count}</span>
            </div>
            {col.tasks.map((t) => <TaskCard key={t.title} t={t} />)}
            <div style={{ textAlign: 'center', fontSize: 11, color: '#71717A', padding: 4 }}>{col.moreText}</div>
        </div>
    )
}

function Kpi({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1, padding: '10px 16px', borderRadius: 12, background: card, backdropFilter: 'blur(12px)', border: cardBorder }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>{children}</div>
        </div>
    )
}

// ─────────────────────────── main ───────────────────────────
export default function MissionControlBoard({ greetingName = 'Phuc', workspaceName = 'Hustly Media' }: { greetingName?: string; workspaceName?: string }) {
    return (
        <div style={{ minHeight: '100dvh', background: '#050505', color: '#F4F4F5', display: 'flex', position: 'relative', fontFamily: '"Plus Jakarta Sans", -apple-system, "Segoe UI", system-ui, sans-serif' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(900px 600px at 12% -10%, rgba(99,102,241,0.10), transparent 60%),radial-gradient(800px 600px at 100% 110%, rgba(168,85,247,0.10), transparent 60%)', pointerEvents: 'none' }} />

            {/* Icon rail */}
            <div style={{ position: 'relative', width: 64, flexShrink: 0, background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(20px)', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 0', gap: 4 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 18px rgba(139,92,246,0.40)', marginBottom: 12 }}>
                    <span style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>H</span>
                </div>
                {RAIL_ICONS.map((r, i) => (
                    <div key={i} style={{ display: 'contents' }}>
                        {r.divider && <div style={{ width: 28, height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 0' }} />}
                        <RailIcon icon={r.icon} active={r.active} badge={r.badge} title={r.title} />
                    </div>
                ))}
                <div style={{ flex: 1 }} />
                <RailIcon icon={Settings} />
                <div style={{ width: 36, height: 36, borderRadius: 999, background: 'linear-gradient(135deg,#A855F7,#6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 12, marginTop: 6 }}>BP</div>
            </div>

            {/* Main */}
            <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                {/* Top bar */}
                <div style={{ position: 'relative', zIndex: 60, height: 64, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '0 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(10,10,10,0.50)', backdropFilter: 'blur(10px)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.35)' }}>
                        <LayoutGrid style={{ width: 14, height: 14, color: '#A5B4FC' }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#F4F4F5' }}>{workspaceName}</span>
                        <ChevronUp style={{ width: 14, height: 14, color: '#A5B4FC' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 10, letterSpacing: '0.16em', color: '#71717A' }}>WORKSPACE / DASHBOARD</span>
                        <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: '#F4F4F5' }}>Chào buổi tối, {greetingName}.</span>
                    </div>
                    <div style={{ flex: 1 }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', width: 260 }}>
                        <Search style={{ width: 14, height: 14, color: '#71717A' }} />
                        <span style={{ fontSize: 12, color: '#71717A', flex: 1 }}>Tìm task, khách, người…</span>
                        <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 10, background: 'rgba(0,0,0,0.4)', padding: '2px 6px', borderRadius: 4, color: '#A1A1AA' }}>⌘K</span>
                    </div>
                    <div style={{ position: 'relative', width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A1A1AA' }}>
                        <Store style={{ width: 17, height: 17 }} />
                        <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 15, height: 15, borderRadius: 999, background: '#6366F1', color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 10px rgba(99,102,241,0.5)' }}>6</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 10, background: '#6366F1', color: '#fff', fontSize: 13, fontWeight: 700, boxShadow: '0 0 24px rgba(99,102,241,0.40)' }}>
                        <Plus style={{ width: 15, height: 15 }} /><span>Add Task</span>
                    </div>
                    <div style={{ width: 34, height: 34, borderRadius: 999, background: 'linear-gradient(135deg,#A855F7,#6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 12 }}>BP</div>
                </div>

                {/* KPI ribbon */}
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'stretch', gap: 10, padding: '14px 24px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 12, background: card, backdropFilter: 'blur(12px)', border: cardBorder }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Gross Revenue</span>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                                <span style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>138.400.000</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA' }}>đ</span>
                            </div>
                        </div>
                        <svg viewBox="0 0 80 26" style={{ width: 80, height: 26 }}>
                            <path d="M0,22 L12,20 L24,21 L36,14 L48,16 L60,9 L72,11 L80,5 L80,26 L0,26 Z" fill="rgba(16,185,129,0.15)" />
                            <path d="M0,22 L12,20 L24,21 L36,14 L48,16 L60,9 L72,11 L80,5" stroke="#10B981" strokeWidth="1.6" fill="none" strokeLinecap="round" />
                        </svg>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: 'rgba(16,185,129,0.10)', color: '#34D399' }}>▲ +12%</span>
                    </div>
                    <Kpi label="Total Tasks"><span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>50</span><span style={{ fontSize: 11, color: '#71717A', whiteSpace: 'nowrap' }}>+9 tháng này</span></Kpi>
                    <Kpi label="Đang chạy"><span style={{ fontSize: 18, fontWeight: 800, color: '#FBBF24' }}>22</span><span style={{ fontSize: 11, color: '#71717A', whiteSpace: 'nowrap' }}>3 quá hạn</span></Kpi>
                    <Kpi label="Hoàn tất"><span style={{ fontSize: 18, fontWeight: 800, color: '#34D399' }}>22</span><span style={{ fontSize: 11, color: '#71717A', whiteSpace: 'nowrap' }}>tháng này</span></Kpi>
                    <Kpi label="Total Clients"><span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>9</span><span style={{ fontSize: 11, fontWeight: 800, color: '#34D399' }}>▲ +2</span></Kpi>
                    <div style={{ flex: 1 }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderRadius: 12, border: '1px dashed rgba(255,255,255,0.12)', color: '#71717A', fontSize: 11 }}>
                        <Maximize2 style={{ width: 13, height: 13 }} /><span>Click chip → panel chi tiết</span>
                    </div>
                </div>

                {/* Board */}
                <div style={{ flex: 1, display: 'flex', gap: 10, padding: '16px 24px 8px', minHeight: 0 }}>
                    {COLUMNS.map((col) => <Column key={col.label} col={col} />)}
                </div>

                {/* Board footer */}
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 24px 14px' }}>
                    <span style={{ fontSize: 11, color: '#71717A' }}>14 trạng thái gốc giữ nguyên trên thẻ (nhóm theo phase) — 6 cột như bảng admin hiện tại</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.25)', color: '#C084FC', fontSize: 11, fontWeight: 600 }}>
                        <Inbox style={{ width: 12, height: 12 }} /><span>Chờ giao · 6 — mở Kho Task Đợi</span>
                    </div>
                    <div style={{ flex: 1 }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: 'rgba(82,82,91,0.10)', border: '1px solid rgba(82,82,91,0.30)', color: '#A1A1AA', fontSize: 11, fontWeight: 600 }}>
                        <Archive style={{ width: 12, height: 12 }} /><span>Đã hủy / lưu trữ · 4 — Khôi phục</span>
                    </div>
                </div>
            </div>

            {/* Right utility panel */}
            <div style={{ position: 'relative', width: 292, flexShrink: 0, background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(20px)', borderLeft: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', padding: 14, gap: 14, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -50, right: -50, width: 160, height: 160, borderRadius: 999, background: 'rgba(250,204,21,0.05)', filter: 'blur(32px)', pointerEvents: 'none' }} />
                <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8, borderRadius: 10, background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.30)', color: '#A5B4FC' }}><Trophy style={{ width: 15, height: 15, filter: 'drop-shadow(0 0 8px rgba(250,204,21,0.5))' }} /></div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, borderRadius: 10, color: '#A1A1AA' }}><Users style={{ width: 15, height: 15 }} /></div>
                    <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, borderRadius: 10, color: '#A1A1AA' }}><Inbox style={{ width: 15, height: 15 }} /><span style={{ position: 'absolute', top: 3, right: 16, minWidth: 13, height: 13, borderRadius: 999, background: 'rgba(168,85,247,0.9)', color: '#fff', fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>3</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, color: '#71717A' }}><ChevronsRight style={{ width: 14, height: 14 }} /></div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#71717A' }}>Bảng Xếp Hạng Tháng</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, background: 'linear-gradient(180deg,rgba(234,179,8,0.10),rgba(234,179,8,0.02))', border: '1px solid rgba(250,204,21,0.25)' }}>
                        <div style={{ position: 'relative', width: 34, height: 34, borderRadius: 999, background: 'linear-gradient(135deg,#A855F7,#EC4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', boxShadow: '0 0 18px rgba(234,179,8,0.5)' }}>BA<span style={{ position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)', color: '#FACC15' }}><Crown style={{ width: 12, height: 12, filter: 'drop-shadow(0 0 6px rgba(250,204,21,0.7))' }} /></span></div>
                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 700, color: '#F4F4F5' }}>Bao</div><div style={{ fontSize: 10, color: '#A1A1AA' }}>12 task · lỗi 0.2</div></div>
                        <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11, fontWeight: 800, color: '#FACC15', border: '1px solid rgba(250,204,21,0.4)', borderRadius: 6, padding: '1px 7px' }}>S</span>
                    </div>
                    {[{ n: 'Phuc', i: 'PH', g: 'linear-gradient(135deg,#6366F1,#8B5CF6)', s: '9 task · lỗi 0.4', r: 'A' }, { n: 'Trang', i: 'TR', g: 'linear-gradient(135deg,#10B981,#06B6D4)', s: '7 task · lỗi 0.5', r: 'A' }].map((p) => (
                        <div key={p.n} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ width: 30, height: 30, borderRadius: 999, background: p.g, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff' }}>{p.i}</div>
                            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 700, color: '#F4F4F5' }}>{p.n}</div><div style={{ fontSize: 10, color: '#A1A1AA' }}>{p.s}</div></div>
                            <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11, fontWeight: 800, color: '#34D399', border: '1px solid rgba(52,211,153,0.4)', borderRadius: 6, padding: '1px 7px' }}>{p.r}</span>
                        </div>
                    ))}
                    <a href="#" style={{ fontSize: 11, fontWeight: 600, color: '#A5B4FC' }}>Xem đầy đủ bảng xếp hạng</a>
                </div>

                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#71717A' }}>Clients · 9</span><a href="#" style={{ fontSize: 11, color: '#A5B4FC' }}>Quản lý</a></div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {[{ n: 'Jacob', g: 'linear-gradient(135deg,#F43F5E,#EC4899)' }, { n: 'Michael', g: 'linear-gradient(135deg,#06B6D4,#3B82F6)' }, { n: 'Kash', g: 'linear-gradient(135deg,#F59E0B,#EAB308)' }].map((c) => (
                            <span key={c.n} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 11, color: '#D4D4D8' }}><span style={{ width: 13, height: 13, borderRadius: 999, background: c.g }} />{c.n}</span>
                        ))}
                        <span style={{ padding: '4px 9px', borderRadius: 999, background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.12)', fontSize: 11, color: '#71717A' }}>+6</span>
                    </div>
                </div>

                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#71717A' }}>Yêu cầu mới · 3</span><a href="#" style={{ fontSize: 11, color: '#A5B4FC' }}>Hộp thư</a></div>
                    {[{ t: 'Jacob — cần 2 shorts gấp tuần này', s: '10 phút trước', hot: true }, { t: 'Kash — brief series podcast mới', s: '2 giờ trước', hot: false }].map((r) => (
                        <div key={r.t} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: r.hot ? 'rgba(168,85,247,0.06)' : 'rgba(255,255,255,0.02)', border: r.hot ? '1px solid rgba(168,85,247,0.15)' : '1px solid rgba(255,255,255,0.05)' }}>
                            <span style={{ width: 6, height: 6, borderRadius: 999, background: '#C084FC', boxShadow: r.hot ? '0 0 8px rgba(168,85,247,0.6)' : 'none' }} />
                            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 11, fontWeight: 600, color: r.hot ? '#F4F4F5' : '#D4D4D8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.t}</div><div style={{ fontSize: 10, color: '#71717A' }}>{r.s}</div></div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
