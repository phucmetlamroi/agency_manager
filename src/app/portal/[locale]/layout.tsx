import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { getSession } from '@/lib/auth'
import { FileText, CheckSquare, LogOut } from 'lucide-react'
import { ReactNode } from 'react'
import Link from 'next/link'

export default async function LocaleLayout({
    children,
    params
}: {
    children: ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    if (!routing.locales.includes(locale as any)) {
        notFound();
    }

    const session = await getSession()
    if (!session || session.user.role !== 'CLIENT') {
        redirect('/login')
    }

    // Providing all messages to the client side
    const messages = await getMessages();

    return (
        <NextIntlClientProvider messages={messages} locale={locale}>
            <div className="flex h-screen w-full bg-zinc-950 text-slate-200 overflow-hidden font-sans antialiased" style={{ colorScheme: 'dark' }}>
                {/* Sidebar - Frame.io aesthetic */}
                <aside className="w-64 flex-shrink-0 border-r border-zinc-800 bg-zinc-950/50 backdrop-blur-xl flex flex-col justify-between">
                    <div className="p-6">
                        <div className="flex items-center gap-3 mb-10">
                            <div className="w-8 h-8 rounded bg-gradient-to-tr from-indigo-500 to-purple-600 shadow-[0_0_15px_rgba(99,102,241,0.5)]"></div>
                            <h1 className="text-xl font-bold tracking-tight text-white drop-shadow-md">Client Portal</h1>
                        </div>

                        <nav className="space-y-2">
                            <SidebarLink locale={locale} href="/invoices" icon={<FileText size={18} />} label="Hóa đơn" />
                            <SidebarLink locale={locale} href="/tasks" icon={<CheckSquare size={18} />} label="Tác vụ" />
                        </nav>
                    </div>

                    <div className="p-6 border-t border-zinc-800/60">
                        <div className="flex items-center gap-3 hover:bg-zinc-900/50 p-2 rounded-lg cursor-pointer transition-colors group">
                            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-white transition-colors">
                                <LogOut size={16} />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-zinc-300 group-hover:text-white">Đăng xuất</p>
                                <p className="text-xs text-zinc-500">{session.user.username}</p>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className="flex-1 relative overflow-y-auto bg-zinc-950">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900/40 via-zinc-950 to-zinc-950 -z-10 pointer-events-none"></div>
                    {children}
                </main>
            </div>
        </NextIntlClientProvider>
    );
}

function SidebarLink({ locale, href, icon, label }: { locale: string, href: string; icon: ReactNode; label: string }) {
    return (
        <Link
            href={`/portal/${locale}${href}`}
            className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-zinc-400 rounded-lg hover:bg-zinc-800/50 hover:text-indigo-300 transition-all duration-300 hover:shadow-[inset_2px_0_0_rgba(99,102,241,1)]"
        >
            {icon}
            <span>{label}</span>
        </Link>
    );
}
