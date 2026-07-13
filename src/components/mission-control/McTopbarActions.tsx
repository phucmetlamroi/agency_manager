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

    // Workspace-scoped nav targets — all verified to exist under /[workspaceId]/admin/*.
    const NAV: { label: string; href: string; icon: LucideIcon }[] = [
        { label: "Tổng quan (Mission Control)", href: `/${workspaceId}/mc`, icon: LayoutDashboard },
        { label: "Kho Task đợi", href: `/${workspaceId}/admin/queue`, icon: ListTodo },
        { label: "Tài chính", href: `/${workspaceId}/admin/finance`, icon: Wallet },
        { label: "Bảng lương", href: `/${workspaceId}/admin/payroll`, icon: Wallet },
        { label: "CRM · Khách hàng", href: `/${workspaceId}/admin/crm`, icon: Building2 },
        { label: "Thành viên", href: `/${workspaceId}/admin/members`, icon: UsersRound },
        { label: "Hộp thư yêu cầu", href: `/${workspaceId}/admin/requests`, icon: Inbox },
        { label: "Lịch", href: `/${workspaceId}/admin/schedule`, icon: CalendarDays },
        { label: "Phân tích", href: `/${workspaceId}/admin/analytics`, icon: Activity },
        { label: "Nhật ký hoạt động", href: `/${workspaceId}/admin/audit-log`, icon: ScrollText },
        { label: "Task đã hủy / lưu trữ", href: `/${workspaceId}/admin/cancelled`, icon: Trash2 },
        { label: "Cài đặt", href: `/${workspaceId}/admin/settings`, icon: Settings },
    ]

    const go = (href: string) => { setPaletteOpen(false); router.push(href) }

    return (
        <>
            {/* ⌘K search chip → open palette */}
            <button
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
            </button>

            {/* [M18] Store → Phiên Chợ Task (real TaskMarketplace modal, mounted globally in the
                workspace layout). Opens via the 'open-marketplace' event; badge = live open count. */}
            <button
                type="button"
                onClick={openMarketplace}
                title="Phiên Chợ Task — task chưa giao"
                style={{ position: "relative", width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#A1A1AA", cursor: "pointer" }}
            >
                <Store style={{ width: 17, height: 17 }} />
                {mktCount > 0 && (
                    <span style={{ position: "absolute", top: -5, right: -5, minWidth: 17, height: 17, padding: "0 4px", borderRadius: 999, background: "#10B981", color: "#fff", fontSize: 9.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 8px rgba(16,185,129,0.6)" }}>{mktCount}</span>
                )}
            </button>

            {/* Add Task → real AddTaskModal */}
            <button
                type="button"
                onClick={() => setAddOpen(true)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 10, background: "#6366F1", color: "#fff", fontSize: 13, fontWeight: 700, boxShadow: "0 0 24px rgba(99,102,241,0.40)", cursor: "pointer" }}
            >
                <Plus style={{ width: 15, height: 15 }} /><span>Add Task</span>
            </button>

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
