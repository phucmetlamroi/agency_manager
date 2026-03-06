import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'

export default async function LocaleLayout({
    children,
    params
}: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    if (!routing.locales.includes(locale as any)) {
        notFound();
    }

    // Providing all messages to the client side
    const messages = await getMessages();

    return (
        <NextIntlClientProvider messages={messages}>
            <div className="locale-wrapper w-full min-h-screen text-foreground relative antialiased" style={{ colorScheme: 'dark' }}>
                {children}
            </div>
        </NextIntlClientProvider>
    );
}
