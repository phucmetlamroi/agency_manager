import { Decimal } from '@prisma/client/runtime/library'

/**
 * Traverses an object/array and converts any Prisma Decimal instances to numbers.
 * This is necessary because Next.js cannot serialize Decimal objects to Client Components.
 */
export function serializeDecimal(obj: any): any {
    if (obj === null || obj === undefined) {
        return obj
    }

    // Handle Arrays
    if (Array.isArray(obj)) {
        return obj.map(item => serializeDecimal(item))
    }

    if (typeof obj === 'object') {
        // Handle Date (Next.js supports passing Date objects directly)
        if (obj instanceof Date) {
            return obj
        }

        // Handle Prisma Decimal or similar "Number-like" objects
        // Some Prisma versions use a structure with d, e, s properties
        const isDecimal =
            obj instanceof Decimal ||
            (obj.constructor && obj.constructor.name === 'Decimal') ||
            (typeof obj.toNumber === 'function' && obj.d && Array.isArray(obj.d) && typeof obj.s === 'number');

        if (isDecimal) {
            return obj.toNumber()
        }

        // Handle plain objects: recursive cleaning
        const newObj: any = {}
        for (const key in obj) {
            // Skip internal Prisma properties or functions
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                newObj[key] = serializeDecimal(obj[key])
            }
        }
        return newObj
    }

    return obj
}
