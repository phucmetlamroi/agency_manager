import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import { headers } from 'next/headers';

export default getRequestConfig(async ({ requestLocale }) => {
    // Primary: try requestLocale from next-intl context
    let locale = await requestLocale;

    // Fallback: read locale from URL path directly
    if (!locale || !routing.locales.includes(locale as any)) {
        const headersList = await headers();
        const url = headersList.get('x-invoke-path') || headersList.get('x-url') || '';
        // URL pattern: /portal/[locale]/...
        const match = url.match(/\/portal\/([a-z]{2})(\/|$)/);
        if (match && routing.locales.includes(match[1] as any)) {
            locale = match[1];
        } else {
            locale = routing.defaultLocale;
        }
    }

    return {
        locale,
        messages: (await import(`../../messages/${locale}.json`)).default
    };
});

