'use client'

// [Mobile P4.4 / Pattern 4 · FR-E3] ScrollTable — bảng cuộn NGANG dùng chung.
// Nền tảng cho các bảng số nhiều cột trên mobile (payroll M12; Finance PR sau tái dùng).
//
// Quy tắc Pattern-4 (KHÔNG được phá):
//  • CHỈ cuộn NGANG bên trong wrapper (overflow-x-auto) — TRANG cuộn dọc. TUYỆT ĐỐI
//    không max-h/overflow-y ở đây (nested vertical scroll bị cấm, f_0078 / FR-E3).
//  • Cột đầu ghim (sticky left-0) làm mỏ neo đọc; thead sticky dưới header app 56px.
//  • Bề rộng bảng > viewport (min-w-[640px]) để cột cuối bị cắt nửa ở mép phải =
//    tín hiệu "còn cuộn được" (FR-E3.4).
//
// Generic: mô tả cột (align + render riêng), rows, ghim cột đầu, tap-row tuỳ chọn.

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type ColumnAlign = 'left' | 'right' | 'center'

export type ScrollColumn<T> = {
    /** Khoá ổn định của cột (dùng cho React key của <th>/<td>). */
    key: string
    /** Nhãn cột — render trong <th> (in hoa qua class text-label). */
    header: string
    /** Canh lề. Cột số mặc định 'right'; cột chữ mặc định 'left'. */
    align?: ColumnAlign
    /** Cột SỐ → font-mono tabular-nums + canh phải (nếu không override align). */
    numeric?: boolean
    /**
     * Render ô. Trả về null/undefined/'' → hiển thị placeholder "—" (text-zinc-500).
     * Cột số muốn "—" khi 0/rỗng thì tự trả null trong render.
     */
    render: (row: T) => ReactNode
    /** Class thêm cho <th>. */
    headerClassName?: string
    /** Class thêm cho <td>. */
    cellClassName?: string
}

export type ScrollTableProps<T> = {
    columns: ScrollColumn<T>[]
    rows: T[]
    /** Key ổn định cho mỗi hàng. */
    rowKey: (row: T, index: number) => string
    /** Ghim cột ĐẦU (sticky left) — mỏ neo cuộn. Mặc định true. */
    pinnedFirst?: boolean
    /** Tap cả hàng (mở sheet chi tiết…). Có → hàng nhận con trỏ + phản hồi active. */
    onRowClick?: (row: T) => void
    /** Class min-width của bảng (tín hiệu Pattern-4: rộng hơn viewport). Mặc định min-w-[640px]. */
    minWidthClassName?: string
    className?: string
}

function alignClass(align: ColumnAlign): string {
    return align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
}

/** Vị trí ghim cột đầu — dùng chung cho <th> lẫn <td> để header/thân thẳng cột. */
const PINNED_CELL = 'sticky left-0 z-10 bg-surface-0 shadow-[4px_0_8px_rgba(0,0,0,0.4)]'

/** "—" cho ô rỗng/0. text-zinc-500 hợp lệ (placeholder, không phải text nội dung). */
function EmptyCell() {
    return <span className="text-zinc-500">—</span>
}

export function ScrollTable<T>({
    columns,
    rows,
    rowKey,
    pinnedFirst = true,
    onRowClick,
    minWidthClassName = 'min-w-[640px]',
    className,
}: ScrollTableProps<T>) {
    return (
        // Bleed sát mép (trong trang px-4) rồi tự đệm lại → cuộn ngang edge-to-edge.
        // overscroll-x-contain chặn scroll-chaining sang trang/nav.
        <div className={cn('overflow-x-auto overscroll-x-contain -mx-4 px-4', className)}>
            <table className={cn('w-full border-collapse', minWidthClassName)}>
                <thead className="sticky top-[calc(56px+env(safe-area-inset-top))] z-sticky bg-surface-0">
                    <tr>
                        {columns.map((col, ci) => {
                            const align = col.align ?? (col.numeric ? 'right' : 'left')
                            const pinned = pinnedFirst && ci === 0
                            return (
                                <th
                                    key={col.key}
                                    scope="col"
                                    className={cn(
                                        'px-3 py-2 text-label uppercase text-muted-foreground whitespace-nowrap',
                                        alignClass(align),
                                        pinned && PINNED_CELL,
                                        col.headerClassName,
                                    )}
                                >
                                    {col.header}
                                </th>
                            )
                        })}
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                    {rows.map((row, ri) => (
                        <tr
                            key={rowKey(row, ri)}
                            onClick={onRowClick ? () => onRowClick(row) : undefined}
                            className={cn(
                                'transition-colors',
                                onRowClick && 'cursor-pointer hover:bg-white/[0.02] active:bg-white/[0.04]',
                            )}
                        >
                            {columns.map((col, ci) => {
                                const align = col.align ?? (col.numeric ? 'right' : 'left')
                                const pinned = pinnedFirst && ci === 0
                                const content = col.render(row)
                                const isEmpty = content === null || content === undefined || content === ''
                                return (
                                    <td
                                        key={col.key}
                                        className={cn(
                                            'px-3 py-3 text-body-sm text-foreground',
                                            col.numeric && 'font-mono tabular-nums',
                                            alignClass(align),
                                            pinned && PINNED_CELL,
                                            col.cellClassName,
                                        )}
                                    >
                                        {isEmpty ? <EmptyCell /> : content}
                                    </td>
                                )
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

export default ScrollTable
