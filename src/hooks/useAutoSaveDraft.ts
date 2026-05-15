"use client"

import { useEffect, useRef, useState } from "react"

/**
 * useAutoSaveDraft — Google Docs–style continuous auto-save tới localStorage.
 *
 * Behavior:
 *   - Đọc draft từ localStorage khi mount (nếu chưa expire)
 *   - Save state vào localStorage debounce 500ms mỗi khi state đổi
 *   - Sliding TTL: reset expiry mỗi lần save → while typing draft sống, idle X
 *     phút → expire
 *   - Helper `clearDraft()` để clear manually (vd: khi submit success)
 *
 * Generic over T — bất kỳ form state nào serialize-able qua JSON.
 *
 * @param key Storage key (vd: `addTask:draft:workspaceId`)
 * @param state Current form state (sẽ được save)
 * @param ttlMs Time-to-live (default 3 phút = 180000ms)
 * @param enabled Toggle off save (vd: khi modal closed)
 *
 * @returns { restored, clearDraft, savedAt }
 *   - restored: draft đã load được khi mount hay chưa (true sau khi restore)
 *   - clearDraft: function để xóa draft khỏi storage
 *   - savedAt: timestamp lần save gần nhất (UI có thể show "Saved Xs ago")
 */
export function useAutoSaveDraft<T>(
    key: string,
    state: T,
    onRestore: (draft: T) => void,
    options: {
        ttlMs?: number
        debounceMs?: number
        enabled?: boolean
        /** Trả về true nếu state đáng save (vd: bỏ qua khi empty). Default: always save */
        shouldSave?: (state: T) => boolean
    } = {},
): { restored: boolean; clearDraft: () => void; savedAt: number | null } {
    const {
        ttlMs = 3 * 60 * 1000, // 3 phút mặc định
        debounceMs = 500,
        enabled = true,
        shouldSave = () => true,
    } = options

    const [restored, setRestored] = useState(false)
    const [savedAt, setSavedAt] = useState<number | null>(null)
    const restoredRef = useRef(false)
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // ── Reset restore flag khi disabled (modal đóng) → cho phép re-restore lần sau ──
    useEffect(() => {
        if (!enabled) {
            restoredRef.current = false
            setRestored(false)
            setSavedAt(null)
        }
    }, [enabled])

    // ── Restore draft khi mount/enabled ──────────────────────────────
    useEffect(() => {
        if (!enabled || restoredRef.current) return
        if (typeof window === "undefined") return

        try {
            const raw = localStorage.getItem(key)
            if (!raw) {
                restoredRef.current = true
                return
            }

            const parsed = JSON.parse(raw) as { state: T; expiresAt: number }

            // Check expiry
            if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
                localStorage.removeItem(key)
                restoredRef.current = true
                return
            }

            // Restore
            onRestore(parsed.state)
            setRestored(true)
            setSavedAt(parsed.expiresAt - ttlMs)
        } catch (err) {
            console.warn(`[useAutoSaveDraft] failed to restore key=${key}:`, err)
            try {
                localStorage.removeItem(key)
            } catch {}
        } finally {
            restoredRef.current = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, enabled])

    // ── Save draft debounced khi state đổi ───────────────────────────
    useEffect(() => {
        if (!enabled || !restoredRef.current) return
        if (typeof window === "undefined") return
        if (!shouldSave(state)) return

        if (debounceTimer.current) clearTimeout(debounceTimer.current)

        debounceTimer.current = setTimeout(() => {
            try {
                const now = Date.now()
                const payload = JSON.stringify({
                    state,
                    expiresAt: now + ttlMs,
                })
                localStorage.setItem(key, payload)
                setSavedAt(now)
            } catch (err) {
                console.warn(`[useAutoSaveDraft] failed to save key=${key}:`, err)
            }
        }, debounceMs)

        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current)
        }
    }, [state, key, enabled, ttlMs, debounceMs, shouldSave])

    // ── Manual clear ─────────────────────────────────────────────────
    const clearDraft = () => {
        try {
            localStorage.removeItem(key)
        } catch {}
        setSavedAt(null)
    }

    return { restored, clearDraft, savedAt }
}
