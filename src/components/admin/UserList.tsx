'use client'

import RoleSwitcher from '@/components/RoleSwitcher'
import ResetPasswordButton from '@/components/ResetPasswordButton'
import DeleteUserButton from '@/components/DeleteUserButton'
import ReputationManager from '@/components/ReputationManager'
import TreasurerToggle from '@/components/TreasurerToggle'
import { createUser } from '@/actions/create-user'

type Props = {
    users: any[]
    currentUser: any
    agencies?: any[]
}

export default function UserList({ users, currentUser, agencies }: Props) {
    return (
        <div>
            <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '1rem' }}>Thêm tài khoản mới</h3>
                <form action={async (formData) => {
                    await createUser(formData)
                }} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem' }}>Username</label>
                        <input name="username" required style={{ padding: '0.6rem', borderRadius: '6px', border: 'none', background: '#333', color: 'white' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem' }}>Password</label>
                        <input name="password" required type="password" style={{ padding: '0.6rem', borderRadius: '6px', border: 'none', background: '#333', color: 'white' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem' }}>Role</label>
                        <select name="role" style={{ padding: '0.6rem', borderRadius: '6px', border: 'none', background: '#333', color: 'white' }}>
                            <option value="USER">User</option>
                            <option value="ADMIN">Admin</option>
                        </select>
                    </div>
                    {agencies && agencies.length > 0 && (
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem' }}>Agency (Optional)</label>
                            <select name="agencyId" style={{ padding: '0.6rem', borderRadius: '6px', border: 'none', background: '#333', color: 'white', maxWidth: '150px' }}>
                                <option value="">-- None --</option>
                                {agencies.map(a => (
                                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <button className="btn btn-primary" type="submit">Thêm User</button>
                </form>
            </div>

            <div className="glass-panel" style={{ padding: '1rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #333' }}>
                            <th style={{ padding: '0.8rem', color: '#888' }}>ID</th>
                            <th style={{ padding: '0.8rem', color: '#888' }}>Thành viên</th>
                            <th style={{ padding: '0.8rem', color: '#888' }}>Liên hệ</th>
                            <th style={{ padding: '0.8rem', color: '#888' }}>Reputation</th>
                            <th style={{ padding: '0.8rem', color: '#888' }}>Role</th>
                            <th style={{ padding: '0.8rem', color: '#888' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(u => {
                            const isSuperAdminRow = u.username === 'admin'
                            const displayName = u.nickname || u.username

                            return (
                                <tr key={u.id} style={{ borderBottom: '1px solid #222' }}>
                                    <td style={{ padding: '0.8rem', fontFamily: 'monospace', fontSize: '0.8rem', color: '#555' }}>{u.id.substring(0, 8)}...</td>

                                    {/* Member Column: Nickname + Username */}
                                    <td style={{ padding: '0.8rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontWeight: 'bold', color: '#e5e7eb', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                {/* If Agency Owner, show Agency Name instead of User Name if preferred, OR show both? 
                                                   User requested "Display as Agency Name". 
                                                   Let's show [Agency Code] - [Agency Name] as primary name if owner. */}
                                                {u.ownedAgency && u.ownedAgency.length > 0 ? (
                                                    <span className="text-cyan-400 font-bold flex items-center gap-1">
                                                        🏢 {u.ownedAgency[0].code} - {u.ownedAgency[0].name}
                                                    </span>
                                                ) : displayName}

                                                {u.isTreasurer && <span title="Thủ Quỹ" style={{ cursor: 'help' }}>🥇</span>}
                                                {isSuperAdminRow && <span style={{ fontSize: '0.7rem', background: '#6d28d9', padding: '2px 6px', borderRadius: '4px', color: 'white' }}>SUPER</span>}

                                                {/* Agency Owner Badge (Crystal Blue) */}
                                                {u.ownedAgency && u.ownedAgency.length > 0 && (
                                                    <span style={{
                                                        fontSize: '0.7rem',
                                                        background: 'rgba(6, 182, 212, 0.2)', // Cyan-500/20
                                                        border: '1px solid rgba(6, 182, 212, 0.5)',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px',
                                                        color: '#22d3ee', // Cyan-400
                                                        fontWeight: 'bold',
                                                        textTransform: 'uppercase'
                                                    }}>
                                                        ĐẠI LÝ
                                                    </span>
                                                )}

                                                {/* Agency Member Badge */}
                                                {!isSuperAdminRow && !u.ownedAgency?.length && u.agency && (
                                                    <span style={{
                                                        fontSize: '0.7rem',
                                                        background: 'rgba(56, 189, 248, 0.15)', // Sky-400/15
                                                        border: '1px dashed rgba(56, 189, 248, 0.4)',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px',
                                                        color: '#38bdf8', // Sky-400
                                                        fontWeight: 'bold'
                                                    }}>
                                                        {u.agency.code}
                                                    </span>
                                                )}
                                            </span>
                                            {u.nickname && (
                                                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>@{u.username}</span>
                                            )}
                                        </div>
                                    </td>

                                    {/* Contact Column */}
                                    <td style={{ padding: '0.8rem', fontSize: '0.85rem' }}>
                                        {u.email ? (
                                            <div style={{ color: '#9ca3af', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span>✉️</span>
                                                <span style={{ color: '#d1d5db' }}>{u.email}</span>
                                            </div>
                                        ) : (
                                            <div style={{ color: '#ef4444', fontWeight: 'bold', background: 'rgba(239, 68, 68, 0.1)', padding: '2px 6px', borderRadius: '4px', display: 'inline-block' }}>
                                                ⚠️ Chưa có Email
                                            </div>
                                        )}

                                        {u.phoneNumber ? (
                                            <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '2px' }}>📞 {u.phoneNumber}</div>
                                        ) : <div style={{ color: '#4b5563', fontSize: '0.8rem', fontStyle: 'italic' }}>Chưa có SĐT</div>}
                                    </td>

                                    <td style={{ padding: '0.8rem' }}>
                                        {!isSuperAdminRow ? (
                                            <ReputationManager userId={u.id} initialReputation={u.reputation ?? 100} />
                                        ) : <span className="text-purple-400 font-bold">MAX</span>}
                                    </td>

                                    <td style={{ padding: '0.8rem' }}>
                                        {!isSuperAdminRow ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <RoleSwitcher userId={u.id} initialRole={u.role} />
                                                {currentUser?.username === 'admin' && u.role === 'ADMIN' && (
                                                    <TreasurerToggle userId={u.id} isTreasurer={u.isTreasurer} />
                                                )}
                                            </div>
                                        ) : <span style={{ color: '#666', fontSize: '0.8rem' }}>Locked</span>}
                                    </td>

                                    <td style={{ padding: '0.8rem', textAlign: 'center' }}>
                                        {(!isSuperAdminRow || currentUser?.username === 'admin') && (
                                            <ResetPasswordButton userId={u.id} username={u.username} />
                                        )}
                                        {!isSuperAdminRow && <DeleteUserButton userId={u.id} />}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
