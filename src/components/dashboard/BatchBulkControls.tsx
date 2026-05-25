'use client'

/**
 * [Velox v1.0 — Phase 2 spec 5.2 "Bulk controls"]
 *
 * "Áp dụng cho tất cả" dropdown bar — set 1 field across all rows in batch.
 * Sits above BatchTaskTable.
 *
 * UX flow:
 *   1. User picks field from "Áp dụng cho tất cả" dropdown
 *   2. Field-specific picker appears (date / dropdown / number / autocomplete)
 *   3. User picks value → click "Áp dụng" → bulk update
 *
 * Cleared after each apply so user can do multiple in sequence.
 */

import { useState } from 'react'
import { Layers, ChevronDown } from 'lucide-react'
import { AutocompleteInput } from '@/components/ui/AutocompleteInput'

export type BulkApplyField = 'deadline' | 'assigneeId' | 'type' | 'clientId' | 'jobPriceUSD'

interface ClientOption {
    id: string
    label: string
    parentLabel?: string
}

interface UserOption {
    id: string
    label: string
}

interface Props {
    onApply: (field: BulkApplyField, value: any) => void
    clients: ClientOption[]
    users: UserOption[]
    typeOptions: readonly string[]
}

const FIELD_LABELS: Record<BulkApplyField, string> = {
    deadline: 'Deadline',
    assigneeId: 'Assignee',
    type: 'Type',
    clientId: 'Client',
    jobPriceUSD: 'Price ($)',
}

export default function BatchBulkControls({ onApply, clients, users, typeOptions }: Props) {
    const [field, setField] = useState<BulkApplyField | ''>('')
    const [value, setValue] = useState<any>('')

    const reset = () => {
        setField('')
        setValue('')
    }

    const apply = () => {
        if (!field) return
        if (value === '' || value === null || value === undefined) return
        onApply(field, value)
        reset()
    }

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-zinc-500 mr-1">
                <Layers size={11} />
                Áp dụng cho tất cả
            </div>

            {/* Field selector */}
            <div className="relative">
                <select
                    value={field}
                    onChange={(e) => {
                        const next = e.target.value as BulkApplyField | ''
                        setField(next)
                        setValue('') // reset value when field changes
                    }}
                    className="appearance-none bg-zinc-900/60 border border-white/10 rounded-full pl-3 pr-7 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-violet-500/40 cursor-pointer"
                >
                    <option value="">— Chọn field —</option>
                    {(Object.keys(FIELD_LABELS) as BulkApplyField[]).map((f) => (
                        <option key={f} value={f}>
                            {FIELD_LABELS[f]}
                        </option>
                    ))}
                </select>
                <ChevronDown
                    size={11}
                    className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500"
                />
            </div>

            {/* Field-specific value picker */}
            {field === 'deadline' && (
                <input
                    type="datetime-local"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="bg-zinc-900/60 border border-white/10 rounded-full px-3 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-violet-500/40 font-mono"
                />
            )}

            {field === 'assigneeId' && (
                <div className="relative">
                    <select
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        className="appearance-none bg-zinc-900/60 border border-white/10 rounded-full pl-3 pr-7 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-violet-500/40 cursor-pointer min-w-[140px]"
                    >
                        <option value="">— Pick assignee —</option>
                        <option value="__queue__">— Queue (no assignee) —</option>
                        {users.map((u) => (
                            <option key={u.id} value={u.id}>
                                {u.label}
                            </option>
                        ))}
                    </select>
                    <ChevronDown
                        size={11}
                        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500"
                    />
                </div>
            )}

            {field === 'type' && (
                <div className="relative">
                    <select
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        className="appearance-none bg-zinc-900/60 border border-white/10 rounded-full pl-3 pr-7 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-violet-500/40 cursor-pointer min-w-[120px]"
                    >
                        <option value="">— Pick type —</option>
                        {typeOptions.map((t) => (
                            <option key={t} value={t}>
                                {t}
                            </option>
                        ))}
                    </select>
                    <ChevronDown
                        size={11}
                        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500"
                    />
                </div>
            )}

            {field === 'clientId' && (
                <div className="min-w-[200px]">
                    <AutocompleteInput
                        selectedId={value || ''}
                        onSelect={(id) => setValue(id)}
                        options={clients}
                        placeholder="Pick client..."
                    />
                </div>
            )}

            {field === 'jobPriceUSD' && (
                <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="0.00"
                    className="bg-zinc-900/60 border border-white/10 rounded-full px-3 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-violet-500/40 font-mono w-24"
                />
            )}

            {/* Apply button */}
            {field && (
                <button
                    type="button"
                    onClick={() => {
                        // Resolve special "__queue__" sentinel for assignee → empty string
                        const resolvedValue =
                            field === 'assigneeId' && value === '__queue__' ? '' : value
                        if (resolvedValue === '' && field !== 'assigneeId') return
                        onApply(field, resolvedValue)
                        reset()
                    }}
                    className="px-3 py-1.5 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-bold transition-colors disabled:opacity-40"
                    disabled={!field || (value === '' && field !== 'assigneeId')}
                >
                    Áp dụng
                </button>
            )}
        </div>
    )
}
