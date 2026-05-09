"use client"

import { useState, useRef, useEffect } from "react"
import { Search, ChevronDown, Loader2, ArrowRightLeft, Check, Plus } from "lucide-react"
import { NotificationBell } from "@/components/notifications/NotificationBell"
import { MarketplaceTriggerButton } from "@/components/marketplace/MarketplaceTriggerButton"
import CreateProfileModal from "@/components/workspace/CreateProfileModal"

interface ProfileItem {
    id: string
    name: string
    logoUrl?: string | null
}

interface UserHomeTopBarProps {
    workspaceName: string
    displayName: string
    initials: string
    workspaceId: string
    userRole: string
    /** All profiles user can access — for switcher dropdown */
    profiles: ProfileItem[]
    /** Currently active profile id */
    currentProfileId: string | null
    /** Whether current user can switch to admin view (workspace OWNER/ADMIN or global admin) */
    canSwitchToAdmin?: boolean
    /** Optional avatar url (square image, will be circle-cropped) */
    avatarUrl?: string | null
}

const GRADIENT_POOL = [
    "from-[#8B5CF6] to-[#6366F1]",
    "from-emerald-500 to-cyan-500",
    "from-amber-500 to-red-500",
    "from-pink-500 to-rose-500",
    "from-sky-500 to-indigo-500",
]

/**
 * UserHomeTopBar — top bar for User dashboard, mirrors `DashboardTopBar` layout but
 * tailored cho USER view per Figma HOME-USER-VER-1.0.
 *
 * Layout:
 *   [Workspace name | Welcome back, {displayName} 👋]
 *                                              [Search] [<NotificationBell/>] [profile-pill ▾]
 *
 * Profile pill dropdown bao gồm (giống admin):
 *   - Profiles picker (list + click → switch profile + redirect to first workspace)
 *   - Switch to Admin View (nếu eligible)
 *   - Profile settings
 *   - Log out
 */
export default function UserHomeTopBar({
    workspaceName,
    displayName,
    initials,
    workspaceId,
    userRole,
    profiles,
    currentProfileId,
    canSwitchToAdmin = false,
    avatarUrl,
}: UserHomeTopBarProps) {
    const [open, setOpen] = useState(false)
    const [switching, setSwitching] = useState(false)
    const [searchOpen, setSearchOpen] = useState(false)
    const [searchValue, setSearchValue] = useState("")
    const [showCreateProfile, setShowCreateProfile] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const searchRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setSearchOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    // Search input dispatches custom event so UserWorkflowTabs (or other consumers) can subscribe.
    useEffect(() => {
        const handler = setTimeout(() => {
            window.dispatchEvent(new CustomEvent("user-home-search", { detail: searchValue }))
        }, 200)
        return () => clearTimeout(handler)
    }, [searchValue])

    const handleProfileSwitch = async (newProfileId: string) => {
        if (newProfileId === currentProfileId || switching) return
        setSwitching(true)
        try {
            await fetch("/api/profile/select", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ profileId: newProfileId }),
            })
            // Auto view-switch: API returns view based on user's role in target profile.
            // OWNER/ADMIN → /admin, otherwise → /dashboard.
            const res = await fetch(`/api/workspace/first?profileId=${newProfileId}`)
            const { workspaceId: newWsId, view } = await res.json()
            const targetView = view === "admin" ? "admin" : "dashboard"
            window.location.href = newWsId ? `/${newWsId}/${targetView}` : "/login"
        } catch {
            setSwitching(false)
        }
    }

    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6 px-1 pb-2 pt-2">
            {/* ---- Left: Workspace + welcome ---- */}
            <div className="min-w-0 flex flex-col">
                <h1
                    className="font-extrabold leading-tight tracking-tight text-white truncate text-[28px] sm:text-[40px]"
                    style={{
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        letterSpacing: "-0.02em",
                    }}
                >
                    {workspaceName}
                </h1>
                <p
                    className="mt-1.5"
                    style={{
                        fontSize: 13,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        color: "#A1A1AA",
                    }}
                >
                    Welcome back, <span className="text-zinc-300">{displayName}</span> <span aria-hidden>👋</span>
                </p>
            </div>

            {/* ---- Right: Actions row ---- */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 flex-wrap">
                {/* Search button — toggles input row inside top-bar */}
                <div className="relative" ref={searchRef}>
                    {searchOpen ? (
                        <div
                            className="flex items-center w-[180px] sm:w-[260px]"
                            style={{
                                gap: 8,
                                padding: "10px 14px",
                                borderRadius: 26,
                                border: "1px solid rgba(139,92,246,0.15)",
                                background: "#0A0A0A",
                            }}
                        >
                            <Search size={16} style={{ color: "#A1A1AA", flexShrink: 0 }} />
                            <input
                                autoFocus
                                value={searchValue}
                                onChange={(e) => setSearchValue(e.target.value)}
                                placeholder="Search tasks…"
                                className="flex-1 outline-none border-none bg-transparent"
                                style={{
                                    color: "#FFFFFF",
                                    fontSize: 13,
                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                }}
                            />
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setSearchOpen(true)}
                            className="flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-200"
                            style={{
                                border: "1px solid rgba(139,92,246,0.15)",
                                background: "transparent",
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = "#211B31"
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = "transparent"
                            }}
                            aria-label="Search"
                        >
                            <Search size={18} strokeWidth={2} style={{ color: "#A1A1AA" }} />
                        </button>
                    )}
                </div>

                {/* Marketplace trigger — replaces old floating bottom-right button */}
                <MarketplaceTriggerButton />

                {/* Notification bell — real component với badge + dropdown panel */}
                <NotificationBell />

                {/* Profile pill + dropdown */}
                <div className="relative" ref={dropdownRef}>
                    <button
                        type="button"
                        onClick={() => setOpen((prev) => !prev)}
                        disabled={switching}
                        className="flex items-center gap-2.5 py-1.5 pl-1.5 pr-3.5 transition-colors duration-200"
                        style={{
                            borderRadius: 26,
                            border: "1px solid rgba(139,92,246,0.15)",
                            background: "transparent",
                            opacity: switching ? 0.6 : 1,
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#211B31"
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent"
                        }}
                    >
                        <span className="flex h-9 w-9 items-center justify-center rounded-full overflow-hidden bg-gradient-to-br from-[#8B5CF6] to-[#6366F1] text-xs font-bold text-white">
                            {switching ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                                initials
                            )}
                        </span>

                        <div className="flex flex-col items-start leading-tight">
                            <span
                                className="text-sm font-semibold text-zinc-200"
                                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                            >
                                {displayName}
                            </span>
                            <span
                                className="text-[10px] font-bold uppercase tracking-[0.12em]"
                                style={{ color: "#A1A1AA" }}
                            >
                                {userRole}
                            </span>
                        </div>

                        <ChevronDown
                            size={14}
                            className="transition-transform duration-200"
                            style={{
                                color: "#A1A1AA",
                                transform: open ? "rotate(180deg)" : "rotate(0deg)",
                            }}
                        />
                    </button>

                    {open && !switching && (
                        <div
                            className="absolute right-0 top-full z-50 mt-2 w-[300px] p-2"
                            style={{
                                borderRadius: 16,
                                border: "1px solid rgba(139,92,246,0.15)",
                                background: "#0A0A0A",
                                boxShadow:
                                    "0 16px 48px rgba(0,0,0,0.50), 0 0 40px rgba(139,92,246,0.06)",
                            }}
                        >
                            {/* ─── Profiles picker ─── */}
                            {profiles.length > 0 && (
                                <>
                                    <p
                                        className="mb-1 px-2 pt-1 text-[10px] font-semibold uppercase tracking-widest"
                                        style={{
                                            color: "#71717A",
                                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                                        }}
                                    >
                                        Profiles
                                    </p>
                                    <ul className="flex flex-col gap-0.5">
                                        {profiles.map((profile, idx) => {
                                            const isActive = profile.id === currentProfileId
                                            const gradient = GRADIENT_POOL[idx % GRADIENT_POOL.length]
                                            const profileInitials = profile.name
                                                .split(/\s+/)
                                                .map((w) => w[0])
                                                .join("")
                                                .toUpperCase()
                                                .slice(0, 2)

                                            return (
                                                <li key={profile.id}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleProfileSwitch(profile.id)}
                                                        className="flex w-full items-center gap-2.5 px-2 py-2 text-left transition-colors duration-200"
                                                        style={{
                                                            borderRadius: 12,
                                                            background: isActive
                                                                ? "rgba(139,92,246,0.12)"
                                                                : "transparent",
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            if (!isActive) {
                                                                e.currentTarget.style.background =
                                                                    "rgba(255,255,255,0.04)"
                                                            }
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            if (!isActive) {
                                                                e.currentTarget.style.background = "transparent"
                                                            }
                                                        }}
                                                    >
                                                        <span
                                                            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${gradient} text-[11px] font-bold text-white overflow-hidden`}
                                                        >
                                                            {profile.logoUrl ? (
                                                                // eslint-disable-next-line @next/next/no-img-element
                                                                <img
                                                                    src={profile.logoUrl}
                                                                    alt=""
                                                                    className="h-8 w-8 object-cover"
                                                                />
                                                            ) : (
                                                                profileInitials
                                                            )}
                                                        </span>

                                                        <div className="flex flex-col overflow-hidden">
                                                            <span
                                                                className="truncate text-sm font-medium text-zinc-100"
                                                                style={{
                                                                    fontFamily:
                                                                        "'Plus Jakarta Sans', sans-serif",
                                                                }}
                                                            >
                                                                {profile.name}
                                                            </span>
                                                            <span
                                                                className="truncate text-[11px]"
                                                                style={{ color: "#71717A" }}
                                                            >
                                                                {isActive ? "Active" : "Switch to this profile"}
                                                            </span>
                                                        </div>

                                                        {isActive && (
                                                            <Check
                                                                size={14}
                                                                className="ml-auto flex-shrink-0"
                                                                style={{ color: "#8B5CF6" }}
                                                            />
                                                        )}
                                                    </button>
                                                </li>
                                            )
                                        })}
                                    </ul>

                                    <div
                                        className="h-px my-1.5 mx-1"
                                        style={{ background: "rgba(255,255,255,0.06)" }}
                                    />
                                </>
                            )}

                            {/* ─── Create new profile (full CreateProfileModal flow) ─── */}
                            <button
                                type="button"
                                onClick={() => {
                                    setOpen(false)
                                    setShowCreateProfile(true)
                                }}
                                className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-150 rounded-lg"
                                style={{
                                    color: "#A78BFA",
                                    background: "transparent",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = "rgba(139,92,246,0.08)"
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "transparent"
                                }}
                            >
                                <Plus size={14} style={{ color: "#A78BFA" }} />
                                <span
                                    className="text-sm font-semibold"
                                    style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                                >
                                    Tạo Profile mới
                                </span>
                            </button>

                            {/* ─── Switch to Admin View (eligible only) ─── */}
                            {canSwitchToAdmin && (
                                <>
                                    <div
                                        className="h-px my-1 mx-1"
                                        style={{ background: "rgba(255,255,255,0.06)" }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            window.location.href = `/${workspaceId}/admin`
                                        }}
                                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-150 rounded-lg"
                                        style={{
                                            color: "#E4E4E7",
                                            background: "transparent",
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = "rgba(255,255,255,0.04)"
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = "transparent"
                                        }}
                                    >
                                        <ArrowRightLeft size={14} style={{ color: "#A1A1AA" }} />
                                        <span
                                            className="text-sm"
                                            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                                        >
                                            Switch to Admin View
                                        </span>
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Create Profile Modal (rendered at top-bar level, above sidebar) ─── */}
            <CreateProfileModal
                open={showCreateProfile}
                onClose={() => setShowCreateProfile(false)}
            />
        </div>
    )
}
