"use client"

import * as React from "react"
import {
    Calculator,
    CreditCard,
    Settings,
    Smile,
    LayoutDashboard,
    ListTodo,
    Wallet,
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
            <CommandInput placeholder="Nhập lệnh hoặc tìm kiếm..." />
            <CommandList>
                <CommandEmpty>Không có kết quả.</CommandEmpty>
                <CommandGroup heading="Gợi ý">
                    <CommandItem onSelect={() => runCommand(() => router.push('/admin'))}>
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        <span>Tổng quan</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => router.push('/admin/queue'))}>
                        <ListTodo className="mr-2 h-4 w-4" />
                        <span>Hàng chờ task</span>
                    </CommandItem>
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="Quản lý">
                    <CommandItem onSelect={() => runCommand(() => router.push('/admin/crm'))}>
                        <Smile className="mr-2 h-4 w-4" />
                        <span>Quản lý khách hàng</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => router.push('/admin/payroll'))}>
                        <Wallet className="mr-2 h-4 w-4" />
                        <span>Bảng lương</span>
                    </CommandItem>
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="Cài đặt">
                    <CommandItem onSelect={() => runCommand(() => router.push('/settings'))}>
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Cài đặt</span>
                        <CommandShortcut>⌘S</CommandShortcut>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(async () => {
                        window.location.href = '/api/auth/logout'
                    })}>
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Đăng xuất</span>
                    </CommandItem>
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    )
}
