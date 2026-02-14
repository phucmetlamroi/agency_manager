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
    isDefault: boolean
}

export default function BillingProfileManager({
    onProfileSelect,
    currentProfileId
}: {
    onProfileSelect?: (profile: BillingProfile) => void
    currentProfileId?: string
}) {
    const [isOpen, setIsOpen] = useState(false)
    const [profiles, setProfiles] = useState<BillingProfile[]>([])
    const [loading, setLoading] = useState(false)

    // Editor State
    const [isEditing, setIsEditing] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [formData, setFormData] = useState<Partial<BillingProfile>>({})

    const fetchProfiles = async () => {
        setLoading(true)
        const res = await getBillingProfiles()
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
            isDefault: false
        })
        setIsEditing(true)
    }

    const handleSave = async () => {
        if (!formData.profileName || !formData.beneficiaryName || !formData.accountNumber) {
            toast.error('Missing required fields')
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
            isDefault: formData.isDefault
        }

        let res
        if (editingId) {
            res = await updateBillingProfile(editingId, payload)
        } else {
            res = await createBillingProfile(payload)
        }

        if (res.success) {
            toast.success(editingId ? 'Profile updated' : 'Profile created')
            setIsEditing(false)
            fetchProfiles()
        } else {
            toast.error(res.error || 'Failed to save')
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this profile?')) return
        const res = await deleteBillingProfile(id)
        if (res.success) {
            toast.success('Profile deleted')
            fetchProfiles()
        } else {
            toast.error(res.error)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 text-gray-400 border-gray-700 hover:text-white hover:bg-white/5">
                    <Settings size={14} /> Manage Profiles
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl bg-gray-900 border-gray-800 text-white max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isEditing ? (editingId ? 'Edit Profile' : 'New Profile') : 'Manage Billing Profiles'}</DialogTitle>
                </DialogHeader>

                {isEditing ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Profile Name (Internal)</Label>
                                <Input
                                    value={formData.profileName || ''}
                                    onChange={e => setFormData({ ...formData, profileName: e.target.value })}
                                    placeholder="e.g. VCB USD"
                                    className="bg-gray-800 border-gray-700"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Default Profile</Label>
                                <div className="flex items-center gap-2 pt-2">
                                    <Switch
                                        checked={formData.isDefault}
                                        onCheckedChange={checked => setFormData({ ...formData, isDefault: checked })}
                                    />
                                    <span className="text-sm text-gray-400">Set as default</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2 border-t border-gray-800 pt-4">
                            <Label className="text-blue-300">Payment Details</Label>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Beneficiary Name</Label>
                                    <Input
                                        value={formData.beneficiaryName || ''}
                                        onChange={e => setFormData({ ...formData, beneficiaryName: e.target.value })}
                                        placeholder="Full Name"
                                        className="bg-gray-800 border-gray-700"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Account / IBAN</Label>
                                    <Input
                                        value={formData.accountNumber || ''}
                                        onChange={e => setFormData({ ...formData, accountNumber: e.target.value })}
                                        placeholder="123456789"
                                        className="bg-gray-800 border-gray-700 font-mono"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Bank Name</Label>
                                    <Input
                                        value={formData.bankName || ''}
                                        onChange={e => setFormData({ ...formData, bankName: e.target.value })}
                                        placeholder="Bank Name"
                                        className="bg-gray-800 border-gray-700"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>SWIFT / BIC</Label>
                                    <Input
                                        value={formData.swiftCode || ''}
                                        onChange={e => setFormData({ ...formData, swiftCode: e.target.value })}
                                        placeholder="SWIFT code"
                                        className="bg-gray-800 border-gray-700 font-mono"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Bank Address</Label>
                                <Input
                                    value={formData.address || ''}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                    placeholder="Branch Address"
                                    className="bg-gray-800 border-gray-700"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Notes / Delivery Info</Label>
                                <Textarea
                                    value={formData.notes || ''}
                                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                    placeholder="e.g. Delivery method: bank deposit..."
                                    className="bg-gray-800 border-gray-700 min-h-[80px]"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-4">
                            <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
                            <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">Save Profile</Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <Button onClick={handleCreate} className="w-full border-dashed border-gray-700 bg-transparent hover:bg-white/5 text-gray-400">
                            <Plus className="mr-2 h-4 w-4" /> Create New Profile
                        </Button>

                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                            {profiles.map(profile => (
                                <div key={profile.id} className={`p-4 rounded-lg border flex justify-between items-start ${currentProfileId === profile.id ? 'bg-blue-900/20 border-blue-500/50' : 'bg-gray-800/50 border-gray-700'}`}>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-bold text-white">{profile.profileName}</span>
                                            {profile.isDefault && <span className="text-[10px] bg-green-900 text-green-300 px-1.5 py-0.5 rounded">DEFAULT</span>}
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
                                                Select
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
