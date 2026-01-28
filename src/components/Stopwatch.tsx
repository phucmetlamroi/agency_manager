'use client'

import { useState, useEffect } from 'react'

interface StopwatchProps {
    accumulatedSeconds: number
    timerStartedAt: Date | string | null
    status: string
}

export default function Stopwatch({ accumulatedSeconds, timerStartedAt, status }: StopwatchProps) {
    const [displayTime, setDisplayTime] = useState(accumulatedSeconds)

    useEffect(() => {
        // Initial setup
        updateDisplay()

        // Interval if running
        let interval: NodeJS.Timeout
        if (status === 'RUNNING' && timerStartedAt) {
            interval = setInterval(updateDisplay, 1000)
        }

        return () => clearInterval(interval)
    }, [accumulatedSeconds, timerStartedAt, status])

    const updateDisplay = () => {
        let additional = 0
        if (status === 'RUNNING' && timerStartedAt) {
            const startStr = typeof timerStartedAt === 'string' ? timerStartedAt : timerStartedAt.toISOString()
            const start = new Date(startStr).getTime()
            const now = new Date().getTime()
            additional = Math.floor((now - start) / 1000)
        }
        setDisplayTime(accumulatedSeconds + (additional > 0 ? additional : 0))
    }

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

            {status === 'RUNNING' && <span style={{ fontSize: '0.7rem', opacity: 0.8, fontWeight: 'normal' }}>Active</span>}
        </div>
    )
}
