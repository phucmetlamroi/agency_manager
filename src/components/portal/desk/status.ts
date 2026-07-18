/* The Desk — status is typographic. Maps the admin-mirrored clientStatus (and
   the invoice ledger status) to one earth-register tone + a plain-English
   sentence. Tones resolve to CSS vars declared in portal-desk.css. */

export type DeskTone = 'review' | 'progress' | 'revision' | 'received' | 'done' | 'danger' | 'neutral'

export interface DeskStatus {
    label: string
    tone: DeskTone
    /** true when the ball is in the client's court (drives tray + accent). */
    needsYou: boolean
}

const DELIVERABLE: Record<string, DeskStatus> = {
    'Awaiting your review': { label: 'Awaiting you', tone: 'review', needsYou: true },
    'Ready for your review': { label: 'Ready for you', tone: 'review', needsYou: true },
    'Revising': { label: 'Revising', tone: 'revision', needsYou: false },
    'In review': { label: 'In review', tone: 'received', needsYou: false },
    'Received': { label: 'Received', tone: 'received', needsYou: false },
    'In production': { label: 'In production', tone: 'progress', needsYou: false },
    'In progress': { label: 'In progress', tone: 'progress', needsYou: false },
    'In revision': { label: 'In revision', tone: 'revision', needsYou: false },
    'Revisions delivered': { label: 'Revisions in', tone: 'done', needsYou: false },
    'On hold': { label: 'On hold', tone: 'neutral', needsYou: false },
    'Completed': { label: 'Delivered', tone: 'done', needsYou: false },
    'Closed': { label: 'Closed', tone: 'neutral', needsYou: false },
}

const INVOICE: Record<string, DeskStatus> = {
    'Paid': { label: 'Paid', tone: 'done', needsYou: false },
    'Due': { label: 'Due', tone: 'received', needsYou: true },
    'Overdue': { label: 'Overdue', tone: 'danger', needsYou: true },
    'Void': { label: 'Void', tone: 'neutral', needsYou: false },
}

export function deskStatus(status: string): DeskStatus {
    return DELIVERABLE[status] || INVOICE[status] || { label: status || 'Received', tone: 'received', needsYou: false }
}

/** The colour variable for a tone (text + dot). */
export function toneColor(tone: DeskTone): string {
    switch (tone) {
        case 'review': return 'var(--accent)'
        case 'progress': return 'var(--ochre)'
        case 'revision': return 'var(--umber)'
        case 'done': return 'var(--sage)'
        case 'danger': return 'var(--brick)'
        case 'received': return 'var(--stone)'
        default: return 'var(--ink-3)'
    }
}

/** A plain-English one-liner explaining the current state to a client. */
export function statusSentence(clientStatus: string): string {
    switch (clientStatus) {
        case 'Awaiting your review':
        case 'Ready for your review': return 'A cut is ready — watch and decide in the screening desk.'
        case 'Revising':
        case 'In revision': return 'We’re working through your requested changes.'
        case 'In review': return 'Your reviewed cut is back with our team.'
        case 'Received': return 'We’ve received this and it’s queued to start.'
        case 'In production': return 'We’re lining this up to start editing.'
        case 'In progress': return 'Our team is editing this right now.'
        case 'Revisions delivered': return 'Your changes are in — a fresh cut is on the way.'
        case 'On hold': return 'This is paused for now.'
        case 'Completed': return 'Approved and delivered.'
        case 'Closed': return 'This project was closed.'
        default: return ''
    }
}
