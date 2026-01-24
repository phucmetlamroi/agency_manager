'use client'

import { updateUserRole } from '@/actions/admin-actions'
import { useState } from 'react'

export default function RoleSwitcher({ userId, initialRole }: { userId: string, initialRole: string }) {
    const [role, setRole] = useState(initialRole)
    const [loading, setLoading] = useState(false)

    const handleChange = async (newRole: string) => {
        setRole(newRole)
        setLoading(true)
        await updateUserRole(userId, newRole)
        setLoading(false)
    }

    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            <select
                value={role}
                onChange={(e) => handleChange(e.target.value)}
                disabled={loading}
                style={{
                    padding: '0.3rem 0.6rem',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    border: 'none',
                    cursor: 'pointer',
                    background: role === 'ADMIN' ? 'rgba(109, 40, 217, 0.2)' : 'rgba(3, 218, 198, 0.1)',
                    color: role === 'ADMIN' ? '#a78bfa' : 'var(--secondary)',
                    fontWeight: '600',
                    outline: 'none',
                    opacity: loading ? 0.7 : 1
                }}
            >
                <option value="USER" style={{ color: 'black' }}>User</option>
                <option value="ADMIN" style={{ color: 'black' }}>Admin</option>
            </select>
            {loading && <span style={{ position: 'absolute', right: -20, fontSize: '0.8rem' }}>⌛</span>}
        </div>
    )
}
