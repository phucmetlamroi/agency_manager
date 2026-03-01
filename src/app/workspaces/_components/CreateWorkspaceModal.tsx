'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus } from "lucide-react"
import { createWorkspaceAction } from '@/actions/workspace-actions'
import { toast } from 'sonner'

export function CreateWorkspaceModal() {
    const [open, setOpen] = useState(false)
    const [isPending, setIsPending] = useState(false)
    const router = useRouter()

    async function onSubmit(formData: FormData) {
        setIsPending(true)
        const result = await createWorkspaceAction(formData)
        setIsPending(false)

        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success('Đã tạo Workspace thành công')
            setOpen(false)
            if (result.workspaceId) {
                router.push(`/${result.workspaceId}/dashboard`)
            }
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <div className="border-2 border-dashed border-slate-700/50 hover:border-slate-500 hover:bg-slate-800/30 transition-all rounded-xl cursor-pointer h-64 flex flex-col items-center justify-center p-5 group text-slate-400 hover:text-white">
                    <div className="w-12 h-12 rounded-full bg-slate-800 group-hover:bg-indigo-600 flex items-center justify-center mb-4 transition-colors">
                        <Plus className="w-6 h-6" />
                    </div>
                    <span className="font-medium text-lg">Tạo Workspace mới</span>
                </div>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-slate-900 text-slate-50 border-slate-800">
                <DialogHeader>
                    <DialogTitle className="text-xl">Khởi tạo Không gian làm việc</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Phân tách dữ liệu các tháng hoặc dự án riêng biệt. Bạn sẽ tự động trở thành Chủ sở hữu.
                    </DialogDescription>
                </DialogHeader>
                <form action={onSubmit} className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name" className="text-slate-200">
                            Tên <span className="text-red-400">*</span>
                        </Label>
                        <Input
                            id="name"
                            name="name"
                            placeholder="VD: Tháng 4/2026"
                            className="bg-slate-950 border-slate-700 focus-visible:ring-indigo-500"
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="description" className="text-slate-200">Mô tả (Tùy chọn)</Label>
                        <Textarea
                            id="description"
                            name="description"
                            placeholder="Công việc của team ABC..."
                            className="bg-slate-950 border-slate-700 focus-visible:ring-indigo-500"
                        />
                    </div>
                    <div className="flex justify-end pt-4">
                        <Button type="submit" disabled={isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md">
                            {isPending ? 'Đang tạo...' : 'Khởi tạo ngay'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
