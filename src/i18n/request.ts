import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import { headers } from 'next/headers';

/**
 * [Locale messages — static imports]
 *
 * Previously we used `await import(\`../../messages/${locale}.json\`)`.
 * Under Turbopack + `output: 'standalone'` (Vercel production), the dynamic
 * template-literal import didn't get traced into the serverless function
 * bundle reliably, surfacing as `Error: Failed to load external "messages/..."`
 * and a 500 the moment any portal/admin page hit `getMessages()`.
 *
 * Static imports are bundled deterministically. Each JSON file is ~tiny
 * (translation map) — tree-shaking isn't needed.
 */
import enMessages from '../../messages/en.json';
import viMessages from '../../messages/vi.json';
import zhMessages from '../../messages/zh.json';
import itMessages from '../../messages/it.json';
import ruMessages from '../../messages/ru.json';

const messagesByLocale: Record<string, Record<string, unknown>> = {
    en: enMessages as Record<string, unknown>,
    vi: viMessages as Record<string, unknown>,
    zh: zhMessages as Record<string, unknown>,
    it: itMessages as Record<string, unknown>,
    ru: ruMessages as Record<string, unknown>,
};

export default getRequestConfig(async ({ requestLocale }) => {
    // Try requestLocale first (may work in some contexts)
    let locale = await requestLocale;

    // Primary reliable source: read from the header we inject in middleware
    if (!locale || !routing.locales.includes(locale as any)) {
        const headersList = await headers();
        const injectedLocale = headersList.get('x-portal-locale');
        if (injectedLocale && routing.locales.includes(injectedLocale as any)) {
            locale = injectedLocale;
        } else {
            locale = routing.defaultLocale;
        }
    }

    return {
        locale,
        messages: messagesByLocale[locale] ?? messagesByLocale[routing.defaultLocale],
    };
});
