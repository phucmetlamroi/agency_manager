'use client'

import { toggleTreasurer } from '@/actions/toggle-treasurer'

export default function TreasurerToggle({ userId, isTreasurer }: { userId: string, isTreasurer: boolean }) {

    return (
        <button
            onClick={async () => await toggleTreasurer(userId, isTreasurer)}
            title={isTreasurer ? "Thu hồi quyền Thủ Quỹ" : "Cấp quyền Thủ Quỹ"}
            style={{
                background: isTreasurer ? 'rgba(234, 179, 8, 0.2)' : 'transparent',
                border: isTreasurer ? '1px solid #eab308' : '1px solid #444',
                color: isTreasurer ? '#eab308' : '#666',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                marginLeft: '0.5rem',
                transition: 'all 0.2s'
            }}
        >
            {isTreasurer ? 'Gỡ Quyền' : 'Cấp Quyền 💰'}
        </button>
    )
}
