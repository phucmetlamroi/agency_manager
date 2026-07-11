// src/components/dashboard/TodaySection.tsx
// [P3 / M2.2 · FR-C1/C2] Editor "Hôm nay" block — ≤5 priority tasks (quá hạn → cần sửa
// → đến hạn hôm nay). 2-line row anatomy: colored bar ▌ + title (line-clamp-2) + meta.
// Rows link to the full-screen task route. Server-renderable. Empty case handled by parent.

import Link from 'next/link'
import type { TodayItem } from '@/lib/agenda'

export default function TodaySection({
    items,
    workspaceId,
    seeAllHref,
}: {
    items: TodayItem[]
    workspaceId: string
    seeAllHref: string
}) {
    return (
        <section>
            <div className="mb-2 flex items-center justify-between">
                <h2 className="text-title font-semibold text-foreground">Hôm nay</h2>
                <Link href={seeAllHref} className="text-body-sm text-primary-accent">
                    Xem tất cả →
                </Link>
            </div>
            <div className="flex flex-col gap-2">
                {items.map((it) => (
                    <Link
                        key={it.id}
                        href={`/${workspaceId}/task/${it.id}`}
                        className="flex items-stretch gap-3 rounded-xl glass-1 p-3 active:scale-[0.99] transition-transform"
                    >
                        <span
                            className="w-1 shrink-0 rounded-full"
                            style={{ backgroundColor: it.statusColor }}
                            aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-body-sm font-medium text-foreground">{it.title}</p>
                            <p className="mt-0.5 text-caption text-muted-foreground">{it.meta}</p>
                        </div>
                    </Link>
                ))}
            </div>
        </section>
    )
}
