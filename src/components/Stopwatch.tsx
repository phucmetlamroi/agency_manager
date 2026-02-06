'use client'

import { useState, useEffect, useRef } from 'react'

interface StopwatchProps {
    accumulatedSeconds: number
    timerStartedAt: Date | string | null
    status: string
}

export default function Stopwatch({ accumulatedSeconds, timerStartedAt, status }: StopwatchProps) {
    const [displayTime, setDisplayTime] = useState(accumulatedSeconds)
    const [clockOffset, setClockOffset] = useState(0)
    const workerRef = useRef<Worker | null>(null)

    // 1. Calculate Clock Offset (Sync with Server)
    useEffect(() => {
        const syncTime = async () => {
            try {
                const response = await fetch('/api/time')
                const data = await response.json()
                const serverTime = data.time
                const clientTime = Date.now()
                // Offset = Server - Client
                // If Server is ahead (future), offset is positive.
                // If Server is behind (past), offset is negative.
                setClockOffset(serverTime - clientTime)
            } catch (err) {
                console.error("Failed to sync time:", err)
            }
        }
        syncTime()

        // 2. Visibility Handler (Force update on tab focus)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                setDisplayTime(calculateTime())
            }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [])

    // Calculate time based on system clock + offset
    const calculateTime = () => {
        let additional = 0
        if (status === 'RUNNING' && timerStartedAt) {
            const startStr = typeof timerStartedAt === 'string' ? timerStartedAt : timerStartedAt.toISOString()
            const start = new Date(startStr).getTime()

            // Corrected Now = ClientNow + Offset
            const now = Date.now() + clockOffset

            // Avoid negative values if offset isn't ready or drifts slightly
            if (now > start) {
                additional = Math.floor((now - start) / 1000)
            }
        }
        return accumulatedSeconds + (additional > 0 ? additional : 0)
    }

    useEffect(() => {
        // Initialize Worker
        workerRef.current = new Worker(new URL('../lib/TimerWorker.ts', import.meta.url))

        workerRef.current.onmessage = (e) => {
            if (e.data.type === 'TICK') {
                setDisplayTime(calculateTime())
            }
        }

        return () => {
            workerRef.current?.terminate()
        }
    }, [clockOffset]) // Re-init if offset changes? No, just the calc function uses it.
    // Actually, calculateTime is a closure if not defined via useCallback, so it captures old offset?
    // 'calculateTime' uses 'clockOffset' state. 
    // To ensure Worker TICK uses latest offset, we rely on React state updates flushing.
    // However, if calculateTime is called inside onmessage, it uses the closure scope.
    // We should make calculateTime a ref or just rely on setDisplayTime triggering re-render?
    // Wait, onmessage calls calculateTime(). If calculateTime is stale, it uses old offset.
    // Better Strategy: Use a Ref for Offset.

    // FIX: Use Ref for Offset to ensure availability in closure
    const offsetRef = useRef(0)
    useEffect(() => {
        offsetRef.current = clockOffset
    }, [clockOffset])

    const calculateTimeRef = () => {
        let additional = 0
        if (status === 'RUNNING' && timerStartedAt) {
            const startStr = typeof timerStartedAt === 'string' ? timerStartedAt : timerStartedAt.toISOString()
            const start = new Date(startStr).getTime()
            const now = Date.now() + offsetRef.current
            if (now > start) {
                additional = Math.floor((now - start) / 1000)
            }
        }
        return accumulatedSeconds + (additional > 0 ? additional : 0)
    }

    // Update worker listener to use the Ref-based calculator
    useEffect(() => {
        if (!workerRef.current) return;
        workerRef.current.onmessage = (e) => {
            if (e.data.type === 'TICK') {
                setDisplayTime(calculateTimeRef())
            }
        }
    }, [status, timerStartedAt, accumulatedSeconds]) // Re-bind if props change? 
    // Actually, simpler to just let the effect below handle start/stop

    // Handle Status Changes & Init
    useEffect(() => {
        setDisplayTime(calculateTimeRef()) // Immediate update

        if (status === 'RUNNING') {
            workerRef.current?.postMessage({ action: 'START' })
        } else {
            workerRef.current?.postMessage({ action: 'STOP' })
        }
    }, [status, timerStartedAt, accumulatedSeconds, clockOffset])

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
