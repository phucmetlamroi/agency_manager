'use client'

import React, { createContext, useContext, useState, useCallback, useRef } from 'react'

type ConfirmOptions = {
    title?: string
    message: string
    confirmText?: string
    cancelText?: string
    type?: 'danger' | 'info' | 'warning'
}

type ConfirmContextType = {
    confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined)

export function useConfirm() {
    const context = useContext(ConfirmContext)
    if (!context) {
        throw new Error('useConfirm must be used within a ConfirmProvider')
    }
    return context
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false)
    const [options, setOptions] = useState<ConfirmOptions>({ message: '' })
    const resolveRef = useRef<(value: boolean) => void>(() => { })

    const confirm = useCallback((opts: ConfirmOptions) => {
        setOptions(opts)
        setIsOpen(true)
        return new Promise<boolean>((resolve) => {
            resolveRef.current = resolve
        })
    }, [])

    const handleConfirm = () => {
        setIsOpen(false)
        resolveRef.current(true)
    }

    const handleCancel = () => {
        setIsOpen(false)
        resolveRef.current(false)
    }

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}
            {isOpen && (
                <div style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    zIndex: 99999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'fadeIn 0.2s ease-out'
                }} onClick={handleCancel}>
                    <div style={{
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: '16px',
                        padding: '1.5rem',
                        width: '90%', maxWidth: '400px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        transform: 'scale(1)',
                        animation: 'scaleIn 0.2s ease-out'
                    }} onClick={e => e.stopPropagation()}>
                        <h3 style={{
                            fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem',
                            color: options.type === 'danger' ? '#ef4444' : 'white'
                        }}>
                            {options.title || 'Xác nhận?'}
                        </h3>
                        <p style={{ color: '#9ca3af', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                            {options.message}
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button
                                onClick={handleCancel}
                                style={{
                                    padding: '0.5rem 1rem',
                                    borderRadius: '8px',
                                    background: 'transparent',
                                    border: '1px solid #444',
                                    color: '#ccc',
                                    cursor: 'pointer',
                                    fontWeight: 500
                                }}
                            >
                                {options.cancelText || 'Hủy bỏ'}
                            </button>
                            <button
                                onClick={handleConfirm}
                                style={{
                                    padding: '0.5rem 1rem',
                                    borderRadius: '8px',
                                    background: options.type === 'danger' ? '#ef4444' : '#3b82f6',
                                    border: 'none',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                }}
                            >
                                {options.confirmText || 'Xác nhận'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    )
}
