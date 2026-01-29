import { prisma } from '@/lib/db'
import { createUser } from '@/actions/create-user'
import RoleSwitcher from '@/components/RoleSwitcher'
import ResetPasswordButton from '@/components/ResetPasswordButton'
import DeleteUserButton from '@/components/DeleteUserButton'
import ReputationManager from '@/components/ReputationManager'
import TreasurerToggle from '@/components/TreasurerToggle'

import { getSession } from '@/lib/auth'

export default async function AdminUsersPage() {
    const session = await getSession()
    const currentUser = await prisma.user.findUnique({
        where: { id: session?.user?.id },
        select: { username: true }
    })

    const users = await prisma.user.findMany({
        where: currentUser?.username === 'admin' ? {} : { username: { not: 'admin' } },
        orderBy: { username: 'asc' },
        include: { _count: { select: { tasks: true } } }
    })

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <h2 className="title-gradient" style={{ marginBottom: '2rem' }}>Quản lý nhân viên</h2>

            <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '1rem' }}>Thêm tài khoản mới</h3>
                <form action={async (formData) => {
                    'use server'
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
                                            <span style={{ fontWeight: 'bold', color: '#e5e7eb' }}>
                                                {displayName}
                                                {u.isTreasurer && <span title="Thủ Quỹ" style={{ marginLeft: '0.5rem' }}>🥇</span>}
                                                {isSuperAdminRow && <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', background: '#6d28d9', padding: '2px 6px', borderRadius: '4px', color: 'white' }}>SUPER</span>}
                                            </span>
                                            {u.nickname && (
                                                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>@{u.username}</span>
                                            )}
                                        </div>
                                    </td>

                                    {/* Contact Column */}
                                    <td style={{ padding: '0.8rem', fontSize: '0.85rem' }}>
                                        {u.email ? (
                                            <div style={{ color: '#9ca3af', marginBottom: '2px' }}>✉️ {u.email}</div>
                                        ) : <div style={{ color: '#4b5563', fontStyle: 'italic' }}>No email</div>}

                                        {u.phoneNumber && (
                                            <div style={{ color: '#9ca3af' }}>iphone: {u.phoneNumber}</div>
                                        )}
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
