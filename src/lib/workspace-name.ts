/**
 * Utility to localize Vietnamese workspace names like "Tháng X/YYYY"
 * to the appropriate language based on the current locale.
 *
 * Pattern matched: "Tháng {month}/{year}" (case-insensitive)
 */

// Vietnamese month number -> locale-aware month name
const MONTH_NAMES: Record<string, string[]> = {
    en: [
        'January', 'February', 'March', 'April',
        'May', 'June', 'July', 'August',
        'September', 'October', 'November', 'December'
    ],
    vi: [
        'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
        'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
        'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
    ],
    zh: [
        '一月', '二月', '三月', '四月',
        '五月', '六月', '七月', '八月',
        '九月', '十月', '十一月', '十二月'
    ],
    ru: [
        'Январь', 'Февраль', 'Март', 'Апрель',
        'Май', 'Июнь', 'Июль', 'Август',
        'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ],
    it: [
        'Gennaio', 'Febbraio', 'Marzo', 'Aprile',
        'Maggio', 'Giugno', 'Luglio', 'Agosto',
        'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
    ],
}

// Format template per locale e.g. "March 2026" or "2026年3月"
function formatMonthYear(month: number, year: number, locale: string): string {
    switch (locale) {
        case 'zh':
            return `${year}年${MONTH_NAMES.zh[month - 1] ?? month + '月'}`
        case 'ru':
            return `${MONTH_NAMES.ru[month - 1] ?? month} ${year}`
        case 'it':
            return `${MONTH_NAMES.it[month - 1] ?? month} ${year}`
        case 'vi':
            return `Tháng ${month}/${year}`
        case 'en':
        default:
            return `${MONTH_NAMES.en[month - 1] ?? 'Month ' + month} ${year}`
    }
}

/**
 * Detects if a workspace name matches the Vietnamese "Tháng X/YYYY" pattern
 * and returns a localized version. If no match, returns the original name.
 */
export function localizeWorkspaceName(name: string, locale: string): string {
    // Match "Tháng X/YYYY" pattern (flexible whitespace & case)
    const match = name.match(/[Tt]h[áa]ng\s+(\d{1,2})\/(\d{4})/u)
    if (!match) return name

    const month = parseInt(match[1], 10)
    const year = parseInt(match[2], 10)

    if (month < 1 || month > 12) return name

    return formatMonthYear(month, year, locale)
}
