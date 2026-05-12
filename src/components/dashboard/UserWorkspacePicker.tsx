"use client"

import { useState, useRef, useEffect } from "react"
import { Briefcase, ChevronDown, Check, Plus } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { useRouter } from "next/navigation"
import CreateWorkspaceModal from "@/components/workspace/CreateWorkspaceModal"

interface WorkspaceItem {
    id: string
    name: string
    description: string | null
}

interface Props {
    workspaceId: string
    workspaces: WorkspaceItem[]
    /**
     * [Sprint Y] true iff user là chủ home profile của profile hiện tại.
     * Cross-team invitees + global admin (không sở hữu profile) → false → ẩn
     * "Tạo Workspace mới" entry.
     */
    canCreateWorkspace?: boolean
}

/**
 * UserWorkspacePicker — workspace picker pill rendered INSIDE the user dashboard
 * content area (mirrors the admin's `DashboardActionBar` left pill).
 *
 * Responsibilities:
 *   - Show current workspace name in a Briefcase pill button
 *   - Click → dropdown of all workspaces in current profile
 *   - Click any → router.push(/{newWsId}/dashboard) (stays in USER view)
 *   - "Tạo Workspace mới" entry → opens CreateWorkspaceModal
 *
 * Different from admin's DashboardActionBar: no "Add new task" button (USER không
 * tạo task được).
 */
export default function UserWorkspacePicker({ workspaceId, workspaces, canCreateWorkspace = false }: Props) {
    const [open, setOpen] = useState(false)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const router = useRouter()

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        if (open) document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [open])

    const currentWorkspace = workspaces.find((ws) => ws.id === workspaceId)
    const currentName = currentWorkspace?.name ?? "Workspace"

    const handleWorkspaceSwitch = (newWsId: string) => {
        if (newWsId === workspaceId) {
            setOpen(false)
            return
        }
        setOpen(false)
        router.push(`/${newWsId}/dashboard`)
    }

    const handleOpenCreateModal = () => {
        setOpen(false)
        setShowCreateModal(true)
    }

    return (
        <div ref={dropdownRef} className="relative inline-block">
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className="flex items-center gap-2 py-2.5 px-4 transition-colors duration-200"
                style={{
                    borderRadius: 26,
                    border: "1px solid rgba(139,92,246,0.15)",
                    background: "transparent",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#211B31"
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent"
                }}
            >
                <Briefcase size={16} style={{ color: "#8B5CF6" }} />
                <span className="text-sm font-medium whitespace-nowrap" style={{ color: "#A1A1AA" }}>
                    {currentName}
                </span>
                <ChevronDown
                    size={14}
                    className="transition-transform duration-200"
                    style={{
                        color: "#71717A",
                        transform: open ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="absolute left-0 top-full z-50 mt-2 w-[280px] overflow-hidden"
                        style={{
                            borderRadius: 16,
                            border: "1px solid rgba(139,92,246,0.15)",
                            background: "#0A0A0A",
                            boxShadow:
                                "0 16px 48px rgba(0,0,0,0.50), 0 0 40px rgba(139,92,246,0.06)",
                        }}
                    >
                        <div className="p-2">
                            <p
                                className="px-2.5 pb-2 pt-1.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                                style={{
                                    color: "#71717A",
                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                }}
                            >
                                Workspaces
                            </p>

                            {workspaces.length === 0 ? (
                                <p
                                    className="px-2.5 py-4 text-center text-sm"
                                    style={{ color: "#71717A" }}
                                >
                                    Chưa có workspace nào
                                </p>
                            ) : (
                                workspaces.map((ws) => {
                                    const isActive = ws.id === workspaceId
                                    return (
                                        <button
                                            key={ws.id}
                                            type="button"
                                            onClick={() => handleWorkspaceSwitch(ws.id)}
                                            className="flex w-full items-center gap-3 px-2.5 py-2 transition-colors duration-200"
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
                                            <div
                                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                                                style={{ background: "rgba(139,92,246,0.15)" }}
                                            >
                                                <Briefcase className="h-4 w-4" style={{ color: "#8B5CF6" }} />
                                            </div>
                                            <div className="flex flex-col items-start text-left overflow-hidden flex-1">
                                                <span
                                                    className="truncate text-[13px] font-semibold text-zinc-100 w-full"
                                                    style={{
                                                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                                                    }}
                                                >
                                                    {ws.name}
                                                </span>
                                                {ws.description && (
                                                    <span
                                                        className="truncate text-[11px] w-full"
                                                        style={{ color: "#71717A" }}
                                                    >
                                                        {ws.description}
                                                    </span>
                                                )}
                                            </div>
                                            {isActive && (
                                                <Check
                                                    className="ml-auto h-4 w-4 shrink-0"
                                                    style={{ color: "#8B5CF6" }}
                                                />
                                            )}
                                        </button>
                                    )
                                })
                            )}

                            {/* Create Workspace button — [Sprint Y] gated by profile ownership */}
                            {canCreateWorkspace && (
                                <button
                                    type="button"
                                    onClick={handleOpenCreateModal}
                                    className="flex w-full items-center gap-3 px-2.5 py-2 mt-1 transition-colors duration-150"
                                    style={{ borderRadius: 12 }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = "rgba(255,255,255,0.04)"
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = "transparent"
                                    }}
                                >
                                    <div
                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                                        style={{
                                            background: "rgba(139,92,246,0.10)",
                                            border: "1px dashed rgba(139,92,246,0.3)",
                                        }}
                                    >
                                        <Plus className="h-3.5 w-3.5" style={{ color: "#8B5CF6" }} />
                                    </div>
                                    <span
                                        className="text-[13px] font-semibold"
                                        style={{
                                            color: "#A1A1AA",
                                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                                        }}
                                    >
                                        Tạo Workspace mới
                                    </span>
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <CreateWorkspaceModal open={showCreateModal} onClose={() => setShowCreateModal(false)} />
        </div>
    )
}
