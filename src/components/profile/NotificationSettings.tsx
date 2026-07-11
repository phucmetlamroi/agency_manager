"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Loader2, Bell, Mail, Clock, Moon, Zap, CalendarClock, MailX, Save } from "lucide-react"
import {
    getMyNotificationPreferences,
    updateMyNotificationPreferences,
} from "@/actions/notification-actions"

/* ── Types ── */
type DigestMode = "REALTIME" | "HOURLY" | "DAILY" | "OFF"

interface Prefs {
    emailEnabled: boolean
    emailDigestMode: string
    quietHoursStart: number | null
    quietHoursEnd: number | null
}

/* ── Digest mode config ── */
const DIGEST_MODES: { value: DigestMode; label: string; desc: string; icon: any }[] = [
    { value: "REALTIME", label: "Realtime", desc: "Gửi ngay khi offline", icon: Zap },
    { value: "HOURLY", label: "Hằng giờ", desc: "Tổng hợp mỗi giờ", icon: Clock },
    { value: "DAILY", label: "Hằng ngày", desc: "Tổng hợp mỗi ngày (8h sáng)", icon: CalendarClock },
    { value: "OFF", label: "Tắt", desc: "Không gửi email", icon: MailX },
]

/* ── Generate hour options ── */
const HOURS = Array.from({ length: 24 }, (_, i) => ({
    value: i,
    label: `${i.toString().padStart(2, "0")}:00`,
}))

/* ── Component ── */
export default function NotificationSettings() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [emailEnabled, setEmailEnabled] = useState(true)
    const [digestMode, setDigestMode] = useState<DigestMode>("REALTIME")
    const [quietStart, setQuietStart] = useState<number | null>(null)
    const [quietEnd, setQuietEnd] = useState<number | null>(null)
    const [quietEnabled, setQuietEnabled] = useState(false)
    const [hasChanges, setHasChanges] = useState(false)

    // Track original values for dirty-check
    const [original, setOriginal] = useState<Prefs | null>(null)

    useEffect(() => {
        getMyNotificationPreferences().then((res) => {
            if (res.data) {
                const d = res.data
                setEmailEnabled(d.emailEnabled)
                setDigestMode(d.emailDigestMode as DigestMode)
                setQuietStart(d.quietHoursStart)
                setQuietEnd(d.quietHoursEnd)
                setQuietEnabled(d.quietHoursStart !== null && d.quietHoursEnd !== null)
                setOriginal({
                    emailEnabled: d.emailEnabled,
                    emailDigestMode: d.emailDigestMode,
                    quietHoursStart: d.quietHoursStart,
                    quietHoursEnd: d.quietHoursEnd,
                })
            }
            setLoading(false)
        })
    }, [])

    // Dirty-check
    useEffect(() => {
        if (!original) return
        const qStart = quietEnabled ? (quietStart ?? 22) : null
        const qEnd = quietEnabled ? (quietEnd ?? 7) : null
        const changed =
            emailEnabled !== original.emailEnabled ||
            digestMode !== original.emailDigestMode ||
            qStart !== original.quietHoursStart ||
            qEnd !== original.quietHoursEnd
        setHasChanges(changed)
    }, [emailEnabled, digestMode, quietStart, quietEnd, quietEnabled, original])

    async function handleSave() {
        setSaving(true)
        try {
            const qStart = quietEnabled ? (quietStart ?? 22) : null
            const qEnd = quietEnabled ? (quietEnd ?? 7) : null
            const res = await updateMyNotificationPreferences({
                emailEnabled,
                emailDigestMode: digestMode,
                quietHoursStart: qStart,
                quietHoursEnd: qEnd,
            })
            if (res.error) {
                toast.error(res.error)
            } else {
                toast.success("Đã cập nhật tùy chọn thông báo!")
                setOriginal({
                    emailEnabled,
                    emailDigestMode: digestMode,
                    quietHoursStart: qStart,
                    quietHoursEnd: qEnd,
                })
                setHasChanges(false)
            }
        } catch {
            toast.error("Lỗi khi lưu tùy chọn")
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="relative overflow-hidden rounded-2xl border border-violet-500/20 bg-violet-500/5 backdrop-blur-md shadow-xl shadow-black/30">
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
                </div>
            </div>
        )
    }

    return (
        <div className="relative overflow-hidden rounded-2xl border border-violet-500/20 bg-violet-500/5 backdrop-blur-md shadow-xl shadow-black/30">
            {/* Glow */}
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-violet-500/6 blur-3xl rounded-full pointer-events-none" />

            <div className="relative z-10">
                {/* ── Header ── */}
                <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                        <Bell className="w-4 h-4 text-violet-400" />
                    </div>
                    <div>
                        <h3 className="font-bold text-zinc-200 text-sm">Thông báo qua Email</h3>
                        <p className="text-muted-foreground text-xs">Cài đặt cách bạn nhận thông báo khi đang offline.</p>
                    </div>
                </div>

                {/* ── Content ── */}
                <div className="px-6 py-5 space-y-6">

                    {/* ─── Master Toggle ─── */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/15 flex items-center justify-center">
                                <Mail className="w-4 h-4 text-violet-400" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-zinc-200">Nhận thông báo qua email</p>
                                <p className="text-xs text-muted-foreground">Gửi email khi bạn không online</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setEmailEnabled(!emailEnabled)}
                            className={`relative w-12 h-[26px] rounded-full transition-all duration-300 cursor-pointer ${
                                emailEnabled
                                    ? "bg-violet-600 shadow-[0_0_12px_rgba(139,92,246,0.4)]"
                                    : "bg-zinc-800 border border-white/10"
                            }`}
                        >
                            <span
                                className={`absolute top-[3px] w-5 h-5 rounded-full transition-all duration-300 shadow-md ${
                                    emailEnabled
                                        ? "left-[26px] bg-white"
                                        : "left-[3px] bg-zinc-500"
                                }`}
                            />
                        </button>
                    </div>

                    {/* ─── Digest Mode ─── */}
                    {emailEnabled && (
                        <div className="space-y-3">
                            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                                Chế độ gửi email
                            </p>
                            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                                {DIGEST_MODES.map(({ value, label, desc, icon: Icon }) => {
                                    const active = digestMode === value
                                    return (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() => setDigestMode(value)}
                                            className={`group relative flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                                                active
                                                    ? "border-violet-500/40 bg-violet-500/10 shadow-[0_0_20px_rgba(139,92,246,0.08)]"
                                                    : "border-white/5 bg-zinc-900/40 hover:border-white/10 hover:bg-zinc-900/60"
                                            }`}
                                        >
                                            {/* Radio dot */}
                                            <div
                                                className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                                    active
                                                        ? "border-violet-500 bg-violet-500/20"
                                                        : "border-zinc-700 bg-transparent"
                                                }`}
                                            >
                                                {active && (
                                                    <div className="w-2 h-2 rounded-full bg-violet-400" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <Icon
                                                        className={`w-3.5 h-3.5 ${
                                                            active ? "text-violet-400" : "text-muted-foreground"
                                                        }`}
                                                    />
                                                    <span
                                                        className={`text-sm font-semibold ${
                                                            active ? "text-violet-300" : "text-zinc-400"
                                                        }`}
                                                    >
                                                        {label}
                                                    </span>
                                                </div>
                                                <p className="text-caption text-muted-foreground mt-0.5">{desc}</p>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* ─── Quiet Hours ─── */}
                    {emailEnabled && digestMode !== "OFF" && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Moon className="w-3.5 h-3.5 text-muted-foreground" />
                                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                                        Giờ im lặng
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setQuietEnabled(!quietEnabled)
                                        if (!quietEnabled) {
                                            setQuietStart(22)
                                            setQuietEnd(7)
                                        }
                                    }}
                                    className={`relative w-10 h-[22px] rounded-full transition-all duration-300 cursor-pointer ${
                                        quietEnabled
                                            ? "bg-violet-600/80 shadow-[0_0_8px_rgba(139,92,246,0.3)]"
                                            : "bg-zinc-800 border border-white/10"
                                    }`}
                                >
                                    <span
                                        className={`absolute top-[3px] w-4 h-4 rounded-full transition-all duration-300 shadow-sm ${
                                            quietEnabled
                                                ? "left-[22px] bg-white"
                                                : "left-[3px] bg-zinc-600"
                                        }`}
                                    />
                                </button>
                            </div>

                            {quietEnabled && (
                                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-zinc-900/50 border border-white/5">
                                    <div className="flex items-center gap-2 flex-1">
                                        <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">Từ</span>
                                        <select
                                            value={quietStart ?? 22}
                                            onChange={(e) => setQuietStart(Number(e.target.value))}
                                            className="flex-1 bg-zinc-800/80 border border-white/8 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-violet-500/40 transition-colors cursor-pointer appearance-none"
                                        >
                                            {HOURS.map((h) => (
                                                <option key={h.value} value={h.value}>
                                                    {h.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <span className="text-zinc-700 text-sm">—</span>
                                    <div className="flex items-center gap-2 flex-1">
                                        <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">Đến</span>
                                        <select
                                            value={quietEnd ?? 7}
                                            onChange={(e) => setQuietEnd(Number(e.target.value))}
                                            className="flex-1 bg-zinc-800/80 border border-white/8 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-violet-500/40 transition-colors cursor-pointer appearance-none"
                                        >
                                            {HOURS.map((h) => (
                                                <option key={h.value} value={h.value}>
                                                    {h.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {quietEnabled && (
                                <p className="text-caption text-muted-foreground px-1">
                                    Không gửi email trong khoảng thời gian này (UTC+7). Thông báo vẫn được lưu và gửi sau.
                                </p>
                            )}
                        </div>
                    )}

                    {/* ─── Info hint when OFF ─── */}
                    {emailEnabled && digestMode === "OFF" && (
                        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-900/40 border border-white/5">
                            <MailX className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-muted-foreground">
                                Bạn sẽ chỉ nhận thông báo trong ứng dụng. Không có email nào được gửi.
                            </p>
                        </div>
                    )}

                    {/* ─── Disabled info ─── */}
                    {!emailEnabled && (
                        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-900/40 border border-white/5">
                            <MailX className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-muted-foreground">
                                Thông báo email đã tắt. Bạn bật để nhận email khi có tin nhắn, mention, hoặc task mới.
                            </p>
                        </div>
                    )}
                </div>

                {/* ── Footer ── */}
                <div className="px-6 pb-5 flex justify-end">
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving || !hasChanges}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-500 hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100 text-white font-bold text-sm rounded-xl shadow-lg shadow-violet-500/20 transition-all active:scale-[0.98] cursor-pointer"
                    >
                        {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        Lưu thay đổi
                    </button>
                </div>
            </div>
        </div>
    )
}
