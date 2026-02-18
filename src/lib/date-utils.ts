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
