import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import { headers } from 'next/headers';

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
        messages: (await import(`../../messages/${locale}.json`)).default
    };
});


