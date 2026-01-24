import { prisma } from '@/lib/db'
import { createUser } from '@/actions/create-user'
import RoleSwitcher from '@/components/RoleSwitcher'

export default async function AdminUsersPage() {
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
                            <th style={{ padding: '0.8rem', color: '#888' }}>Password</th>
                            <th style={{ padding: '0.8rem', color: '#888' }}>Role</th>
                            <th style={{ padding: '0.8rem', color: '#888' }}>Created At</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(u => (
                            <tr key={u.id} style={{ borderBottom: '1px solid #222' }}>
                                <td style={{ padding: '0.8rem', fontFamily: 'monospace', fontSize: '0.8rem', color: '#555' }}>{u.id.substring(0, 8)}...</td>
                                <td style={{ padding: '0.8rem' }}>{u.username}</td>
                                <td style={{ padding: '0.8rem', fontFamily: 'monospace', color: '#aaa' }}>{u.plainPassword || 'N/A'}</td>
                                <td style={{ padding: '0.8rem' }}>
                                    <RoleSwitcher userId={u.id} initialRole={u.role} />
                                </td>
                                <td style={{ padding: '0.8rem', color: '#666', fontSize: '0.9rem' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
