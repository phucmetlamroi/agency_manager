'use client'

import { useState, useEffect, useRef } from 'react'

interface StopwatchProps {
    accumulatedSeconds: number
    timerStartedAt: Date | string | null
    status: string
}

export default function Stopwatch({ accumulatedSeconds, timerStartedAt, status }: StopwatchProps) {
    const [displayTime, setDisplayTime] = useState(accumulatedSeconds)
    const workerRef = useRef<Worker | null>(null)

    // Calculate time based on system clock (drif-proof)
    const calculateTime = () => {
        let additional = 0
        if (status === 'RUNNING' && timerStartedAt) {
            const startStr = typeof timerStartedAt === 'string' ? timerStartedAt : timerStartedAt.toISOString()
            const start = new Date(startStr).getTime()
            const now = new Date().getTime()
            additional = Math.floor((now - start) / 1000)
        }
        return accumulatedSeconds + (additional > 0 ? additional : 0)
    }

    useEffect(() => {
        // Initialize Worker
        // We use a Blob to create worker inline or load from file. 
        // Next.js static file handling can be tricky for workers, so loading from public is common, 
        // or using strict file path. 
        // Since we wrote src/lib/TimerWorker.ts, we need to compile it or load it.
        // Direct TS import of worker is non-standard in Next.js without config.
        // FALLBACK: Use inline blob for simplicity/reliability in this environment if file loader fails.
        // BUT we wrote the file. Let's try to assume a simple build setup. 
        // Actually, just using the logic in main thread with Date.now() is robust.
        // PROCEEDING WITH WORKER as requested.

        // Dynamic import logic or simple polling?
        // Let's use the Date.now() logic DRIVEN by the worker tick.

        workerRef.current = new Worker(new URL('../lib/TimerWorker.ts', import.meta.url))

        workerRef.current.onmessage = (e) => {
            if (e.data.type === 'TICK') {
                setDisplayTime(calculateTime())
            }
        }

        return () => {
            workerRef.current?.terminate()
        }
    }, [])

    // Handle Status Changes
    useEffect(() => {
        setDisplayTime(calculateTime()) // Immediate update

        if (status === 'RUNNING') {
            workerRef.current?.postMessage({ action: 'START' })
        } else {
            workerRef.current?.postMessage({ action: 'STOP' })
        }
    }, [status, timerStartedAt, accumulatedSeconds])

    const formatTime = (totalSeconds: number) => {
        const hours = Math.floor(totalSeconds / 3600)
        const minutes = Math.floor((totalSeconds % 3600) / 60)
        const seconds = totalSeconds % 60

        // Format: HH:MM:SS
        const pad = (n: number) => n < 10 ? '0' + n : n

        if (hours >= 24) {
            const days = Math.floor(hours / 24)
            const remHours = hours % 24
            return `${days}d ${pad(remHours)}h ${pad(minutes)}m`
        }

        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    }

    return (
        <div style={{
            fontFamily: 'monospace',
            fontWeight: 'bold',
            fontSize: '0.9rem',
            color: status === 'RUNNING' ? '#10b981' : '#6b7280',
            display: 'flex', alignItems: 'center', gap: '5px'
        }}>
            {status === 'RUNNING' && (
                <span className="animate-pulse" style={{ fontSize: '0.6rem', transform: 'scale(1.2)' }}>🔴</span>
            )}
            {status === 'PAUSED' && '⏸'}
            {status === 'STOPPED' && '🏁'}

            {formatTime(displayTime)}

            {status === 'RUNNING' && <span className="hidden sm:inline" style={{ fontSize: '0.7rem', opacity: 0.8, fontWeight: 'normal' }}>Active</span>}
        </div>
    )
}
