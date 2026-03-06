'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Globe } from 'lucide-react'
import { useState } from 'react'

const LOCALES = [
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
    { code: 'zh', label: '中文', flag: '🇨🇳' },
    { code: 'ru', label: 'Русский', flag: '🇷🇺' },
    { code: 'it', label: 'Italiano', flag: '🇮🇹' },
]

export default function LanguageSwitcher({ currentLocale }: { currentLocale: string }) {
    const pathname = usePathname()
    const router = useRouter()
    const [open, setOpen] = useState(false)

    const switchLocale = (newLocale: string) => {
        // Replace the current locale segment in the URL
        // URL format: /portal/[locale]/...
        const segments = pathname.split('/')
        // segments[0] = '', segments[1] = 'portal', segments[2] = locale
        if (segments[2]) {
            segments[2] = newLocale
        }
        const newPath = segments.join('/')
        router.push(newPath)
        setOpen(false)
    }

    const current = LOCALES.find(l => l.code === currentLocale) ?? LOCALES[0]

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-zinc-400 rounded-lg hover:bg-zinc-800/50 hover:text-indigo-300 transition-all duration-300"
            >
                <Globe size={18} />
                <span className="flex-1 text-left">{current.flag} {current.label}</span>
                <svg
                    className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {open && (
                <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />

                    {/* Dropdown */}
                    <div className="absolute bottom-full left-0 right-0 mb-2 z-20 bg-zinc-900 border border-zinc-700/80 rounded-xl overflow-hidden shadow-xl shadow-black/40 backdrop-blur">
                        {LOCALES.map(locale => (
                            <button
                                key={locale.code}
                                onClick={() => switchLocale(locale.code)}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left
                                    ${locale.code === currentLocale
                                        ? 'bg-indigo-600/20 text-indigo-300 font-medium'
                                        : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                                    }`}
                            >
                                <span className="text-base">{locale.flag}</span>
                                <span>{locale.label}</span>
                                {locale.code === currentLocale && (
                                    <svg className="ml-auto w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}
