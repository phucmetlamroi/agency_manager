'use client'

// ── Audio unlock system ────────────────────────────────────────
// Browsers block audio.play() unless triggered by a user gesture.
// We unlock the AudioContext on the FIRST user interaction (click/keydown/touch),
// then all subsequent play() calls work from any context (WebSocket, setTimeout, etc.)

let audioContext: AudioContext | null = null
let audioBuffer: AudioBuffer | null = null
let unlocked = false
let unlockListenersAdded = false

function getAudioContext(): AudioContext {
    if (!audioContext) {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    return audioContext
}

// Load and decode the WAV file once
async function loadAudioBuffer(): Promise<AudioBuffer | null> {
    if (audioBuffer) return audioBuffer
    try {
        const response = await fetch('/sounds/chat-notification.wav')
        const arrayBuffer = await response.arrayBuffer()
        const ctx = getAudioContext()
        audioBuffer = await ctx.decodeAudioData(arrayBuffer)
        return audioBuffer
    } catch {
        return null
    }
}

// Unlock AudioContext on first user interaction
function unlockAudio() {
    if (unlocked) return
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') {
        ctx.resume().then(() => { unlocked = true }).catch(() => {})
    } else {
        unlocked = true
    }
    // Pre-load the audio buffer
    loadAudioBuffer()
}

// Attach unlock listeners ONCE — call this from ChatProvider on mount
export function initNotificationSound() {
    if (unlockListenersAdded || typeof window === 'undefined') return
    unlockListenersAdded = true

    const events = ['click', 'keydown', 'touchstart', 'mousedown']
    const handler = () => {
        unlockAudio()
        // Remove all listeners after first interaction
        events.forEach(e => document.removeEventListener(e, handler, true))
    }
    events.forEach(e => document.addEventListener(e, handler, true))

    // Also try to pre-load immediately (won't play until unlocked)
    loadAudioBuffer()
}

// ── Play notification sound ────────────────────────────────────
export function playNotificationSound() {
    const muted = localStorage.getItem('chat-muted') === 'true'
    if (muted) return

    const ctx = getAudioContext()

    // If context is suspended, try to resume (might work if called near a user gesture)
    if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
    }

    if (!audioBuffer) {
        // Buffer not loaded yet — load and play
        loadAudioBuffer().then(buf => {
            if (buf) playBuffer(ctx, buf)
        })
        return
    }

    playBuffer(ctx, audioBuffer)
}

function playBuffer(ctx: AudioContext, buffer: AudioBuffer) {
    try {
        const source = ctx.createBufferSource()
        source.buffer = buffer
        const gainNode = ctx.createGain()
        gainNode.gain.value = 0.5
        source.connect(gainNode)
        gainNode.connect(ctx.destination)
        source.start(0)
    } catch {
        // Fallback to HTML Audio API
        try {
            const audio = new Audio('/sounds/chat-notification.wav')
            audio.volume = 0.5
            audio.play().catch(() => {})
        } catch {
            // Give up silently
        }
    }
}

// ── Tab title flash (Google Chat style) ────────────────────────
let originalTitle = ''
let flashInterval: ReturnType<typeof setInterval> | null = null

export function flashTabTitle(senderName: string) {
    if (document.hasFocus()) return

    if (!originalTitle) originalTitle = document.title
    let isFlashing = false

    if (flashInterval) clearInterval(flashInterval)

    flashInterval = setInterval(() => {
        document.title = isFlashing ? originalTitle : `${senderName} sent a message`
        isFlashing = !isFlashing
    }, 1500)

    const onFocus = () => {
        if (flashInterval) clearInterval(flashInterval)
        flashInterval = null
        document.title = originalTitle
        originalTitle = ''
        window.removeEventListener('focus', onFocus)
    }
    window.addEventListener('focus', onFocus)
}

// ── Mute controls ──────────────────────────────────────────────
export function isChatMuted(): boolean {
    return localStorage.getItem('chat-muted') === 'true'
}

export function setChatMuted(muted: boolean) {
    localStorage.setItem('chat-muted', String(muted))
}
