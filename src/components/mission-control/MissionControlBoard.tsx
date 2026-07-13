// [Giao diện 2 · Mission Control · M1 Tổng quan] Desktop admin dashboard-as-board.
// Ported pixel-faithful from the owner's Claude Design bundle ("MÀN 1 — TỔNG QUAN"). Dark #050505 +
// indigo #6366F1 + Plus Jakarta Sans. NOW DATA-DRIVEN: the page loads the SAME data as /admin (tasks
// grouped into the real 6 TaskWorkflowTabs columns, finance KPIs, leaderboard, clients) and passes it
// as props. Presentation only — no server action, no schema; /admin (Giao diện 1) is untouched.
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import {
    LayoutDashboard, ListTodo, Inbox, Clapperboard, CalendarDays, Wallet, Building2,
    UsersRound, Trash2, Activity, ScrollText, Settings, LayoutGrid,
    Maximize2, Archive, Trophy, Users, ChevronsRight, Crown,
} from 'lucide-react'
import McTopbarActions, { type McAddTaskData } from './McTopbarActions'
import McBackLink from './McBackLink'

export interface McTask {
    id: string
    title: string
    statusLabel: string
    dot: string
    assignee: string
    initials: string
    avatar: string
    rank?: string
    rankColor?: string
    meta: string
    danger?: boolean
}
export interface McColumn {
    label: string
    hue: string
    count: number
    accent?: 'danger' | 'success'
    tasks: McTask[]
    moreText: string
}
export interface McLeader { name: string; initials: string; avatar: string; sub: string; rank: string; rankColor: string; top?: boolean }
export interface McData {
    greetingName: string
    greeting?: string
    workspaceName: string
    backHref: string
    workspaceId: string
    kpi: {
        grossRevenueVND: number; sparkline: number[]
        totalTasks: number; totalTasksDelta: number
        running: number; overdue: number
        completed: number
        totalClients: number; clientsNew: number
    }
    columns: McColumn[]
    leaderboard: McLeader[]
    clients: string[]
    clientsTotal: number
    cancelledCount: number
    waitingCount: number
    /** [M1 interactivity] Props for the reused AddTaskModal (fetched like /admin does). */
    addTask: McAddTaskData
    userRole: string
}

const card = 'rgba(24,24,27,0.60)'
const cardBorder = '1px solid rgba(255,255,255,0.06)'
const RAIL: { icon: LucideIcon; active?: boolean; divider?: boolean; title?: string; nav?: 'queue' | 'requests' | 'tien' | 'lich' | 'tep' | 'members' }[] = [
    { icon: LayoutDashboard, active: true }, { icon: ListTodo, nav: 'queue', title: 'Kho Task Đợi' }, { icon: Inbox, nav: 'requests', title: 'Hộp thư yêu cầu' }, { icon: Clapperboard, nav: 'tep', title: 'Tệp — Review' },
    { icon: CalendarDays, nav: 'lich', title: 'Lịch' }, { icon: Wallet, nav: 'tien', title: 'Tiền — Payroll', divider: true }, { icon: Building2 },
    { icon: UsersRound, nav: 'members', title: 'Thành viên', divider: true }, { icon: Trash2 }, { icon: Activity, title: 'Phân tích' }, { icon: ScrollText, title: 'Nhật ký hoạt động' },
]

function fmtVND(n: number): string { return Math.round(n).toLocaleString('vi-VN') }
// Lighten a #rrggbb toward white (frame uses lighter tints for pill/count text).
function lighten(hex: string, amt: number): string {
    const h = hex.replace('#', '')
    if (h.length !== 6) return hex
    const mix = (c: number) => Math.round(c + (255 - c) * amt)
    const to2 = (n: number) => n.toString(16).padStart(2, '0')
    return `#${to2(mix(parseInt(h.slice(0, 2), 16)))}${to2(mix(parseInt(h.slice(2, 4), 16)))}${to2(mix(parseInt(h.slice(4, 6), 16)))}`
}
// Per-client dot color (frame gives each client a distinct hue).
const CLIENT_DOTS = [
    'linear-gradient(135deg,#F43F5E,#EC4899)', 'linear-gradient(135deg,#06B6D4,#3B82F6)', 'linear-gradient(135deg,#F59E0B,#EAB308)',
    'linear-gradient(135deg,#10B981,#06B6D4)', 'linear-gradient(135deg,#A855F7,#EC4899)', 'linear-gradient(135deg,#6366F1,#8B5CF6)',
]
function clientDot(seed: string): string { let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0; return CLIENT_DOTS[h % CLIENT_DOTS.length] }
function sparkPaths(vals: number[]): { line: string; area: string } {
    const n = vals.length
    if (n < 2) return { line: '', area: '' }
    const max = Math.max(...vals, 1), min = Math.min(...vals, 0), range = max - min || 1
    const pts = vals.map((v, i) => [(i / (n - 1)) * 80, 22 - ((v - min) / range) * 17] as const)
    const line = 'M' + pts.map((p) => `${p[0].toFixed(0)},${p[1].toFixed(0)}`).join(' L')
    return { line, area: `${line} L80,26 L0,26 Z` }
}

function RailIcon({ icon: Icon, active, title }: { icon: LucideIcon; active?: boolean; title?: string }) {
    return (
        <div title={title} style={{ position: 'relative', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? '#A5B4FC' : '#A1A1AA', background: active ? 'rgba(99,102,241,0.18)' : 'transparent', border: active ? '1px solid rgba(99,102,241,0.30)' : '1px solid transparent', boxShadow: active ? '0 4px 16px rgba(99,102,241,0.15)' : 'none' }}>
            <Icon style={{ width: 18, height: 18 }} />
        </div>
    )
}

function TaskCard({ t }: { t: McTask }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, borderRadius: 12, background: card, backdropFilter: 'blur(12px)', border: t.danger ? '1px solid rgba(220,38,38,0.35)' : cardBorder, boxShadow: t.danger ? '0 0 20px rgba(220,38,38,0.12)' : undefined, padding: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#F4F4F5', lineHeight: 1.35 }}>{t.title}</span>
            <span style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: `${t.dot}1a`, color: lighten(t.dot, 0.4), border: `1px solid ${t.dot}4d`, whiteSpace: 'nowrap' }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: t.dot }} />{t.statusLabel}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 20, height: 20, borderRadius: 999, background: t.avatar, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{t.initials}</span>
                <span style={{ fontSize: 11, color: '#D4D4D8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.assignee}</span>
                {t.rank && <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 9, fontWeight: 800, color: t.rankColor, border: `1px solid ${t.rankColor}66`, borderRadius: 4, padding: '0 4px', flexShrink: 0 }}>{t.rank}</span>}
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 10, fontWeight: t.meta.startsWith('Trễ') ? 700 : 400, color: t.meta.startsWith('Trễ') ? '#F87171' : '#A1A1AA', whiteSpace: 'nowrap' }}>{t.meta}</span>
            </div>
        </div>
    )
}

function Column({ col, workspaceId }: { col: McColumn; workspaceId: string }) {
    const bg = col.accent === 'danger' ? 'rgba(220,38,38,0.03)' : col.accent === 'success' ? 'rgba(16,185,129,0.02)' : 'rgba(255,255,255,0.02)'
    const border = col.accent === 'danger' ? '1px solid rgba(220,38,38,0.18)' : col.accent === 'success' ? '1px solid rgba(16,185,129,0.15)' : '1px solid rgba(255,255,255,0.05)'
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, background: bg, border, borderRadius: 16, padding: 10, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, borderRadius: 999, background: `${col.hue}12`, filter: 'blur(28px)', pointerEvents: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: col.hue, boxShadow: `0 0 8px ${col.hue}99` }} />
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: col.accent === 'danger' ? '#FCA5A5' : '#D4D4D8', whiteSpace: 'nowrap' }}>{col.label}</span>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 8px', borderRadius: 999, background: `${col.hue}1f`, color: lighten(col.hue, 0.35), border: `1px solid ${col.hue}4d` }}>{col.count}</span>
            </div>
            {col.tasks.length === 0 && <div style={{ textAlign: 'center', fontSize: 11, color: '#52525B', padding: '10px 4px' }}>Trống</div>}
            {/* [M3] Click a card → the Mission-Control task drawer (/mc/task/[id], server-sanitized). */}
            {col.tasks.map((t) => (
                <Link key={t.id} href={`/${workspaceId}/mc/task/${t.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                    <TaskCard t={t} />
                </Link>
            ))}
            {/* [M16] "+N nữa" → the full operational board (Vận hành bảng task) where every status
                dropdown / ⋯ menu / bulk action lives; the dashboard columns are read-only previews. */}
            {col.moreText && (
                <Link href={`/${workspaceId}/mc/board`} title="Mở bảng vận hành đầy đủ" style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#818CF8', padding: 4, textDecoration: 'none' }}>
                    {col.moreText} →
                </Link>
            )}
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

export default function MissionControlBoard({ data }: { data: McData }) {
    const { kpi } = data
    const sp = sparkPaths(kpi.sparkline)
    return (
        <div style={{ minHeight: '100dvh', background: '#050505', color: '#F4F4F5', display: 'flex', position: 'relative', fontFamily: '"Plus Jakarta Sans", -apple-system, "Segoe UI", system-ui, sans-serif' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(900px 600px at 12% -10%, rgba(99,102,241,0.10), transparent 60%),radial-gradient(800px 600px at 100% 110%, rgba(168,85,247,0.10), transparent 60%)', pointerEvents: 'none' }} />

            {/* Icon rail */}
            <div style={{ position: 'relative', width: 64, flexShrink: 0, background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(20px)', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 0', gap: 4 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 18px rgba(139,92,246,0.40)', marginBottom: 12 }}>
                    <span style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>H</span>
                </div>
                {RAIL.map((r, i) => {
                    const href = r.nav === 'queue' ? `/${data.workspaceId}/mc/queue`
                        : r.nav === 'requests' ? `/${data.workspaceId}/mc/requests`
                            : r.nav === 'tien' ? `/${data.workspaceId}/mc/tien`
                                : r.nav === 'lich' ? `/${data.workspaceId}/mc/lich`
                                    : r.nav === 'tep' ? `/${data.workspaceId}/mc/tep`
                                        : r.nav === 'members' ? `/${data.workspaceId}/mc/members` : undefined
                    const icon = <RailIcon icon={r.icon} active={r.active} title={r.title} />
                    return (
                        <div key={i} style={{ display: 'contents' }}>
                            {r.divider && <div style={{ width: 28, height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 0' }} />}
                            {href ? <Link href={href}>{icon}</Link> : icon}
                        </div>
                    )
                })}
                <div style={{ flex: 1 }} />
                {/* [M1 interactivity] Back to Giao diện 1 — clears the ui-pref cookie first. */}
                <McBackLink backHref={data.backHref} />
                <RailIcon icon={Settings} />
            </div>

            {/* Main */}
            <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                {/* Top bar */}
                <div style={{ position: 'relative', zIndex: 60, height: 64, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '0 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(10,10,10,0.50)', backdropFilter: 'blur(10px)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.35)' }}>
                        <LayoutGrid style={{ width: 14, height: 14, color: '#A5B4FC' }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#F4F4F5', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.workspaceName}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 10, letterSpacing: '0.16em', color: '#71717A' }}>WORKSPACE / DASHBOARD</span>
                        <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: '#F4F4F5' }}>{data.greeting || 'Chào'}, {data.greetingName}.</span>
                    </div>
                    <div style={{ flex: 1 }} />
                    {/* [M1 interactivity] Client cluster: ⌘K palette + Add Task modal. */}
                    <McTopbarActions
                        workspaceId={data.workspaceId}
                        backHref={data.backHref}
                        addTask={data.addTask}
                        userRole={data.userRole}
                    />
                </div>

                {/* KPI ribbon */}
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'stretch', gap: 10, padding: '14px 24px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 12, background: card, backdropFilter: 'blur(12px)', border: cardBorder }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Gross Revenue</span>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                                <span style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{fmtVND(kpi.grossRevenueVND)}</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA' }}>đ</span>
                            </div>
                        </div>
                        {sp.line && (
                            <svg viewBox="0 0 80 26" style={{ width: 80, height: 26 }}>
                                <path d={sp.area} fill="rgba(16,185,129,0.15)" />
                                <path d={sp.line} stroke="#10B981" strokeWidth="1.6" fill="none" strokeLinecap="round" />
                            </svg>
                        )}
                    </div>
                    <Kpi label="Total Tasks"><span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{kpi.totalTasks}</span>{kpi.totalTasksDelta > 0 && <span style={{ fontSize: 11, color: '#71717A', whiteSpace: 'nowrap' }}>+{kpi.totalTasksDelta} tháng này</span>}</Kpi>
                    <Kpi label="Đang chạy"><span style={{ fontSize: 18, fontWeight: 800, color: '#FBBF24' }}>{kpi.running}</span>{kpi.overdue > 0 && <span style={{ fontSize: 11, color: '#71717A', whiteSpace: 'nowrap' }}>{kpi.overdue} quá hạn</span>}</Kpi>
                    <Kpi label="Hoàn tất"><span style={{ fontSize: 18, fontWeight: 800, color: '#34D399' }}>{kpi.completed}</span><span style={{ fontSize: 11, color: '#71717A', whiteSpace: 'nowrap' }}>tháng này</span></Kpi>
                    <Kpi label="Total Clients"><span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{kpi.totalClients}</span>{kpi.clientsNew > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: '#34D399' }}>▲ +{kpi.clientsNew}</span>}</Kpi>
                    <div style={{ flex: 1 }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderRadius: 12, border: '1px dashed rgba(255,255,255,0.12)', color: '#71717A', fontSize: 11 }}>
                        <Maximize2 style={{ width: 13, height: 13 }} /><span>Click chip → panel chi tiết</span>
                    </div>
                </div>

                {/* Board */}
                <div style={{ flex: 1, display: 'flex', gap: 10, padding: '16px 24px 8px', minHeight: 0 }}>
                    {data.columns.map((col) => <Column key={col.label} col={col} workspaceId={data.workspaceId} />)}
                </div>

                {/* Board footer */}
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 24px 14px' }}>
                    <span style={{ fontSize: 11, color: '#71717A' }}>14 trạng thái gốc giữ nguyên trên thẻ (nhóm theo phase) — 6 cột như bảng admin hiện tại</span>
                    <Link href={`/${data.workspaceId}/admin/queue`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.25)', color: '#C084FC', fontSize: 11, fontWeight: 600 }}>
                        <Inbox style={{ width: 12, height: 12 }} /><span>Chờ giao · {data.waitingCount} — mở Kho Task Đợi</span>
                    </Link>
                    <div style={{ flex: 1 }} />
                    <Link href={`/${data.workspaceId}/admin/cancelled`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: 'rgba(82,82,91,0.10)', border: '1px solid rgba(82,82,91,0.30)', color: '#A1A1AA', fontSize: 11, fontWeight: 600 }}>
                        <Archive style={{ width: 12, height: 12 }} /><span>Đã hủy / lưu trữ · {data.cancelledCount} — Khôi phục</span>
                    </Link>
                </div>
            </div>

            {/* Right utility panel */}
            <div style={{ position: 'relative', width: 292, flexShrink: 0, background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(20px)', borderLeft: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', padding: 14, gap: 14, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -50, right: -50, width: 160, height: 160, borderRadius: 999, background: 'rgba(250,204,21,0.05)', filter: 'blur(32px)', pointerEvents: 'none' }} />
                <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8, borderRadius: 10, background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.30)', color: '#A5B4FC' }}><Trophy style={{ width: 15, height: 15, filter: 'drop-shadow(0 0 8px rgba(250,204,21,0.5))' }} /></div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, borderRadius: 10, color: '#A1A1AA' }}><Users style={{ width: 15, height: 15 }} /></div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, borderRadius: 10, color: '#A1A1AA' }}><Inbox style={{ width: 15, height: 15 }} /></div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, color: '#71717A' }}><ChevronsRight style={{ width: 14, height: 14 }} /></div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#71717A' }}>Bảng Xếp Hạng Tháng</span>
                    {data.leaderboard.length === 0 && <div style={{ fontSize: 11, color: '#52525B' }}>Chưa có dữ liệu xếp hạng.</div>}
                    {data.leaderboard.map((p) => p.top ? (
                        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, background: 'linear-gradient(180deg,rgba(234,179,8,0.10),rgba(234,179,8,0.02))', border: '1px solid rgba(250,204,21,0.25)' }}>
                            <div style={{ position: 'relative', width: 34, height: 34, borderRadius: 999, background: p.avatar, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', boxShadow: '0 0 18px rgba(234,179,8,0.5)' }}>{p.initials}<span style={{ position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)', color: '#FACC15' }}><Crown style={{ width: 12, height: 12, filter: 'drop-shadow(0 0 6px rgba(250,204,21,0.7))' }} /></span></div>
                            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 700, color: '#F4F4F5' }}>{p.name}</div><div style={{ fontSize: 10, color: '#A1A1AA' }}>{p.sub}</div></div>
                            <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11, fontWeight: 800, color: p.rankColor, border: `1px solid ${p.rankColor}66`, borderRadius: 6, padding: '1px 7px' }}>{p.rank}</span>
                        </div>
                    ) : (
                        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ width: 30, height: 30, borderRadius: 999, background: p.avatar, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff' }}>{p.initials}</div>
                            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 700, color: '#F4F4F5' }}>{p.name}</div><div style={{ fontSize: 10, color: '#A1A1AA' }}>{p.sub}</div></div>
                            <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11, fontWeight: 800, color: p.rankColor, border: `1px solid ${p.rankColor}66`, borderRadius: 6, padding: '1px 7px' }}>{p.rank}</span>
                        </div>
                    ))}
                    <Link href={`/${data.workspaceId}/admin/analytics`} style={{ fontSize: 11, fontWeight: 600, color: '#A5B4FC' }}>Xem đầy đủ bảng xếp hạng</Link>
                </div>

                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#71717A' }}>Clients · {data.clientsTotal}</span><Link href={`/${data.workspaceId}/admin/crm`} style={{ fontSize: 11, color: '#A5B4FC' }}>Quản lý</Link></div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {data.clients.map((c, i) => (
                            <span key={c + i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 11, color: '#D4D4D8' }}><span style={{ width: 13, height: 13, borderRadius: 999, background: clientDot(c) }} />{c}</span>
                        ))}
                        {data.clientsTotal > data.clients.length && <span style={{ padding: '4px 9px', borderRadius: 999, background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.12)', fontSize: 11, color: '#71717A' }}>+{data.clientsTotal - data.clients.length}</span>}
                    </div>
                </div>

                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#71717A' }}>Yêu cầu mới</span><Link href={`/${data.workspaceId}/admin/requests`} style={{ fontSize: 11, color: '#A5B4FC' }}>Hộp thư</Link></div>
                    <Link href={`/${data.workspaceId}/admin/requests`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', color: '#A1A1AA', fontSize: 11 }}>
                        <Inbox style={{ width: 13, height: 13 }} /><span>Mở hộp thư yêu cầu khách</span>
                    </Link>
                </div>
            </div>
        </div>
    )
}
