'use client'

import { useState } from 'react'
import { updateUserReputation } from '@/actions/admin-actions'

export default function ReputationManager({ userId, initialReputation }: { userId: string, initialReputation: number }) {
    const [reputation, setReputation] = useState(initialReputation)
    const [loading, setLoading] = useState(false)

    const handleUpdate = async (change: number) => {
        if (loading) return

        // Optimistic update
        const newRep = reputation + change
        if (newRep > 100) return // Cap at 100

        setReputation(newRep)
        setLoading(true)

        const res = await updateUserReputation(userId, change)
        if (res?.error) {
            // Revert on error
            setReputation(reputation)
            alert(res.error)
        }
        setLoading(false)
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{
                fontWeight: 'bold',
                color: reputation >= 90 ? '#a855f7' : reputation < 50 ? '#eab308' : '#fff',
                minWidth: '30px',
                textAlign: 'center'
            }}>
                {reputation}
            </span>
            <div style={{ display: 'flex', gap: '2px' }}>
                <button
                    onClick={() => handleUpdate(-1)}
                    disabled={loading}
                    style={{
                        background: '#333', border: '1px solid #444', color: '#f87171',
                        width: '24px', height: '24px', borderRadius: '4px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                    title="-1 Point"
                >
                    -
                </button>
                <button
                    onClick={() => handleUpdate(5)}
                    disabled={loading || reputation >= 100}
                    style={{
                        background: '#333', border: '1px solid #444', color: '#4ade80',
                        width: '24px', height: '24px', borderRadius: '4px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                    title="+5 Points"
                >
                    +
                </button>
            </div>
        </div>
    )
}
