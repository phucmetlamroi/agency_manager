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

// [Hotfix 2026-06-13] plain browser `dompurify` (zero deps) replaces
// isomorphic-dompurify. utils.ts is imported by virtually EVERY route (cn()
// lives here), so the old import dragged jsdom into every server bundle —
// jsdom's html-encoding-sniffer require()s an ESM-only package and Vercel's
// Node runtime lacks require(esm) → ERR_REQUIRE_ESM 500s in production.
import DOMPurify from 'dompurify';

/**
 * Ensures all <a> tags in an HTML string have target="_blank" and rel="noopener noreferrer"
 * and sanitizes the HTML to prevent XSS.
 *
 * CLIENT-ONLY: browser dompurify has no DOM during SSR. The single caller
 * (TaskDrawer, 'use client', renders on user interaction post-hydration)
 * never runs this on the server; the guard below fails CLOSED (empty
 * string, never unsanitized HTML) if a future server caller appears.
 */
export function ensureExternalLinks(html: string | null | undefined): string {
    if (!html) return '';
    if (typeof window === 'undefined') return '';

    // First, sanitize the HTML
    const sanitized = DOMPurify.sanitize(html);

    // Step 1: Add target="_blank" if missing
    let processed = sanitized.replace(/<a\s+(?![^>]*\btarget\s*=)([^>]+)>/gi, '<a $1 target="_blank">');

    // Step 2: Add rel="noopener noreferrer" if missing
    processed = processed.replace(/<a\s+(?![^>]*\brel\s*=)([^>]+)>/gi, '<a $1 rel="noopener noreferrer">');

    return processed;
}


export function removeAccents(str: string | null | undefined): string {
    if (!str) return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}
