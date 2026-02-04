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
                <div
                    className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={handleCancel}
                >
                    <div
                        className="bg-[#1a1a1a]/90 border border-white/10 rounded-2xl p-6 w-[90%] max-w-md shadow-2xl transform scale-100 animate-in zoom-in-95 duration-200 relative overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Ambient Glow */}
                        <div className={`absolute -top-20 -left-20 w-40 h-40 rounded-full blur-[80px] opacity-20 pointer-events-none
                            ${options.type === 'danger' ? 'bg-red-500' : 'bg-blue-500'}`}
                        />

                        <div className="relative z-10">
                            <h3 className={`text-xl font-bold mb-3 flex items-center gap-2
                                ${options.type === 'danger' ? 'text-red-400' : 'text-blue-400'}`}
                            >
                                {options.type === 'danger' && '⚠️'}
                                {options.title || 'Xác nhận hành động'}
                            </h3>

                            <p className="text-gray-300 mb-6 leading-relaxed text-sm font-medium">
                                {options.message}
                            </p>

                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={handleCancel}
                                    className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 font-bold text-sm hover:bg-white/10 hover:text-white transition-colors"
                                >
                                    {options.cancelText || 'Hủy bỏ'}
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    className={`px-5 py-2 rounded-xl font-bold text-sm shadow-lg transition-all transform hover:scale-105 active:scale-95
                                        ${options.type === 'danger'
                                            ? 'bg-gradient-to-r from-red-600 to-pink-600 text-white shadow-red-500/20'
                                            : 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-blue-500/20'
                                        }`}
                                >
                                    {options.confirmText || 'Xác nhận'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    )
}
