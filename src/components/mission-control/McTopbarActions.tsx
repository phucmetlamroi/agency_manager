"use client"

// [Giao diện 2 · Mission Control] The interactive right-cluster of the M1 topbar:
//   • the ⌘K command palette (global Cmd/Ctrl+K, workspace-scoped nav + "Tạo task mới")
//   • the "Add Task" button → the SAME AddTaskModal /admin uses (money-safe handleSubmit
//     reused via DashboardActionWrapper — hideBar + controlled open)
// Everything here is presentation + client wiring; task creation still goes through the
// real server actions (createTask/…), which re-check admin access server-side.
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
    Search, Store, Plus, PlusCircle, LayoutDashboard, ListTodo, Wallet, Building2,
    UsersRound, Inbox, Activity, ScrollText, CalendarDays, Trash2, Settings, ArrowLeftRight,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import {
    CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator,
} from "@/components/ui/command"
import DashboardActionWrapper from "@/components/dashboard/DashboardActionWrapper"
import { setUiPref } from "@/actions/ui-actions"
import { Pressable } from "./motion-kit"

export interface McAddTaskData {
    clients: Array<{ id: string; name: string; parentId?: string | null; parent?: { name: string } | null }>
    users: Array<{ id: string; username: string; nickname?: string | null; displayName?: string | null }>
    pricingRules: Array<{ id: string; name: string; clientId: number | null; ruleType: string; config: any; isDefault: boolean }>
    exchangeRate: number
}

export default function McTopbarActions({
    workspaceId, backHref, addTask, userRole,
}: {
    workspaceId: string
    backHref: string
    addTask: McAddTaskData
    userRole: string
}) {
    const router = useRouter()
    const [paletteOpen, setPaletteOpen] = useState(false)
    const [addOpen, setAddOpen] = useState(false)
    const [mktCount, setMktCount] = useState(0)

    // [M18] Live open-task count for the Store badge — broadcast by MarketplaceProvider,
    // which is mounted globally in [workspaceId]/layout.tsx (triggerMode="event").
    useEffect(() => {
        const onCount = (e: Event) => setMktCount((e as CustomEvent<number>).detail ?? 0)
        window.addEventListener("marketplace-task-count", onCount as EventListener)
        return () => window.removeEventListener("marketplace-task-count", onCount as EventListener)
    }, [])

    // [M18] Open the real TaskMarketplace modal (Phiên Chợ Task) — self-fetching, atomic claim,
    // VND wage only (client $ hidden). No new modal built; just fire the global open event.
    const openMarketplace = () => window.dispatchEvent(new CustomEvent("open-marketplace"))

    // Global ⌘K / Ctrl+K to toggle the palette (mirrors the admin CommandMenu).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                setPaletteOpen((o) => !o)
            }
        }
        document.addEventListener("keydown", onKey)
        return () => document.removeEventListener("keydown", onKey)
    }, [])

    // [M27] Workspace-scoped nav — repointed to the /mc/* cockpit equivalents (all now built:
    // M5–M31) so ⌘K keeps navigation INSIDE Mission Control instead of jumping back to GĐ1 /admin
    // (design M27: "giữ đúng ngữ cảnh"). "Task đã hủy" → /mc/trash (its tab 3, Thùng rác gộp M26).
    const NAV: { label: string; href: string; icon: LucideIcon }[] = [
        { label: "Tổng quan (Mission Control)", href: `/${workspaceId}/mc`, icon: LayoutDashboard },
        { label: "Vận hành bảng task", href: `/${workspaceId}/mc/board`, icon: ListTodo },
        { label: "Tài chính", href: `/${workspaceId}/mc/finance`, icon: Wallet },
        { label: "Bảng lương", href: `/${workspaceId}/mc/tien`, icon: Wallet },
        { label: "CRM · Khách hàng", href: `/${workspaceId}/mc/crm`, icon: Building2 },
        { label: "Thành viên", href: `/${workspaceId}/mc/members`, icon: UsersRound },
        { label: "Hộp thư yêu cầu", href: `/${workspaceId}/mc/requests`, icon: Inbox },
        { label: "Lịch", href: `/${workspaceId}/mc/lich`, icon: CalendarDays },
        { label: "Phân tích hiệu suất", href: `/${workspaceId}/mc/analytics`, icon: Activity },
        { label: "Nhật ký hoạt động", href: `/${workspaceId}/mc/audit`, icon: ScrollText },
        { label: "Thùng rác (Tệp · Khách · Task hủy · Tổ chức)", href: `/${workspaceId}/mc/trash`, icon: Trash2 },
        { label: "Cài đặt Workspace", href: `/${workspaceId}/mc/settings`, icon: Settings },
    ]

    const go = (href: string) => { setPaletteOpen(false); router.push(href) }

    return (
        <>
            {/* ⌘K search chip → open palette */}
            <Pressable
                type="button"
                onClick={() => setPaletteOpen(true)}
                style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderRadius: 10,
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
                    width: 260, cursor: "pointer", textAlign: "left",
                }}
            >
                <Search style={{ width: 14, height: 14, color: "#71717A" }} />
                <span style={{ fontSize: 12, color: "#71717A", flex: 1 }}>Tìm task, khách, người…</span>
                <span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 10, background: "rgba(0,0,0,0.4)", padding: "2px 6px", borderRadius: 4, color: "#A1A1AA" }}>⌘K</span>
            </Pressable>

            {/* [M18] Store → Phiên Chợ Task (real TaskMarketplace modal, mounted globally in the
                workspace layout). Opens via the 'open-marketplace' event; badge = live open count. */}
            <Pressable
                type="button"
                onClick={openMarketplace}
                title="Phiên Chợ Task — task chưa giao"
                style={{ position: "relative", width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#A1A1AA", cursor: "pointer" }}
            >
                <Store style={{ width: 17, height: 17 }} />
                {mktCount > 0 && (
                    <span style={{ position: "absolute", top: -5, right: -5, minWidth: 17, height: 17, padding: "0 4px", borderRadius: 999, background: "#10B981", color: "#fff", fontSize: 9.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 8px rgba(16,185,129,0.6)" }}>{mktCount}</span>
                )}
            </Pressable>

            {/* Add Task → real AddTaskModal */}
            <Pressable
                type="button"
                onClick={() => setAddOpen(true)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 10, background: "#6366F1", color: "#fff", fontSize: 13, fontWeight: 700, boxShadow: "0 0 24px rgba(99,102,241,0.40)", cursor: "pointer" }}
            >
                <Plus style={{ width: 15, height: 15 }} /><span>Add Task</span>
            </Pressable>

            {/* ⌘K command palette */}
            <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
                <CommandInput placeholder="Nhập lệnh hoặc tìm điều hướng…" />
                <CommandList>
                    <CommandEmpty>Không tìm thấy.</CommandEmpty>
                    <CommandGroup heading="Hành động">
                        <CommandItem onSelect={() => { setPaletteOpen(false); setAddOpen(true) }}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            <span>Tạo task mới</span>
                        </CommandItem>
                        <CommandItem onSelect={() => { setPaletteOpen(false); openMarketplace() }}>
                            <Store className="mr-2 h-4 w-4" />
                            <span>Phiên Chợ Task{mktCount > 0 ? ` · ${mktCount} task` : ""}</span>
                        </CommandItem>
                        <CommandItem
                            onSelect={async () => {
                                setPaletteOpen(false)
                                try { await setUiPref("admin") } catch { /* navigate regardless */ }
                                window.location.href = backHref
                            }}
                        >
                            <ArrowLeftRight className="mr-2 h-4 w-4" />
                            <span>Về Giao diện 1</span>
                        </CommandItem>
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup heading="Điều hướng">
                        {NAV.map((n) => {
                            const Icon = n.icon
                            return (
                                <CommandItem key={n.href} value={n.label} onSelect={() => go(n.href)}>
                                    <Icon className="mr-2 h-4 w-4" />
                                    <span>{n.label}</span>
                                </CommandItem>
                            )
                        })}
                    </CommandGroup>
                </CommandList>
            </CommandDialog>

            {/* The real Add-Task modal — reuses /admin's money-safe submit routing. */}
            <DashboardActionWrapper
                hideBar
                portalToBody
                layout="mc"
                open={addOpen}
                onOpenChange={setAddOpen}
                workspaceId={workspaceId}
                clients={addTask.clients}
                users={addTask.users}
                workspaces={[]}
                userRole={userRole}
                canCreateWorkspace={false}
                pricingRules={addTask.pricingRules}
                exchangeRate={addTask.exchangeRate}
            />
        </>
    )
}
