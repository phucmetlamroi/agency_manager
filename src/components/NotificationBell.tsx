'use client'

import { useState, useEffect } from 'react'
import { getNotifications, markAsRead } from '@/actions/notification-actions'

type Notification = {
    id: string
    message: string
    type: string
    isRead: boolean
    createdAt: Date
    userId: string | null
}

export default function NotificationBell() {
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [isOpen, setIsOpen] = useState(false)
    const [unreadCount, setUnreadCount] = useState(0)

    const fetchNotifications = async () => {
        const data = await getNotifications() as Notification[]
        setNotifications(data)
        setUnreadCount(data.filter(n => !n.isRead).length)
    }

    useEffect(() => {
        fetchNotifications()
        // Poll every 30 seconds for new notifications?
        const interval = setInterval(fetchNotifications, 30000)
        return () => clearInterval(interval)
    }, [])

    const handleMarkRead = async (id: string) => {
        await markAsRead(id)
        setNotifications(prev => prev.filter(n => n.id !== id))
        setUnreadCount(prev => Math.max(0, prev - 1))
    }

    return (
        <div style={{ position: 'relative' }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem',
                    position: 'relative', color: '#ccc'
                }}
            >
                🔔
                {unreadCount > 0 && (
                    <span style={{
                        position: 'absolute',
                        top: '-5px',
                        right: '-5px',
                        background: '#ef4444',
                        color: 'white',
                        fontSize: '0.6rem',
                        fontWeight: 'bold',
                        borderRadius: '50%',
                        width: '18px',
                        height: '18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        {unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '120%',
                    right: 0,
                    width: '320px',
                    background: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: '8px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                    zIndex: 100,
                    maxHeight: '400px',
                    overflowY: 'auto'
                }}>
                    <div style={{ padding: '0.8rem', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#fff' }}>Thông báo</h4>
                        <button
                            onClick={() => setIsOpen(false)}
                            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.2rem' }}
                        >
                            ×
                        </button>
                    </div>

                    {notifications.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#666', fontSize: '0.85rem' }}>
                            Không có thông báo mới
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {notifications.map(n => (
                                <div key={n.id}
                                    onClick={() => handleMarkRead(n.id)}
                                    style={{
                                        padding: '0.8rem',
                                        borderBottom: '1px solid #222',
                                        // UNREAD: Reddish tint. READ: Gray/Transparent & Dimmed
                                        background: !n.isRead
                                            ? 'rgba(185, 28, 28, 0.15)' // Red tint for unread
                                            : 'rgba(255, 255, 255, 0.02)', // Gray/translucent for read
                                        opacity: !n.isRead ? 1 : 0.6,
                                        display: 'flex',
                                        gap: '0.5rem',
                                        cursor: 'pointer',
                                        transition: 'background 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = !n.isRead ? 'rgba(185, 28, 28, 0.25)' : 'rgba(255, 255, 255, 0.05)'
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = !n.isRead ? 'rgba(185, 28, 28, 0.15)' : 'rgba(255, 255, 255, 0.02)'
                                    }}
                                >
                                    <span style={{ fontSize: '1rem' }}>
                                        {n.type === 'WARNING' ? '⚠️' : 'ℹ️'}
                                    </span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{
                                            fontSize: '0.85rem',
                                            color: !n.isRead ? '#fff' : '#9ca3af', // White if unread, gray if read
                                            fontWeight: !n.isRead ? '600' : '400',
                                            marginBottom: '0.3rem'
                                        }}>
                                            {n.message}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.7rem', color: '#666' }}>
                                                {new Date(n.createdAt).toLocaleString('vi-VN')}
                                            </span>
                                            {!n.isRead && (
                                                <span style={{ fontSize: '0.7rem', color: '#f87171' }}>● Mới</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {isOpen && (
                <div
                    onClick={() => setIsOpen(false)}
                    style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 99 }}
                />
            )}
        </div>
    )
}
