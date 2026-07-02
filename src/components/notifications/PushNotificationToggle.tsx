'use client'

/**
 * [Trial P3] "Bật thông báo đẩy" toggle. Renders NOTHING unless:
 *   - the browser supports service workers + Push + Notifications, AND
 *   - the server returns a VAPID public key (getVapidPublicKey — i.e. keys set).
 * So with VAPID unset it's invisible; once the owner sets keys it appears.
 *
 * Registers the push-only /sw.js, subscribes via PushManager, and stores the
 * subscription server-side. Disabling unsubscribes + deletes the row.
 */

import { useEffect, useState } from 'react'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getVapidPublicKey, savePushSubscription, deletePushSubscription } from '@/actions/push-actions'

function urlBase64ToUint8Array(base64: string): Uint8Array {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4)
    const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = atob(b64)
    const arr = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
    return arr
}

export default function PushNotificationToggle() {
    const [pubKey, setPubKey] = useState<string | null>(null)
    const [supported, setSupported] = useState(false)
    const [subscribed, setSubscribed] = useState(false)
    const [busy, setBusy] = useState(false)
    const [ready, setReady] = useState(false)

    useEffect(() => {
        const supp = typeof window !== 'undefined'
            && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
        setSupported(supp)
        if (!supp) { setReady(true); return }
        let cancelled = false
        ;(async () => {
            const key = await getVapidPublicKey().catch(() => null)
            if (cancelled) return
            setPubKey(key)
            if (key) {
                try {
                    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
                    const existing = reg ? await reg.pushManager.getSubscription() : null
                    if (!cancelled) setSubscribed(Boolean(existing))
                } catch { /* ignore */ }
            }
            if (!cancelled) setReady(true)
        })()
        return () => { cancelled = true }
    }, [])

    const enable = async () => {
        if (!pubKey) return
        setBusy(true)
        try {
            const permission = await Notification.requestPermission()
            if (permission !== 'granted') {
                toast.error('Bạn đã từ chối quyền thông báo. Bật lại trong cài đặt trình duyệt.')
                return
            }
            const reg = await navigator.serviceWorker.register('/sw.js')
            await navigator.serviceWorker.ready
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                // Cast: lib.dom types the arg as BufferSource; our Uint8Array is valid.
                applicationServerKey: urlBase64ToUint8Array(pubKey) as unknown as BufferSource,
            })
            const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
            const res = await savePushSubscription({
                endpoint: json.endpoint || sub.endpoint,
                keys: { p256dh: json.keys?.p256dh || '', auth: json.keys?.auth || '' },
                userAgent: navigator.userAgent,
            })
            if (res.error && res.error !== 'off') { toast.error(res.error); return }
            setSubscribed(true)
            toast.success('Đã bật thông báo đẩy trên thiết bị này.')
        } catch (e: any) {
            console.error('[push] enable failed', e)
            toast.error('Không bật được thông báo đẩy.')
        } finally {
            setBusy(false)
        }
    }

    const disable = async () => {
        setBusy(true)
        try {
            const reg = await navigator.serviceWorker.getRegistration('/sw.js')
            const sub = reg ? await reg.pushManager.getSubscription() : null
            if (sub) {
                await deletePushSubscription(sub.endpoint).catch(() => {})
                await sub.unsubscribe().catch(() => {})
            }
            setSubscribed(false)
            toast.success('Đã tắt thông báo đẩy trên thiết bị này.')
        } catch (e) {
            console.error('[push] disable failed', e)
        } finally {
            setBusy(false)
        }
    }

    // Invisible when unsupported or feature is off (no VAPID key).
    if (!ready || !supported || !pubKey) return null

    return (
        <button
            type="button"
            onClick={subscribed ? disable : enable}
            disabled={busy}
            title={subscribed ? 'Tắt thông báo đẩy trên thiết bị này' : 'Bật thông báo đẩy trên thiết bị này'}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold text-zinc-400 hover:text-violet-300 hover:bg-white/5 transition-colors border-none bg-transparent cursor-pointer disabled:opacity-50"
        >
            {busy ? <Loader2 size={12} className="animate-spin" /> : subscribed ? <BellOff size={12} /> : <Bell size={12} />}
            {subscribed ? 'Tắt đẩy' : 'Bật đẩy'}
        </button>
    )
}
