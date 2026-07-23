// [Review 2026-07-14 · "load rất chậm"] Instant drawer-shaped skeleton while the deep-link
// route fetches — the click no longer stares at a frozen page.
export default function McTaskDrawerLoading() {
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#050505', fontFamily: '"Plus Jakarta Sans", -apple-system, "Segoe UI", system-ui, sans-serif' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 780, maxWidth: '100%', background: 'rgba(10,10,10,0.94)', borderLeft: '1px solid rgba(255,255,255,0.10)', display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
                <div style={{ height: 14, width: 140, borderRadius: 7, background: 'rgba(255,255,255,0.07)' }} />
                <div style={{ height: 26, width: '70%', borderRadius: 8, background: 'rgba(255,255,255,0.09)' }} />
                <div style={{ height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.04)' }} />
                <div style={{ display: 'flex', gap: 16 }}>
                    <div style={{ flex: 1.35, aspectRatio: '16/9', borderRadius: 14, background: 'rgba(255,255,255,0.05)' }} />
                    <div style={{ flex: 1, height: 200, borderRadius: 14, background: 'rgba(255,255,255,0.04)' }} />
                </div>
                <div style={{ fontSize: 12, color: '#71717A' }}>Đang tải chi tiết task…</div>
            </div>
        </div>
    )
}
