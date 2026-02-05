"use client"

import * as React from "react"
import {
    Calculator,
    Calendar,
    CreditCard,
    Settings,
    Smile,
    User,
    LayoutDashboard,
    ListTodo,
    Wallet,
    Building2,
    Users,
    LogOut
} from "lucide-react"

import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
    CommandShortcut,
} from "@/components/ui/command"
import { useRouter } from "next/navigation"
import { logout } from "@/lib/auth"

export function CommandMenu() {
    const [open, setOpen] = React.useState(false)
    const router = useRouter()

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                setOpen((open) => !open)
            }
        }

        document.addEventListener("keydown", down)
        return () => document.removeEventListener("keydown", down)
    }, [])

    const runCommand = React.useCallback((command: () => unknown) => {
        setOpen(false)
        command()
    }, [])

    return (
        <CommandDialog open={open} onOpenChange={setOpen}>
            <CommandInput placeholder="Type a command or search..." />
            <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>
                <CommandGroup heading="Suggestions">
                    <CommandItem onSelect={() => runCommand(() => router.push('/admin'))}>
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        <span>Dashboard</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => router.push('/admin/queue'))}>
                        <ListTodo className="mr-2 h-4 w-4" />
                        <span>Task Queue</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => router.push('/dashboard/schedule'))}>
                        <Calendar className="mr-2 h-4 w-4" />
                        <span>Calendar</span>
                    </CommandItem>
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="Management">
                    <CommandItem onSelect={() => runCommand(() => router.push('/admin/users'))}>
                        <Users className="mr-2 h-4 w-4" />
                        <span>Users</span>
                        <CommandShortcut>⌘U</CommandShortcut>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => router.push('/admin/crm'))}>
                        <Smile className="mr-2 h-4 w-4" />
                        <span>CRM & Clients</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => router.push('/admin/payroll'))}>
                        <Wallet className="mr-2 h-4 w-4" />
                        <span>Payroll</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => router.push('/admin/agencies'))}>
                        <Building2 className="mr-2 h-4 w-4" />
                        <span>Agencies</span>
                    </CommandItem>
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="Settings">
                    <CommandItem onSelect={() => runCommand(() => router.push('/profile'))}>
                        <User className="mr-2 h-4 w-4" />
                        <span>Profile</span>
                        <CommandShortcut>⌘P</CommandShortcut>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => router.push('/settings'))}>
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Settings</span>
                        <CommandShortcut>⌘S</CommandShortcut>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(async () => {
                        // We can't call server action directly here easily cleanly without wrapping.
                        // For now, redirect to logout API or click hidden button?
                        // Let's use window location for full refresh logout
                        window.location.href = '/api/auth/logout'
                    })}>
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Log out</span>
                    </CommandItem>
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    )
}
