import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | string | any) {
    if (amount === null || amount === undefined) return '$0.00'
    let value = amount
    if (typeof amount === 'object') {
        // Try to handle Prisma Decimal or other objects
        if (amount.toNumber) value = amount.toNumber()
        else if (amount.toString) value = parseFloat(amount.toString())
        else value = 0
    } else if (typeof amount === 'string') {
        value = parseFloat(amount)
    }

    if (isNaN(value)) return '$0.00'

    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    }).format(value)
}
