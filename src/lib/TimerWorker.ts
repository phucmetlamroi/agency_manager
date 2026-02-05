/* eslint-disable no-restricted-globals */
// Web Worker for Sidebar Timer
// Handles background interval ticking to prevent browser throttling

let timerId: NodeJS.Timeout | null = null
let expected: number | null = null
let interval = 1000

self.onmessage = (e: MessageEvent) => {
    const { action, payload } = e.data

    if (action === 'START') {
        if (timerId) clearInterval(timerId)
        expected = Date.now() + interval

        timerId = setInterval(() => {
            const now = Date.now()
            const drift = now - (expected as number)

            // Post tick to main thread
            self.postMessage({ type: 'TICK' })

            // Compensate for drift
            expected = (expected as number) + interval

            // If drifted too far, just reset expected (system sleep/hibernation)
            if (drift > interval) {
                expected = now + interval
            }
        }, interval)
    }
    else if (action === 'STOP') {
        if (timerId) clearInterval(timerId)
        timerId = null
    }
}
