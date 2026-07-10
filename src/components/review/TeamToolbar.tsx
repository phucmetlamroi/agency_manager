'use client'

// [Review module P2.3] Appearance (FR-B09) + Sort (FR-B10) toolbar popovers.
// Both write through onChange into the per-user ViewPrefs the parent persists to
// localStorage 'team.appearance'. Card Size + Aspect Ratio are grid-only (disabled
// in List). Sort default is Date Uploaded desc; folders always group before assets
// (enforced server-side by the children endpoint).

import type { ReactNode } from 'react'
import { LayoutGrid, List as ListIcon, SlidersHorizontal, ArrowUpDown, ArrowUp, ArrowDown, Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { ViewPrefs, Layout, CardSize, Aspect, ThumbScale, SortField, SortDir } from '@/lib/review/view-prefs'
import { SORT_FIELDS, sortFieldLabel } from '@/lib/review/view-prefs'

const POPOVER_CLS =
    'w-64 border-white/10 bg-zinc-950/95 p-3 text-zinc-200 shadow-2xl shadow-black/60 backdrop-blur-xl'

function Segmented<T extends string>({
    options,
    value,
    onChange,
    disabled,
}: {
    options: { value: T; label: ReactNode; title?: string }[]
    value: T
    onChange: (v: T) => void
    disabled?: boolean
}) {
    return (
        <div className={`flex gap-1 rounded-lg bg-white/[0.04] p-0.5 ${disabled ? 'pointer-events-none opacity-40' : ''}`}>
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    title={o.title}
                    onClick={() => onChange(o.value)}
                    className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors ${
                        value === o.value ? 'bg-violet-500/25 text-violet-100' : 'text-zinc-400 hover:bg-white/[0.06]'
                    }`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="mb-3 last:mb-0">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
            {children}
        </div>
    )
}

export function AppearanceMenu({
    prefs,
    onChange,
}: {
    prefs: ViewPrefs
    onChange: (patch: Partial<ViewPrefs>) => void
}) {
    const gridOnly = prefs.layout !== 'grid'
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-1.5 text-[12.5px] font-medium text-zinc-300 transition-colors hover:bg-white/[0.07] hover:text-zinc-100"
                >
                    <SlidersHorizontal size={14} /> Giao diện
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className={POPOVER_CLS}>
                <Field label="Bố cục">
                    <Segmented<Layout>
                        value={prefs.layout}
                        onChange={(v) => onChange({ layout: v })}
                        options={[
                            { value: 'grid', label: (<><LayoutGrid size={13} /> Lưới</>), title: 'Lưới' },
                            { value: 'list', label: (<><ListIcon size={13} /> Danh sách</>), title: 'Danh sách' },
                        ]}
                    />
                </Field>
                <Field label="Cỡ thẻ">
                    <Segmented<CardSize>
                        value={prefs.cardSize}
                        disabled={gridOnly}
                        onChange={(v) => onChange({ cardSize: v })}
                        options={[
                            { value: 'S', label: 'S' },
                            { value: 'M', label: 'M' },
                            { value: 'L', label: 'L' },
                        ]}
                    />
                </Field>
                <Field label="Tỉ lệ khung">
                    <Segmented<Aspect>
                        value={prefs.aspect}
                        disabled={gridOnly}
                        onChange={(v) => onChange({ aspect: v })}
                        options={[
                            { value: '16:9', label: '16:9' },
                            { value: '1:1', label: '1:1' },
                            { value: '9:16', label: '9:16' },
                        ]}
                    />
                </Field>
                <Field label="Thumbnail">
                    <Segmented<ThumbScale>
                        value={prefs.thumb}
                        disabled={gridOnly}
                        onChange={(v) => onChange({ thumb: v })}
                        options={[
                            { value: 'fit', label: 'Vừa khung' },
                            { value: 'fill', label: 'Phủ khung' },
                        ]}
                    />
                </Field>
                <button
                    type="button"
                    onClick={() => onChange({ showInfo: !prefs.showInfo })}
                    className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-[12.5px] text-zinc-300 hover:bg-white/[0.04]"
                >
                    Hiện thông tin thẻ
                    <span
                        className={`relative h-5 w-9 rounded-full transition-colors ${prefs.showInfo ? 'bg-violet-500' : 'bg-white/15'}`}
                    >
                        <span
                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${prefs.showInfo ? 'left-4' : 'left-0.5'}`}
                        />
                    </span>
                </button>
            </PopoverContent>
        </Popover>
    )
}

export function SortMenu({
    sortField,
    sortDir,
    onChange,
}: {
    sortField: SortField
    sortDir: SortDir
    onChange: (patch: { sortField?: SortField; sortDir?: SortDir }) => void
}) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-1.5 text-[12.5px] font-medium text-zinc-300 transition-colors hover:bg-white/[0.07] hover:text-zinc-100"
                >
                    <ArrowUpDown size={14} /> Sắp xếp: {sortFieldLabel(sortField)}
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className={POPOVER_CLS}>
                <div className="mb-2 flex flex-col">
                    {SORT_FIELDS.map((f) => (
                        <button
                            key={f.field}
                            type="button"
                            onClick={() => onChange({ sortField: f.field })}
                            className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-[12.5px] transition-colors ${
                                sortField === f.field ? 'text-violet-200' : 'text-zinc-300 hover:bg-white/[0.05]'
                            }`}
                        >
                            {f.label}
                            {sortField === f.field && <Check size={14} className="text-violet-300" />}
                        </button>
                    ))}
                </div>
                <div className="border-t border-white/10 pt-2">
                    <Segmented<SortDir>
                        value={sortDir}
                        onChange={(v) => onChange({ sortDir: v })}
                        options={[
                            { value: 'asc', label: (<><ArrowUp size={13} /> Tăng dần</>) },
                            { value: 'desc', label: (<><ArrowDown size={13} /> Giảm dần</>) },
                        ]}
                    />
                </div>
            </PopoverContent>
        </Popover>
    )
}
