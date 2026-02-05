"use client"

import { useState } from 'react'
import { createClient } from '@/actions/crm-actions'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { toast } from 'sonner'

type Client = {
    id: number
    name: string
    subsidiaries?: Client[]
}

export default function CreateClientButton({ partners }: { partners: Client[] }) {
    const [open, setOpen] = useState(false)
    const [name, setName] = useState('')
    const [parentId, setParentId] = useState<string>('') // Use string for Shadcn Select
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const res = await createClient({
                name,
                parentId: parentId ? Number(parentId) : undefined
            })
            if (res.success) {
                setOpen(false)
                setName('')
                setParentId('')
                toast.success('Đã tạo khách hàng thành công!')
            } else {
                toast.error('Tạo thất bại: ' + res.error)
            }
        } catch (error) {
            console.error(error)
            toast.error('Có lỗi xảy ra.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white border-0">
                    + Thêm Khách
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-[#1a1a1a] border-gray-800 text-white">
                <DialogHeader>
                    <DialogTitle>Thêm Khách hàng Mới</DialogTitle>
                    <DialogDescription className="text-gray-400">
                        Tạo Partner (Agency/Cameraman) hoặc End-Client (Brand).
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name" className="text-gray-300">Tên khách hàng</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ví dụ: Cameraman A, Shop X..."
                            className="col-span-3 bg-[#2a2a2a] border-gray-700 text-white"
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="parent" className="text-gray-300">Là con của (Optional)</Label>
                        <Select onValueChange={setParentId} value={parentId}>
                            <SelectTrigger className="w-full bg-[#2a2a2a] border-gray-700 text-white">
                                <SelectValue placeholder="-- Chọn Partner (Nếu là Brand con) --" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#2a2a2a] border-gray-700 text-white">
                                <SelectItem value="0">-- Là Đối tác (Cấp 1) --</SelectItem>
                                {partners.map((p) => (
                                    <SelectItem key={p.id} value={p.id.toString()}>
                                        {p.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-[10px] text-gray-500">
                            Để trống hoặc chọn Cấp 1 nếu đây là Partner (Agency/Cameraman).
                        </p>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Hủy</Button>
                        <Button type="submit" disabled={loading} className="bg-purple-600 hover:bg-purple-500">
                            {loading ? 'Đang tạo...' : 'Tạo mới'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
