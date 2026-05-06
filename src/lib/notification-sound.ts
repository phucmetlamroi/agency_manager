'use client'

let audioInstance: HTMLAudioElement | null = null
let originalTitle = ''
let flashInterval: ReturnType<typeof setInterval> | null = null

function getAudio(): HTMLAudioElement {
    if (!audioInstance) {
        audioInstance = new Audio('/sounds/chat-notification.wav')
        audioInstance.volume = 0.5
    }
    return audioInstance
}

export function playNotificationSound() {
    const muted = localStorage.getItem('chat-muted') === 'true'
    if (muted) return

    const audio = getAudio()
    audio.currentTime = 0
    audio.play().catch(() => {})
}

export function flashTabTitle(senderName: string) {
    if (document.hasFocus()) return

    if (!originalTitle) originalTitle = document.title
    let isFlashing = false

    if (flashInterval) clearInterval(flashInterval)

    flashInterval = setInterval(() => {
        document.title = isFlashing ? originalTitle : `💬 ${senderName}`
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

export function isChatMuted(): boolean {
    return localStorage.getItem('chat-muted') === 'true'
}

export function setChatMuted(muted: boolean) {
    localStorage.setItem('chat-muted', String(muted))
}
