import { Decimal } from '@prisma/client/runtime/library'

/**
 * Traverses an object/array and converts any Prisma Decimal instances to numbers.
 * This is necessary because Next.js cannot serialize Decimal objects to Client Components.
 */
export function serializeDecimal(obj: any): any {
    if (obj === null || obj === undefined) {
        return obj
    }

    if (typeof obj === 'object') {
        // Handle Prisma Decimal
        if (obj instanceof Decimal || (obj.d && obj.e && obj.s)) {
            return obj.toNumber()
        }

        // Handle Date (Preserve it for Next.js serialization or convert to string if needed)
        // Next.js App Router handles Date objects in props well usually, but to be safe/consistent:
        if (obj instanceof Date) {
            return obj
        }

        // Handle Array
        if (Array.isArray(obj)) {
            return obj.map(item => serializeDecimal(item))
        }

        // Handle Object
        const newObj: any = {}
        for (const key in obj) {
            newObj[key] = serializeDecimal(obj[key])
        }
        return newObj
    }

    return obj
}
