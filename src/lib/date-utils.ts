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

const VIET_WEEKDAY_MAP: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7
}

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

export function addVietnamDays(dateKey: string, delta: number): string {
    const date = new Date(`${dateKey}T00:00:00+07:00`)
    date.setUTCDate(date.getUTCDate() + delta)
    return getVietnamDateKey(date)
}

export function getVietnamWeekdayIndex(date: Date = new Date()): number {
    const weekday = new Intl.DateTimeFormat('en-US', {
        timeZone: VIET_TZ,
        weekday: 'short'
    }).format(date)
    return VIET_WEEKDAY_MAP[weekday] || 1
}

export function getVietnamWeekStartKey(date: Date = new Date()): string {
    const dateKey = getVietnamDateKey(date)
    const weekday = getVietnamWeekdayIndex(date)
    return addVietnamDays(dateKey, -(weekday - 1))
}

export function getVietnamWeekKeys(dateKey: string): string[] {
    const baseDate = new Date(`${dateKey}T00:00:00+07:00`)
    const startKey = getVietnamWeekStartKey(baseDate)
    return Array.from({ length: 7 }, (_, i) => addVietnamDays(startKey, i))
}
