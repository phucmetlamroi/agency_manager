/**
 * [Canonical Clients] Uniform failure page for share links — shown for EVERY
 * rejection (invalid, revoked, expired, merged client, rate limit) so the
 * page itself never reveals why a token failed.
 */
export default function ShareNotFound() {
    return (
        <div style={{
            height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#0e0e11', color: '#e4e4e7', fontFamily: 'system-ui, sans-serif', padding: 24,
        }}>
            <div style={{ maxWidth: 420, textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>🔗</div>
                <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 10px' }}>
                    Link không còn hiệu lực
                </h1>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: '#a1a1aa', margin: 0 }}>
                    Link chia sẻ này không tồn tại, đã bị thu hồi hoặc đã hết hạn.
                    Vui lòng liên hệ agency của bạn để nhận link mới.
                </p>
                <p style={{ fontSize: 13, lineHeight: 1.6, color: '#71717a', marginTop: 14 }}>
                    This share link is invalid, revoked or expired.
                    Please contact your agency for a new link.
                </p>
            </div>
        </div>
    )
}
