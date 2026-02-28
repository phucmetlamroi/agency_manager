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

/**
 * Parses a YYYY-MM string and returns the Date boundaries for that month.
 * Automatically defaults to the current month if no string is provided.
 * Uses UTC+7 (Vietnam Time) to establish boundaries.
 */
export function getMonthDateRange(monthString?: string): { startDate: Date; endDate: Date } {
    const now = new Date()
    // By default, use current VN time values
    let targetYear = now.getFullYear()
    let targetMonth = now.getMonth() + 1 // 1-12

    if (monthString && /^\d{4}-\d{2}$/.test(monthString)) {
        const parts = monthString.split('-')
        targetYear = parseInt(parts[0], 10)
        targetMonth = parseInt(parts[1], 10)
    }

    // Start boundary: 1st day of the month, 00:00:00.000 UTC+7
    const startDateString = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01T00:00:00.000+07:00`
    const startDate = new Date(startDateString)

    // End boundary: Last day of the month, 23:59:59.999 UTC+7
    // To get the last day, we go to the 1st of the NEXT month, and subtract 1 millisecond
    let nextMonth = targetMonth + 1
    let nextMonthYear = targetYear
    if (nextMonth > 12) {
        nextMonth = 1
        nextMonthYear++
    }

    const nextMonthBoundaryString = `${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00.000+07:00`
    const endDate = new Date(new Date(nextMonthBoundaryString).getTime() - 1)

    return { startDate, endDate }
}
