import { prisma } from '@/lib/db'
import { createUser } from '@/actions/create-user'
import RoleSwitcher from '@/components/RoleSwitcher'
import ResetPasswordButton from '@/components/ResetPasswordButton'
import DeleteUserButton from '@/components/DeleteUserButton'
import ReputationManager from '@/components/ReputationManager'

import { getSession } from '@/lib/auth'

export default async function AdminUsersPage() {
    const session = await getSession()
    const currentUser = await prisma.user.findUnique({
        where: { id: session?.user?.id },
        select: { username: true }
    })

    const users = await prisma.user.findMany({
        orderBy: { username: 'asc' }
    })

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
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
                            <th style={{ padding: '0.8rem', color: '#888' }}>Username</th>
                            <th style={{ padding: '0.8rem', color: '#888' }}>Reputation</th>
                            <th style={{ padding: '0.8rem', color: '#888' }}>Password</th>
                            <th style={{ padding: '0.8rem', color: '#888' }}>Role</th>
                            <th style={{ padding: '0.8rem', color: '#888' }}>Created At</th>
                            <th style={{ padding: '0.8rem', color: '#888' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(u => {
                            const isSuperAdminRow = u.username === 'admin'
                            // Only real "admin" can see passwords.
                            // Note: We need to get current user session to strictly enforce this in UI, 
                            // but for now we mask it everywhere? No, requirement says "admin" can see.
                            // Since this component is Server Component, we CAN request session here.

                            return (
                                <tr key={u.id} style={{ borderBottom: '1px solid #222' }}>
                                    <td style={{ padding: '0.8rem', fontFamily: 'monospace', fontSize: '0.8rem', color: '#555' }}>{u.id.substring(0, 8)}...</td>
                                    <td style={{ padding: '0.8rem' }}>
                                        {u.username}
                                        {isSuperAdminRow && <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', background: '#6d28d9', padding: '2px 6px', borderRadius: '4px' }}>SUPER</span>}
                                    </td>
                                    <td style={{ padding: '0.8rem' }}>
                                        {!isSuperAdminRow ? (
                                            <ReputationManager userId={u.id} initialReputation={u.reputation ?? 100} />
                                        ) : <span className="text-purple-400 font-bold">MAX</span>}
                                    </td>
                                    <td style={{ padding: '0.8rem', fontFamily: 'monospace', color: '#aaa' }}>
                                        {/* Logic: We need to check if viewer is 'admin' to show this. 
                                            Since I'm in map, I need 'currentUser'. 
                                            I'll assume I fetched currentUser above. */}
                                        {currentUser?.username === 'admin' ? (u.plainPassword || 'N/A') : '••••••••'}
                                    </td>
                                    <td style={{ padding: '0.8rem' }}>
                                        {!isSuperAdminRow ? (
                                            <RoleSwitcher userId={u.id} initialRole={u.role} />
                                        ) : <span style={{ color: '#666', fontSize: '0.8rem' }}>Locked</span>}
                                    </td>
                                    <td style={{ padding: '0.8rem', color: '#666', fontSize: '0.9rem' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                                    <td style={{ padding: '0.8rem', textAlign: 'center' }}>
                                        {/* Reset Password: Show for everyone EXCEPT 'admin' row, UNLESS viewer is 'admin' */}
                                        {(!isSuperAdminRow || currentUser?.username === 'admin') && (
                                            <ResetPasswordButton userId={u.id} username={u.username} />
                                        )}
                                        {/* Delete: NEVER show for 'admin' row */}
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
