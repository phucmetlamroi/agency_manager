'use client'

import { useState, useEffect } from 'react'
import { getClients } from '@/actions/crm-actions'

type Client = {
    id: number
    name: string
    subsidiaries: Client[]
    // projects?: any[] // If we use projects later
}

export default function ClientSelector({ onSelect }: { onSelect: (id: number | null) => void }) {
    const [partners, setPartners] = useState<Client[]>([])
    const [selectedPartner, setSelectedPartner] = useState<Client | null>(null)
    const [selectedSub, setSelectedSub] = useState<number | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function loadClients() {
            setLoading(true)
            const res = await getClients()
            if (res.success && res.data) {
                // @ts-ignore - mismatch in type definition vs prisma but sufficient for UI
                setPartners(res.data)
            }
            setLoading(false)
        }
        loadClients()
    }, [])

    const handlePartnerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const pId = parseInt(e.target.value)
        if (!pId) {
            setSelectedPartner(null)
            onSelect(null)
            return
        }
        const partner = partners.find(p => p.id === pId) || null
        setSelectedPartner(partner)
        setSelectedSub(null) // Reset sub

        // If partner has no subsidiaries, selecting partner is final
        if (partner && partner.subsidiaries.length === 0) {
            onSelect(partner.id)
        } else if (partner) {
            // If has subs, wait for sub selection? Or default to partner?
            // Usually if Client has sub-clients (e.g. Agency), tasks belong to sub-clients.
            // But sometimes the Agency itself has a general task.
            // Let's set ID to Partner first, overridden if Sub is picked.
            onSelect(partner.id)
        }
    }

    const handleSubChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const sId = parseInt(e.target.value)
        setSelectedSub(sId || null)
        onSelect(sId || selectedPartner?.id || null)
    }

    if (loading) return <div className="text-gray-500 text-xs">Loading clients...</div>

    return (
        <div className="space-y-4">
            <div>
                <label className="block text-xs text-gray-400 mb-1">Khách hàng Đối tác (Partner)</label>
                <select
                    className="w-full p-2 bg-[#222] border border-[#333] rounded text-white text-sm"
                    onChange={handlePartnerChange}
                    value={selectedPartner?.id || ''}
                >
                    <option value="">-- Chọn Đối tác --</option>
                    {partners.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
            </div>

            {selectedPartner && selectedPartner.subsidiaries.length > 0 && (
                <div className="animate-fade-in">
                    <label className="block text-xs text-gray-400 mb-1">Khách hàng Trực thuộc (End Client)</label>
                    <div className="flex gap-2">
                        <select
                            className="w-full p-2 bg-[#2a2a2a] border border-[#444] rounded text-white text-sm"
                            onChange={handleSubChange}
                            value={selectedSub || ''}
                        >
                            <option value="">-- Task chung của {selectedPartner.name} --</option>
                            {selectedPartner.subsidiaries.map(s => (
                                <option key={s.id} value={s.id}>↳ {s.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            )}
        </div>
    )
}
