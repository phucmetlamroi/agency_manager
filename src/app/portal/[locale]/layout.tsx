import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { getSession } from '@/lib/auth'
import { ReactNode } from 'react'
import PresenceTracker from '@/components/tracking/PresenceTracker'

export default async function LocaleLayout({
    children,
    params
}: {
    children: ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;

    // Validate locale
    if (!routing.locales.includes(locale as any)) {
        notFound();
    }

    // This is the KEY FIX: tell next-intl which locale to use for this request
    setRequestLocale(locale);

    const session = await getSession()
    if (!session || session.user.role !== 'CLIENT') {
        redirect('/login')
    }

    // Explicitly load the right messages file for this locale
    const messages = await getMessages({ locale });

    return (
        <NextIntlClientProvider messages={messages} locale={locale}>
            <PresenceTracker currentUserId={session.user.id} />
            {children}
        </NextIntlClientProvider>
    );
}

