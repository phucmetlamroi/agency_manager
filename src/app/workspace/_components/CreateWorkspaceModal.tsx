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
            toast.success('Workspace created successfully')
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
                    <span className="font-medium text-lg">Create New Workspace</span>
                </div>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-slate-900 text-slate-50 border-slate-800">
                <DialogHeader>
                    <DialogTitle className="text-xl">Initialize Workspace</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Separate data for months or projects. You will automatically become the owner.
                    </DialogDescription>
                </DialogHeader>
                <form action={onSubmit} className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name" className="text-slate-200">
                            Name <span className="text-red-400">*</span>
                        </Label>
                        <Input
                            id="name"
                            name="name"
                            placeholder="e.g. April 2026"
                            className="bg-slate-950 border-slate-700 focus-visible:ring-indigo-500"
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="description" className="text-slate-200">Description (Optional)</Label>
                        <Textarea
                            id="description"
                            name="description"
                            placeholder="ABC team tasks..."
                            className="bg-slate-950 border-slate-700 focus-visible:ring-indigo-500"
                        />
                    </div>
                    <div className="flex justify-end pt-4">
                        <Button type="submit" disabled={isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md">
                            {isPending ? 'Creating...' : 'Initialize Now'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
