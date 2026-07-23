"use client"

// [Giao diện 2 · Mission Control] The rail "← Giao diện 1" control.
// It MUST clear the `ui-pref=mc` opt-in before returning to /admin — otherwise the
// auto-land redirect in admin/page.tsx would bounce the admin straight back to /mc
// (redirect-loop trap). We set the cookie to 'admin' (the default experience) then
// hard-navigate so the fresh cookie is read on the next request.
import { useState } from "react"
import { ArrowLeftRight } from "lucide-react"
import { setUiPref } from "@/actions/ui-actions"
import { Pressable } from "./motion-kit"

export default function McBackLink({ backHref }: { backHref: string }) {
    const [pending, setPending] = useState(false)
    return (
        <Pressable
            type="button"
            title="Về Giao diện 1"
            disabled={pending}
            onClick={async () => {
                setPending(true)
                try { await setUiPref("admin") } catch { /* best-effort — navigate regardless */ }
                window.location.href = backHref
            }}
            style={{
                width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center",
                justifyContent: "center", color: "#A5B4FC", background: "rgba(99,102,241,0.10)",
                border: "1px solid rgba(99,102,241,0.25)", cursor: pending ? "wait" : "pointer",
                opacity: pending ? 0.6 : 1,
            }}
        >
            <ArrowLeftRight style={{ width: 17, height: 17 }} />
        </Pressable>
    )
}
