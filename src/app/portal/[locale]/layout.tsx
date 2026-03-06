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

    const messages = await getMessages();

    return (
        <NextIntlClientProvider messages={messages} locale={locale}>
            {children}
        </NextIntlClientProvider>
    );
}
