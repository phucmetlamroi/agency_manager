export function parseVietnamDate(dateStr: string): Date {
    // Ensure we have a string
    if (!dateStr) return new Date()

    // If already has timezone (e.g. ends with Z or +...), trust it?
    // But datetime-local inputs usually just come as "YYYY-MM-DDTHH:mm"

    // Check if it already has timezone offset
    if (dateStr.includes('+') || dateStr.endsWith('Z')) {
        return new Date(dateStr)
    }

    // Append Vietnam Offset (+07:00)
    // We assume the input from the UI is intended to be Vietnam Time
    return new Date(`${dateStr}:00+07:00`)
}

const VIET_TZ = 'Asia/Ho_Chi_Minh'

type VietnamParts = {
    year: string
    month: string
    day: string
    hour: string
}

const getVietnamParts = (date: Date): VietnamParts => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: VIET_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date)

    const map: Record<string, string> = {}
    for (const part of parts) {
        if (part.type !== 'literal') map[part.type] = part.value
    }

    return {
        year: map.year || '1970',
        month: map.month || '01',
        day: map.day || '01',
        hour: map.hour || '00'
    }
}

export function getVietnamDateKey(date: Date = new Date()): string {
    const parts = getVietnamParts(date)
    return `${parts.year}-${parts.month}-${parts.day}`
}

export function getVietnamDayStart(dateKey: string): Date {
    return new Date(`${dateKey}T00:00:00+07:00`)
}

export function getVietnamCurrentHour(date: Date = new Date()): number {
    const parts = getVietnamParts(date)
    return Number(parts.hour)
}
