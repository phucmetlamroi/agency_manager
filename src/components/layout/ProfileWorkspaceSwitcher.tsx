"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import {
    ChevronDown,
    Check,
    Users,
    Briefcase,
    Layers,
    Plus,
} from "lucide-react"
import CreateWorkspaceModal from "@/components/workspace/CreateWorkspaceModal"
import { getMyProfilesAndWorkspaces } from "@/actions/profile-actions"
import { getWorkspacesForProfile } from "@/actions/workspace-actions"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

/* ── Types ── */
interface ProfileItem {
    id: string
    name: string
    userCount: number
    workspaceCount: number
}

interface WorkspaceItem {
    id: string
    name: string
    description: string | null
}

interface Props {
    workspaceId: string
    collapsed?: boolean
    /** Which view the user is on — determines navigation target after switch */
    viewRole?: "ADMIN" | "USER"
}

/* ── Palette (matches AppSidebar) ── */
const FONT = "'Plus Jakarta Sans', sans-serif"
const DIVIDER = "rgba(255,255,255,0.06)"
const BORDER = "rgba(139,92,246,0.15)"
const DROPDOWN_BG = "#0A0A0A"
const HOVER_BG = "#211B31"
const ACTIVE_BG = "rgba(139,92,246,0.12)"
const ACCENT = "#8B5CF6"
const MUTED = "#71717A"
const MUTED_LIGHT = "#A1A1AA"

export function ProfileWorkspaceSwitcher({ workspaceId, collapsed = false, viewRole = "USER" }: Props) {
    const router = useRouter()
    const pathname = usePathname()
    const [open, setOpen] = useState(false)
    const [switching, setSwitching] = useState(false)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const [profiles, setProfiles] = useState<ProfileItem[]>([])
    const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([])
    const [currentProfileId, setCurrentProfileId] = useState<string | null>(null)

    // Load data on mount
    useEffect(() => {
        getMyProfilesAndWorkspaces().then((data) => {
            setProfiles(data.profiles)
            setWorkspaces(data.workspaces)
            setCurrentProfileId(data.currentProfileId)
        })
    }, [])

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        if (open) document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [open])

    // Derived
    const currentProfile = profiles.find((p) => p.id === currentProfileId)
    const currentWorkspace = workspaces.find((ws) => ws.id === workspaceId)

    // ── Profile switch: re-sign JWT via API, then reload ──
    const handleProfileSwitch = async (profileId: string) => {
        if (profileId === currentProfileId) return
        setSwitching(true)
        try {
            const res = await fetch("/api/profile/select", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ profileId }),
            })
            const data = await res.json()
            if (!data.success) {
                toast.error(data.error || "Khong the chuyen profile")
                return
            }
            toast.success(`Đã chuyển sang ${profiles.find(p => p.id === profileId)?.name || 'profile mới'}`)
            setOpen(false)

            // After profile switch, navigate to the first workspace of the new profile.
            // The cookie is already updated by the API response, so server actions
            // will use the new session.
            try {
                const newWorkspaces = await getWorkspacesForProfile(profileId)
                const firstWs = newWorkspaces?.[0]
                if (firstWs) {
                    const basePath = viewRole === "ADMIN" ? "admin" : "dashboard"
                    window.location.href = `/${firstWs.id}/${basePath}`
                    return
                }
            } catch { /* fallback below */ }

            // Fallback: reload current page (will redirect if workspace doesn't belong to profile)
            window.location.href = viewRole === "ADMIN" ? `/${workspaceId}/admin` : `/${workspaceId}/dashboard`
        } catch {
            toast.error("Loi khi chuyen profile")
        } finally {
            setSwitching(false)
        }
    }

    // ── Workspace switch: simple navigation ──
    const handleWorkspaceSwitch = (newWsId: string) => {
        if (newWsId === workspaceId) {
            setOpen(false)
            return
        }
        setOpen(false)
        const basePath = viewRole === "ADMIN" ? "admin" : "dashboard"
        router.push(`/${newWsId}/${basePath}`)
    }

    const handleOpenCreateModal = () => {
        setOpen(false)
        setShowCreateModal(true)
    }

    // Don't render if no data yet
    if (profiles.length === 0 && workspaces.length === 0) return null

    // ── Collapsed mode: icon only ──
    if (collapsed) {
        return (
            <>
                <div ref={dropdownRef} className="relative flex justify-center px-3 py-2">
                    <button
                        onClick={() => setOpen(!open)}
                        className="w-[46px] h-[46px] rounded-full flex items-center justify-center transition-colors cursor-pointer"
                        style={{
                            background: open ? ACTIVE_BG : "transparent",
                            border: `1px solid ${open ? ACCENT : "transparent"}`,
                        }}
                        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = HOVER_BG }}
                        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "transparent" }}
                    >
                        <Layers size={18} style={{ color: ACCENT }} />
                    </button>

                    <AnimatePresence>
                        {open && (
                            <SwitcherDropdown
                                profiles={profiles}
                                workspaces={workspaces}
                                currentProfileId={currentProfileId}
                                workspaceId={workspaceId}
                                switching={switching}
                                onProfileSwitch={handleProfileSwitch}
                                onWorkspaceSwitch={handleWorkspaceSwitch}
                                onCreateWorkspace={handleOpenCreateModal}
                                align="right"
                            />
                        )}
                    </AnimatePresence>
                </div>
                <CreateWorkspaceModal open={showCreateModal} onClose={() => setShowCreateModal(false)} />
            </>
        )
    }

    // ── Expanded mode ──
    return (
        <div ref={dropdownRef} className="relative px-4 py-2">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-2.5 py-2.5 px-3.5 transition-colors cursor-pointer"
                style={{
                    borderRadius: 14,
                    border: `1px solid ${BORDER}`,
                    background: open ? HOVER_BG : "transparent",
                    fontFamily: FONT,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = HOVER_BG }}
                onMouseLeave={(e) => { e.currentTarget.style.background = open ? HOVER_BG : "transparent" }}
            >
                {/* Icon */}
                <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(139,92,246,0.15)" }}
                >
                    <Layers size={15} style={{ color: ACCENT }} />
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0 text-left">
                    <div
                        className="text-[11px] font-bold truncate"
                        style={{ color: MUTED_LIGHT, fontFamily: FONT }}
                    >
                        {currentProfile?.name || "Profile"}
                    </div>
                    <div
                        className="text-[13px] font-semibold truncate"
                        style={{ color: "#E4E4E7", fontFamily: FONT }}
                    >
                        {currentWorkspace?.name || "Workspace"}
                    </div>
                </div>

                {/* Chevron */}
                <ChevronDown
                    size={14}
                    className="transition-transform duration-200 flex-shrink-0"
                    style={{
                        color: MUTED,
                        transform: open ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                />
            </button>

            <AnimatePresence>
                {open && (
                    <SwitcherDropdown
                        profiles={profiles}
                        workspaces={workspaces}
                        currentProfileId={currentProfileId}
                        workspaceId={workspaceId}
                        switching={switching}
                        onProfileSwitch={handleProfileSwitch}
                        onWorkspaceSwitch={handleWorkspaceSwitch}
                        onCreateWorkspace={handleOpenCreateModal}
                        align="left"
                    />
                )}
            </AnimatePresence>
            <CreateWorkspaceModal open={showCreateModal} onClose={() => setShowCreateModal(false)} />
        </div>
    )
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Dropdown panel (shared between collapsed and expanded modes)         */
/* ────────────────────────────────────────────────────────────────────── */

function SwitcherDropdown({
    profiles,
    workspaces,
    currentProfileId,
    workspaceId,
    switching,
    onProfileSwitch,
    onWorkspaceSwitch,
    onCreateWorkspace,
    align,
}: {
    profiles: ProfileItem[]
    workspaces: WorkspaceItem[]
    currentProfileId: string | null
    workspaceId: string
    switching: boolean
    onProfileSwitch: (id: string) => void
    onWorkspaceSwitch: (id: string) => void
    onCreateWorkspace: () => void
    align: "left" | "right"
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={cn(
                "absolute top-full z-50 mt-2 w-[260px] overflow-hidden",
                align === "right" ? "left-full ml-2 -top-2" : "left-0"
            )}
            style={{
                borderRadius: 16,
                border: `1px solid ${BORDER}`,
                background: DROPDOWN_BG,
                boxShadow: "0 16px 48px rgba(0,0,0,0.50), 0 0 40px rgba(139,92,246,0.06)",
                fontFamily: FONT,
            }}
        >
            {/* ── Profiles Section ── */}
            {profiles.length > 1 && (
                <div className="p-2">
                    <p
                        className="px-2.5 pb-2 pt-1.5 text-[10px] font-bold uppercase tracking-[0.08em] flex items-center gap-1.5"
                        style={{ color: MUTED }}
                    >
                        <Users size={11} />
                        Profile / Team
                    </p>
                    {profiles.map((profile) => {
                        const isActive = profile.id === currentProfileId
                        return (
                            <button
                                key={profile.id}
                                type="button"
                                disabled={switching}
                                onClick={() => onProfileSwitch(profile.id)}
                                className="flex w-full items-center gap-3 px-2.5 py-2 transition-colors duration-150 cursor-pointer disabled:opacity-50"
                                style={{
                                    borderRadius: 12,
                                    background: isActive ? ACTIVE_BG : "transparent",
                                }}
                                onMouseEnter={(e) => {
                                    if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)"
                                }}
                                onMouseLeave={(e) => {
                                    if (!isActive) e.currentTarget.style.background = "transparent"
                                }}
                            >
                                <div
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                                    style={{ background: isActive ? "rgba(139,92,246,0.25)" : "rgba(139,92,246,0.10)" }}
                                >
                                    <Users className="h-3.5 w-3.5" style={{ color: ACCENT }} />
                                </div>
                                <div className="flex flex-col items-start text-left overflow-hidden flex-1">
                                    <span className="truncate text-[13px] font-semibold text-zinc-100 w-full">
                                        {profile.name}
                                    </span>
                                    <span className="text-[10px]" style={{ color: MUTED }}>
                                        {profile.userCount} members &middot; {profile.workspaceCount} workspaces
                                    </span>
                                </div>
                                {isActive && (
                                    <Check className="ml-auto h-4 w-4 shrink-0" style={{ color: ACCENT }} />
                                )}
                            </button>
                        )
                    })}
                </div>
            )}

            {/* ── Divider ── */}
            {profiles.length > 1 && workspaces.length > 0 && (
                <div style={{ borderTop: `1px solid ${DIVIDER}` }} />
            )}

            {/* ── Workspaces Section ── */}
            {workspaces.length > 0 && (
                <div className="p-2">
                    <p
                        className="px-2.5 pb-2 pt-1.5 text-[10px] font-bold uppercase tracking-[0.08em] flex items-center gap-1.5"
                        style={{ color: MUTED }}
                    >
                        <Briefcase size={11} />
                        Workspaces
                    </p>
                    {workspaces.map((ws) => {
                        const isActive = ws.id === workspaceId
                        return (
                            <button
                                key={ws.id}
                                type="button"
                                onClick={() => onWorkspaceSwitch(ws.id)}
                                className="flex w-full items-center gap-3 px-2.5 py-2 transition-colors duration-150 cursor-pointer"
                                style={{
                                    borderRadius: 12,
                                    background: isActive ? ACTIVE_BG : "transparent",
                                }}
                                onMouseEnter={(e) => {
                                    if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)"
                                }}
                                onMouseLeave={(e) => {
                                    if (!isActive) e.currentTarget.style.background = "transparent"
                                }}
                            >
                                <div
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                                    style={{ background: isActive ? "rgba(139,92,246,0.25)" : "rgba(139,92,246,0.10)" }}
                                >
                                    <Briefcase className="h-3.5 w-3.5" style={{ color: ACCENT }} />
                                </div>
                                <div className="flex flex-col items-start text-left overflow-hidden flex-1">
                                    <span className="truncate text-[13px] font-semibold text-zinc-100 w-full">
                                        {ws.name}
                                    </span>
                                    {ws.description && (
                                        <span className="truncate text-[10px] w-full" style={{ color: MUTED }}>
                                            {ws.description}
                                        </span>
                                    )}
                                </div>
                                {isActive && (
                                    <Check className="ml-auto h-4 w-4 shrink-0" style={{ color: ACCENT }} />
                                )}
                            </button>
                        )
                    })}
                </div>
            )}

            {/* ── Create Workspace ── */}
            <div style={{ borderTop: `1px solid ${DIVIDER}` }} />
            <div className="p-2">
                <button
                    type="button"
                    onClick={onCreateWorkspace}
                    className="flex w-full items-center gap-3 px-2.5 py-2.5 transition-colors duration-150 cursor-pointer"
                    style={{ borderRadius: 12 }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)" }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
                >
                    <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{ background: "rgba(139,92,246,0.10)", border: `1px dashed rgba(139,92,246,0.3)` }}
                    >
                        <Plus className="h-3.5 w-3.5" style={{ color: ACCENT }} />
                    </div>
                    <span className="text-[13px] font-semibold" style={{ color: MUTED_LIGHT }}>
                        Tạo Workspace mới
                    </span>
                </button>
            </div>

            {/* ── Empty state ── */}
            {profiles.length <= 1 && workspaces.length === 0 && (
                <div className="p-4 text-center">
                    <p className="text-sm" style={{ color: MUTED }}>Khong co du lieu</p>
                </div>
            )}
        </motion.div>
    )
}
