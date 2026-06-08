import { NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { getSession } from '@/lib/auth'
import { getPortalUserId } from '@/actions/client-portal-actions'
import { ReactNode } from 'react'
import PresenceTracker from '@/components/tracking/PresenceTracker'

// [F5 bypass-getMessages] Static imports for all locales. We previously called
// `getMessages({ locale })` here, but on Vercel + Turbopack + `output: 'standalone'`
// the locale dictionary is loaded through `src/i18n/request.ts`, and even after
// switching request.ts to static imports the function-bundle tracer still
// reported `Error: Failed to load external "../../messages/en.json"`. Skipping
// `getMessages()` entirely and passing the dictionary inline removes the last
// dynamic-import hop on this code path.
import enMessages from '../../../../messages/en.json'
import viMessages from '../../../../messages/vi.json'
import zhMessages from '../../../../messages/zh.json'
import itMessages from '../../../../messages/it.json'
import ruMessages from '../../../../messages/ru.json'

const messagesByLocale: Record<string, any> = {
    en: enMessages,
    vi: viMessages,
    zh: zhMessages,
    it: itMessages,
    ru: ruMessages,
}

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
    if (!session?.user?.id) {
        redirect('/login')
    }
    // [Client membership] Allow legacy global CLIENT OR any per-profile CLIENT membership.
    await getPortalUserId()

    // [F5] Inline dictionary lookup — bypass next-intl's `getMessages()` to
    // avoid the Turbopack "Failed to load external" trace miss on the portal
    // function bundle. Tree-shaken locales are still bundled.
    const messages = messagesByLocale[locale] ?? messagesByLocale[routing.defaultLocale]

    return (
        <NextIntlClientProvider messages={messages} locale={locale}>
            <PresenceTracker currentUserId={session.user.id} />
            {children}
        </NextIntlClientProvider>
    );
}
