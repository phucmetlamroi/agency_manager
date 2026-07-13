'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Plus, Pencil, Trash, X, Settings } from 'lucide-react'
import { createBillingProfile, updateBillingProfile, deleteBillingProfile, getBillingProfiles } from '@/actions/invoice-actions'
import { toast } from 'sonner'

type BillingProfile = {
    id: string
    profileName: string
    beneficiaryName: string
    bankName: string
    accountNumber: string
    swiftCode?: string | null
    address?: string | null
    notes?: string | null
    currency?: string | null
    isDefault: boolean
}


export default function BillingProfileManager({
    onProfileSelect,
    currentProfileId,
    workspaceId,
    open,
    onOpenChange,
    hideTrigger,
}: {
    onProfileSelect?: (profile: BillingProfile) => void
    currentProfileId?: string
    workspaceId?: string
    // [MC · M14] Optional controlled-open + ẩn trigger → cho phép mount như 1 màn độc lập
    // (/mc/ho-so-thanh-toan). Bỏ trống = hành vi cũ (dialog tự quản + nút trigger) → GĐ1 byte-identical.
    open?: boolean
    onOpenChange?: (open: boolean) => void
    hideTrigger?: boolean
}) {
    const [internalOpen, setInternalOpen] = useState(false)
    const isControlled = open !== undefined
    const isOpen = isControlled ? open : internalOpen
    const setIsOpen = (next: boolean) => { if (isControlled) onOpenChange?.(next); else setInternalOpen(next) }
    const [profiles, setProfiles] = useState<BillingProfile[]>([])
    const [loading, setLoading] = useState(false)

    // Editor State
    const [isEditing, setIsEditing] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [formData, setFormData] = useState<Partial<BillingProfile>>({})

    const fetchProfiles = async () => {
        setLoading(true)
        const res = await getBillingProfiles(workspaceId)
        if (res.success && res.data) {
            setProfiles(res.data)
        }
        setLoading(false)
    }

    useEffect(() => {
        if (isOpen) {
            fetchProfiles()
        }
    }, [isOpen])

    const handleEdit = (profile: BillingProfile) => {
        setEditingId(profile.id)
        setFormData(profile)
        setIsEditing(true)
    }

    const handleCreate = () => {
        setEditingId(null)
        setFormData({
            profileName: '',
            beneficiaryName: '',
            bankName: '',
            accountNumber: '',
            swiftCode: '',
            address: '',
            notes: '',
            currency: '$',
            isDefault: false
        })

        setIsEditing(true)
    }

    const handleSave = async () => {
        if (!formData.profileName || !formData.beneficiaryName || !formData.accountNumber) {
            toast.error('Thiếu thông tin bắt buộc')
            return
        }

        const payload = {
            profileName: formData.profileName,
            beneficiaryName: formData.beneficiaryName,
            bankName: formData.bankName || '',
            accountNumber: formData.accountNumber,
            swiftCode: formData.swiftCode || undefined,
            address: formData.address || undefined,
            notes: formData.notes || undefined,
            currency: formData.currency || '$',
            isDefault: formData.isDefault,
            workspaceId
        }


        let res
        if (editingId) {
            res = await updateBillingProfile(editingId, payload, workspaceId)
        } else {
            res = await createBillingProfile(payload)
        }

        if (res.success) {
            toast.success(editingId ? 'Đã cập nhật hồ sơ' : 'Đã tạo hồ sơ')
            setIsEditing(false)
            fetchProfiles()
        } else {
            toast.error(res.error || 'Lưu không thành công')
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Bạn có chắc muốn xoá hồ sơ này?')) return
        const res = await deleteBillingProfile(id, workspaceId)
        if (res.success) {
            toast.success('Đã xoá hồ sơ')
            fetchProfiles()
        } else {
            toast.error(res.error)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            {!hideTrigger && (
                <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 text-gray-400 border-gray-700 hover:text-white hover:bg-white/5">
                        <Settings size={14} /> Quản lý hồ sơ
                    </Button>
                </DialogTrigger>
            )}
            <DialogContent className="max-w-2xl bg-gray-900 border-gray-800 text-white max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isEditing ? (editingId ? 'Sửa hồ sơ' : 'Hồ sơ mới') : 'Quản lý hồ sơ thanh toán'}</DialogTitle>
                </DialogHeader>

                {isEditing ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Tên hồ sơ (nội bộ)</Label>
                                <Input
                                    value={formData.profileName || ''}
                                    onChange={e => setFormData({ ...formData, profileName: e.target.value })}
                                    placeholder="vd. VCB USD"
                                    className="bg-gray-800 border-gray-700"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Hồ sơ mặc định</Label>
                                <div className="flex items-center gap-2 pt-2">
                                    <Switch
                                        checked={formData.isDefault}
                                        onCheckedChange={checked => setFormData({ ...formData, isDefault: checked })}
                                    />
                                    <span className="text-sm text-gray-400">Đặt làm mặc định</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2 border-t border-gray-800 pt-4">
                            <Label className="text-blue-300">Thông tin thanh toán</Label>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Tên người thụ hưởng</Label>
                                    <Input
                                        value={formData.beneficiaryName || ''}
                                        onChange={e => setFormData({ ...formData, beneficiaryName: e.target.value })}
                                        placeholder="Họ và tên"
                                        className="bg-gray-800 border-gray-700"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Số tài khoản / IBAN</Label>
                                    <Input
                                        value={formData.accountNumber || ''}
                                        onChange={e => setFormData({ ...formData, accountNumber: e.target.value })}
                                        placeholder="123456789"
                                        className="bg-gray-800 border-gray-700 font-mono"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Tên ngân hàng</Label>
                                    <Input
                                        value={formData.bankName || ''}
                                        onChange={e => setFormData({ ...formData, bankName: e.target.value })}
                                        placeholder="Tên ngân hàng"
                                        className="bg-gray-800 border-gray-700"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>SWIFT / BIC</Label>
                                    <Input
                                        value={formData.swiftCode || ''}
                                        onChange={e => setFormData({ ...formData, swiftCode: e.target.value })}
                                        placeholder="Mã SWIFT"
                                        className="bg-gray-800 border-gray-700 font-mono"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Địa chỉ ngân hàng</Label>
                                <Input
                                    value={formData.address || ''}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                    placeholder="Địa chỉ chi nhánh"
                                    className="bg-gray-800 border-gray-700"
                                />
                            </div>
                            <div className="space-y-4 pt-2">
                                <div className="space-y-2">
                                    <Label className="text-amber-300">Ký hiệu tiền tệ (nhập tay)</Label>
                                    <Input
                                        value={formData.currency || ''}
                                        onChange={e => setFormData({ ...formData, currency: e.target.value })}
                                        placeholder="vd. $, ₫, €, total due:"
                                        className="bg-gray-800 border-amber-900/50 text-amber-100 font-bold w-full"
                                    />
                                    <p className="text-[10px] text-gray-500">Ký hiệu này sẽ hiển thị cho mọi số tiền trên hóa đơn.</p>
                                </div>
                            </div>
                            <div className="space-y-2">

                                <Label>Ghi chú / Thông tin giao nhận</Label>
                                <Textarea
                                    value={formData.notes || ''}
                                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                    placeholder="vd. Hình thức thanh toán: chuyển khoản ngân hàng..."
                                    className="bg-gray-800 border-gray-700 min-h-[80px]"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-4">
                            <Button variant="ghost" onClick={() => setIsEditing(false)}>Huỷ</Button>
                            <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">Lưu hồ sơ</Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <Button onClick={handleCreate} className="w-full border-dashed border-gray-700 bg-transparent hover:bg-white/5 text-gray-400">
                            <Plus className="mr-2 h-4 w-4" /> Tạo hồ sơ mới
                        </Button>

                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                            {profiles.map(profile => (
                                <div key={profile.id} className={`p-4 rounded-lg border flex justify-between items-start ${currentProfileId === profile.id ? 'bg-blue-900/20 border-blue-500/50' : 'bg-gray-800/50 border-gray-700'}`}>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-bold text-white">{profile.profileName}</span>
                                            {profile.isDefault && <span className="text-[10px] bg-green-900 text-green-300 px-1.5 py-0.5 rounded">MẶC ĐỊNH</span>}
                                        </div>
                                        <div className="text-sm text-gray-400">{profile.bankName} - {profile.accountNumber}</div>
                                        <div className="text-xs text-gray-500 mt-1">{profile.beneficiaryName}</div>
                                    </div>
                                    <div className="flex gap-1">
                                        {onProfileSelect && (
                                            <Button size="sm" variant="ghost" className="h-8 text-blue-400 hover:text-blue-300" onClick={() => {
                                                onProfileSelect(profile)
                                                setIsOpen(false)
                                            }}>
                                                Chọn
                                            </Button>
                                        )}
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400 hover:text-white" onClick={() => handleEdit(profile)}>
                                            <Pencil size={14} />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-900/20" onClick={() => handleDelete(profile.id)}>
                                            <Trash size={14} />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
